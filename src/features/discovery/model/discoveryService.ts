import { DeviceIdentity } from "@/features/security";

import {
  DiscoveredPeer,
  DiscoveryConnectionState,
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
    }
  | {
      type: "peer-offline";
      peerId: string;
      sentAt: number;
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

type SignalSendOptions = {
  id?: string;
  requiresAck?: boolean;
  ackForId?: string | null;
  ttlMs?: number;
  expiresAt?: number;
  attempt?: number;
  maxAttempts?: number;
};

class DiscoveryService {
  private channel: BroadcastChannelLike | null = null;
  private socket: WebSocket | null = null;
  private relayUrl: string | null = null;
  private connectionState: DiscoveryConnectionState = "disconnected";
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private identity: DeviceIdentity | null = null;
  private peers = new Map<string, DiscoveredPeer>();
  private peerSubscribers = new Set<(peers: DiscoveredPeer[]) => void>();
  private signalSubscribers = new Set<(signal: DiscoverySignal) => void>();
  private statusSubscribers = new Set<(status: DiscoveryStatus) => void>();

  setRelayUrl(url: string | null): void {
    const value = (url ?? "").trim();
    this.relayUrl = value.length > 0 ? value : null;

    if (this.identity && this.announceTimer) {
      this.reconnectTransport();
    }

    this.emitStatus();
  }

  getRelayUrl(): string | null {
    return this.relayUrl;
  }

  start(identity: DeviceIdentity): void {
    this.identity = identity;

    this.ensureTransport();
    this.sendAnnounce();

    if (!this.announceTimer) {
      this.announceTimer = setInterval(() => {
        this.ensureTransport();
        this.sendAnnounce();
      }, ANNOUNCE_INTERVAL_MS);
    }

    if (!this.pruneTimer) {
      this.pruneTimer = setInterval(() => {
        this.pruneStalePeers();
      }, PRUNE_INTERVAL_MS);
    }

    this.emitStatus();
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

    this.closeTransport();
    this.connectionState = "disconnected";
    this.peers.clear();
    this.emitPeers();
    this.emitStatus();
  }

  getStatus(): DiscoveryStatus {
    const hasRelay = this.relayUrl !== null;

    return {
      isRunning: this.announceTimer !== null,
      transport: hasRelay
        ? this.socket && this.socket.readyState === 1
          ? "lan-relay"
          : "unavailable"
        : this.channel
          ? "broadcast-web-local"
          : "unavailable",
      scope: hasRelay ? "local-network" : "same-device-browser",
      internetRequired: false,
      localPeerId: this.identity?.deviceId ?? null,
      relayUrl: this.relayUrl,
      connectionState: this.connectionState,
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

  subscribeStatus(listener: (status: DiscoveryStatus) => void): () => void {
    this.statusSubscribers.add(listener);
    listener(this.getStatus());
    return () => {
      this.statusSubscribers.delete(listener);
    };
  }

  sendSignal(
    toPeerId: string,
    kind: SignalKind,
    payload: string | null = null,
    options?: SignalSendOptions,
  ): DiscoverySignal | null {
    if (!this.identity) {
      return null;
    }

    const signal: DiscoverySignal = {
      id: options?.id ?? this.makeId(),
      fromPeerId: this.identity.deviceId,
      toPeerId,
      kind,
      payload,
      sentAt: Date.now(),
      requiresAck: options?.requiresAck,
      ackForId: options?.ackForId,
      ttlMs: options?.ttlMs,
      expiresAt: options?.expiresAt,
      attempt: options?.attempt,
      maxAttempts: options?.maxAttempts,
    };

    this.sendWireMessage({
      type: "signal",
      signal,
    });

    return signal;
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

  private connectRelay(): void {
    if (!this.relayUrl || this.socket) {
      return;
    }

    try {
      this.connectionState = "connecting";
      this.emitStatus();

      const socket = new WebSocket(this.relayUrl);
      this.socket = socket;

      socket.onopen = () => {
        this.connectionState = "connected";
        this.emitStatus();
        this.sendAnnounce();
      };

      socket.onmessage = (event) => {
        const data =
          typeof event.data === "string" ? event.data : String(event.data);
        this.handleWireMessage(data);
      };

      socket.onerror = () => {
        this.connectionState = "error";
        this.emitStatus();
      };

      socket.onclose = () => {
        this.socket = null;
        this.connectionState = "disconnected";
        this.emitStatus();
      };
    } catch {
      this.connectionState = "error";
      this.emitStatus();
    }
  }

  private ensureTransport(): void {
    if (this.relayUrl) {
      if (this.channel) {
        this.channel.close();
        this.channel = null;
      }

      this.connectRelay();
      return;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connectionState = "disconnected";
    }

    if (!this.channel) {
      this.channel = this.createChannel();
      if (this.channel) {
        this.channel.onmessage = (event) => {
          this.handleWireMessage(event.data);
        };
        this.connectionState = "connected";
      } else {
        this.connectionState = "disconnected";
      }
      this.emitStatus();
    }
  }

  private closeTransport(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private reconnectTransport(): void {
    this.closeTransport();
    this.connectionState = "disconnected";
    this.ensureTransport();
    this.sendAnnounce();
  }

  private sendWireMessage(message: DiscoveryWireMessage): void {
    const raw = JSON.stringify(message);

    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(raw);
      return;
    }

    if (this.channel) {
      this.channel.postMessage(raw);
    }
  }

  private sendAnnounce(): void {
    if (!this.identity) {
      return;
    }

    this.sendWireMessage({
      type: "announce",
      peerId: this.identity.deviceId,
      displayName: this.identity.displayName,
      publicKey: this.identity.publicKey,
      sentAt: Date.now(),
    });
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
        transport: this.relayUrl ? "lan-relay" : "broadcast-web-local",
        lastSeenAt: Date.now(),
      });
      this.emitPeers();
      return;
    }

    if (parsed.type === "peer-offline") {
      if (this.peers.delete(parsed.peerId)) {
        this.emitPeers();
      }
      return;
    }

    if (parsed.type === "signal") {
      if (parsed.signal.expiresAt && Date.now() > parsed.signal.expiresAt) {
        return;
      }

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

  private emitStatus(): void {
    const status = this.getStatus();
    this.statusSubscribers.forEach((subscriber) => subscriber(status));
  }

  private makeId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}

const singleton = new DiscoveryService();

export function getDiscoveryService(): DiscoveryService {
  return singleton;
}
