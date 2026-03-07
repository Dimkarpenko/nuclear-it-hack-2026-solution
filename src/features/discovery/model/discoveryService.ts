import { DeviceIdentity } from "@/features/security";

import {
  DiscoveredPeer,
  DiscoverySignal,
  DiscoveryStatus,
  SignalKind,
} from "./types";

type DiscoveryWireMessage =
  | {
      type: "announce";
      peerId: string;
      displayName: string;
      publicKey: string;
      sentAt: number;
    }
  | {
      type: "signal";
      signal: DiscoverySignal;
    };

type MessageEventLike = { data: string };

type BroadcastChannelLike = {
  onmessage: ((event: MessageEventLike) => void) | null;
  postMessage: (message: string) => void;
  close: () => void;
};

type BroadcastChannelCtor = new (name: string) => BroadcastChannelLike;

const CHANNEL_NAME = "hex.mesh.discovery.v1";
const PEER_TTL_MS = 20_000;
const ANNOUNCE_INTERVAL_MS = 5_000;
const PRUNE_INTERVAL_MS = 6_000;

class DiscoveryService {
  private channel: BroadcastChannelLike | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private identity: DeviceIdentity | null = null;
  private peers = new Map<string, DiscoveredPeer>();
  private peerSubscribers = new Set<(peers: DiscoveredPeer[]) => void>();
  private signalSubscribers = new Set<(signal: DiscoverySignal) => void>();

  start(identity: DeviceIdentity): void {
    this.identity = identity;

    if (!this.channel) {
      this.channel = this.createChannel();
      if (this.channel) {
        this.channel.onmessage = (event) => {
          this.handleWireMessage(event.data);
        };
      }
    }

    this.sendAnnounce();

    if (!this.announceTimer) {
      this.announceTimer = setInterval(() => {
        this.sendAnnounce();
      }, ANNOUNCE_INTERVAL_MS);
    }

    if (!this.pruneTimer) {
      this.pruneTimer = setInterval(() => {
        this.pruneStalePeers();
      }, PRUNE_INTERVAL_MS);
    }
  }

  stop(): void {
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }

    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.peers.clear();
    this.emitPeers();
  }

  getStatus(): DiscoveryStatus {
    return {
      isRunning: this.announceTimer !== null,
      transport: this.channel ? "broadcast-web-local" : "unavailable",
      scope: this.channel ? "same-device-browser" : "local-network",
      internetRequired: false,
      localPeerId: this.identity?.deviceId ?? null,
    };
  }

  getPeers(): DiscoveredPeer[] {
    return Array.from(this.peers.values()).sort(
      (a, b) => b.lastSeenAt - a.lastSeenAt,
    );
  }

  subscribePeers(listener: (peers: DiscoveredPeer[]) => void): () => void {
    this.peerSubscribers.add(listener);
    listener(this.getPeers());
    return () => {
      this.peerSubscribers.delete(listener);
    };
  }

  subscribeSignals(listener: (signal: DiscoverySignal) => void): () => void {
    this.signalSubscribers.add(listener);
    return () => {
      this.signalSubscribers.delete(listener);
    };
  }

  sendSignal(
    toPeerId: string,
    kind: SignalKind,
    payload: string | null = null,
  ): void {
    if (!this.channel || !this.identity) {
      return;
    }

    const signal: DiscoverySignal = {
      id: this.makeId(),
      fromPeerId: this.identity.deviceId,
      toPeerId,
      kind,
      payload,
      sentAt: Date.now(),
    };

    const wire: DiscoveryWireMessage = {
      type: "signal",
      signal,
    };

    this.channel.postMessage(JSON.stringify(wire));
  }

  sendChatText(toPeerId: string, text: string): void {
    const payload = text.trim();
    if (!payload) {
      return;
    }

    this.sendSignal(toPeerId, "chat-text", payload);
  }

  private createChannel(): BroadcastChannelLike | null {
    const candidate = globalThis as { BroadcastChannel?: BroadcastChannelCtor };
    const Ctor = candidate.BroadcastChannel;

    if (!Ctor) {
      return null;
    }

    try {
      return new Ctor(CHANNEL_NAME);
    } catch {
      return null;
    }
  }

  private sendAnnounce(): void {
    if (!this.channel || !this.identity) {
      return;
    }

    const wire: DiscoveryWireMessage = {
      type: "announce",
      peerId: this.identity.deviceId,
      displayName: this.identity.displayName,
      publicKey: this.identity.publicKey,
      sentAt: Date.now(),
    };

    this.channel.postMessage(JSON.stringify(wire));
  }

  private handleWireMessage(raw: string): void {
    if (!this.identity) {
      return;
    }

    let parsed: DiscoveryWireMessage;

    try {
      parsed = JSON.parse(raw) as DiscoveryWireMessage;
    } catch {
      return;
    }

    if (parsed.type === "announce") {
      if (parsed.peerId === this.identity.deviceId) {
        return;
      }

      this.peers.set(parsed.peerId, {
        peerId: parsed.peerId,
        displayName: parsed.displayName,
        publicKey: parsed.publicKey,
        transport: "broadcast-web-local",
        lastSeenAt: Date.now(),
      });
      this.emitPeers();
      return;
    }

    if (parsed.type === "signal") {
      if (parsed.signal.toPeerId !== this.identity.deviceId) {
        return;
      }

      this.signalSubscribers.forEach((subscriber) => subscriber(parsed.signal));
    }
  }

  private pruneStalePeers(): void {
    const now = Date.now();
    let changed = false;

    this.peers.forEach((peer, key) => {
      if (now - peer.lastSeenAt > PEER_TTL_MS) {
        this.peers.delete(key);
        changed = true;
      }
    });

    if (changed) {
      this.emitPeers();
    }
  }

  private emitPeers(): void {
    const peers = this.getPeers();
    this.peerSubscribers.forEach((subscriber) => subscriber(peers));
  }

  private makeId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}

const singleton = new DiscoveryService();

export function getDiscoveryService(): DiscoveryService {
  return singleton;
}
