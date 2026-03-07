import { useEffect, useMemo, useRef, useState } from "react";

import { getChatById, upsertChat } from "@/entities/chat";
import { Chat, Peer } from "@/entities/messenger";
import { getPeerById, upsertPeer } from "@/entities/peer";
import {
  createPrivateChatId,
  getOrCreateDeviceIdentity,
} from "@/features/security";

import { getDiscoveryService } from "./discoveryService";
import { detectRelayUrl } from "./relayAutoDiscovery";
import {
  DiscoveredPeer,
  DiscoveryLogEntry,
  DiscoveryReliabilityStats,
  DiscoverySignal,
  DiscoveryStatus,
} from "./types";

const RELIABLE_TTL_MS = 15_000;
const RETRY_DELAY_MS = 1_250;
const MAX_ATTEMPTS = 5;
const SEEN_TTL_MS = 60_000;

type PendingReliableMessage = {
  id: string;
  peerId: string;
  payload: string;
  expiresAt: number;
  attempt: number;
  maxAttempts: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

function formatPeerLine(peer: DiscoveredPeer): string {
  return `${peer.displayName} (${peer.peerId.slice(0, 8)})`;
}

function formatSignalLine(signal: DiscoverySignal): string {
  const suffix = signal.payload ? ` ${signal.payload}` : "";
  return `${signal.kind.toUpperCase()} ${signal.fromPeerId.slice(0, 8)} -> ${signal.toPeerId.slice(0, 8)}${suffix}`;
}

export function useDiscoveryViewModel() {
  const [status, setStatus] = useState<DiscoveryStatus>({
    isRunning: false,
    transport: "unavailable",
    scope: "local-network",
    internetRequired: false,
    localPeerId: null,
    relayUrl: null,
    connectionState: "disconnected",
  });
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [logs, setLogs] = useState<DiscoveryLogEntry[]>([]);
  const [relayUrlInput, setRelayUrlInput] = useState("");
  const [isAutoDetectingRelay, setIsAutoDetectingRelay] = useState(false);
  const [reliability, setReliability] = useState<DiscoveryReliabilityStats>({
    pending: 0,
    delivered: 0,
    failed: 0,
    duplicatesDropped: 0,
    acksReceived: 0,
  });

  const service = useMemo(() => getDiscoveryService(), []);
  const pendingRef = useRef<Map<string, PendingReliableMessage>>(new Map());
  const seenRef = useRef<Map<string, number>>(new Map());

  const appendLog = (text: string) => {
    setLogs((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          text,
        },
        ...prev,
      ].slice(0, 60),
    );
  };

  const setPendingCount = () => {
    setReliability((prev) => ({
      ...prev,
      pending: pendingRef.current.size,
    }));
  };

  const clearPendingTimer = (id: string) => {
    const entry = pendingRef.current.get(id);
    if (!entry || !entry.retryTimer) {
      return;
    }

    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  };

  const markAckReceived = (signal: DiscoverySignal) => {
    const ackForId = signal.ackForId;
    if (!ackForId) {
      return;
    }

    const pending = pendingRef.current.get(ackForId);
    if (!pending) {
      return;
    }

    clearPendingTimer(ackForId);
    pendingRef.current.delete(ackForId);
    setReliability((prev) => ({
      pending: pendingRef.current.size,
      delivered: prev.delivered + 1,
      failed: prev.failed,
      duplicatesDropped: prev.duplicatesDropped,
      acksReceived: prev.acksReceived + 1,
    }));
    appendLog(
      `ACK ${ackForId.slice(0, 8)} from ${signal.fromPeerId.slice(0, 8)}`,
    );
  };

  const pruneSeen = () => {
    const now = Date.now();
    seenRef.current.forEach((timestamp, id) => {
      if (now - timestamp > SEEN_TTL_MS) {
        seenRef.current.delete(id);
      }
    });
  };

  const scheduleRetry = (id: string) => {
    const entry = pendingRef.current.get(id);
    if (!entry) {
      return;
    }

    clearPendingTimer(id);

    entry.retryTimer = setTimeout(() => {
      const current = pendingRef.current.get(id);
      if (!current) {
        return;
      }

      const now = Date.now();
      if (now > current.expiresAt || current.attempt >= current.maxAttempts) {
        pendingRef.current.delete(id);
        setReliability((prev) => ({
          pending: pendingRef.current.size,
          delivered: prev.delivered,
          failed: prev.failed + 1,
          duplicatesDropped: prev.duplicatesDropped,
          acksReceived: prev.acksReceived,
        }));
        appendLog(`FAIL ${id.slice(0, 8)} timeout/attempts`);
        return;
      }

      const nextAttempt = current.attempt + 1;
      current.attempt = nextAttempt;

      const ttlLeft = Math.max(500, current.expiresAt - now);
      const sent = service.sendSignal(
        current.peerId,
        "chat-text",
        current.payload,
        {
          id: current.id,
          requiresAck: true,
          ttlMs: ttlLeft,
          expiresAt: current.expiresAt,
          attempt: nextAttempt,
          maxAttempts: current.maxAttempts,
        },
      );

      if (!sent) {
        pendingRef.current.delete(id);
        setReliability((prev) => ({
          pending: pendingRef.current.size,
          delivered: prev.delivered,
          failed: prev.failed + 1,
          duplicatesDropped: prev.duplicatesDropped,
          acksReceived: prev.acksReceived,
        }));
        appendLog(`FAIL ${id.slice(0, 8)} transport unavailable`);
        return;
      }

      appendLog(`RETRY ${id.slice(0, 8)} #${nextAttempt}`);
      setPendingCount();
      scheduleRetry(id);
    }, RETRY_DELAY_MS);
  };

  const sendReliableChatText = (peerId: string, text: string) => {
    const payload = text.trim();
    if (!payload) {
      return;
    }

    const now = Date.now();
    const expiresAt = now + RELIABLE_TTL_MS;

    const sent = service.sendSignal(peerId, "chat-text", payload, {
      requiresAck: true,
      ttlMs: RELIABLE_TTL_MS,
      expiresAt,
      attempt: 1,
      maxAttempts: MAX_ATTEMPTS,
    });

    if (!sent) {
      appendLog(`FAIL send to ${peerId.slice(0, 8)} transport unavailable`);
      setReliability((prev) => ({
        pending: pendingRef.current.size,
        delivered: prev.delivered,
        failed: prev.failed + 1,
        duplicatesDropped: prev.duplicatesDropped,
        acksReceived: prev.acksReceived,
      }));
      return;
    }

    pendingRef.current.set(sent.id, {
      id: sent.id,
      peerId,
      payload,
      expiresAt,
      attempt: 1,
      maxAttempts: MAX_ATTEMPTS,
      retryTimer: null,
    });

    setPendingCount();
    appendLog(`OUT RELIABLE ${peerId.slice(0, 8)} #1: ${payload}`);
    scheduleRetry(sent.id);
  };

  const autoDetectRelay = async () => {
    if (isAutoDetectingRelay) {
      return;
    }

    setIsAutoDetectingRelay(true);
    try {
      const relayUrl = await detectRelayUrl(
        service.getRelayUrl() ?? relayUrlInput,
      );
      if (!relayUrl) {
        appendLog("AUTO RELAY not found");
        return;
      }

      const identity = await getOrCreateDeviceIdentity();
      setRelayUrlInput(relayUrl);
      service.setRelayUrl(relayUrl);
      service.start(identity);
      setStatus(service.getStatus());
      appendLog(`AUTO RELAY ${relayUrl}`);
    } finally {
      setIsAutoDetectingRelay(false);
    }
  };

  const ensureChatForIncomingPairingIntent = async (
    fromPeerId: string,
    payload: string | null,
  ) => {
    const identity = await getOrCreateDeviceIdentity();
    const now = Date.now();
    const chatId = await createPrivateChatId(identity.deviceId, fromPeerId);
    const peerFromNetwork =
      service.getPeers().find((peer) => peer.peerId === fromPeerId) ?? null;
    const payloadName = (payload ?? "").trim();
    const displayName =
      peerFromNetwork?.displayName ??
      (payloadName.length > 0 ? payloadName : "Peer");

    const existingPeer = await getPeerById(fromPeerId);
    const peer: Peer = {
      id: fromPeerId,
      displayName,
      publicKey: peerFromNetwork?.publicKey ?? existingPeer?.publicKey ?? "",
      trustLevel: existingPeer?.trustLevel ?? 0,
      isBlocked: existingPeer?.isBlocked ?? false,
      lastSeenAt: now,
      createdAt: existingPeer?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertPeer(peer);

    const existingChat = await getChatById(chatId);
    const chat: Chat = existingChat
      ? {
          ...existingChat,
          title: existingChat.title ?? displayName,
          updatedAt: now,
          lastMessageAt: existingChat.lastMessageAt ?? now,
        }
      : {
          id: chatId,
          type: "private",
          participantPeerId: fromPeerId,
          title: displayName,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
        };

    await upsertChat(chat);
  };

  useEffect(() => {
    let mounted = true;

    setRelayUrlInput(service.getRelayUrl() ?? "");

    getOrCreateDeviceIdentity()
      .then((identity) => {
        if (!mounted) {
          return;
        }

        service.start(identity);
        setStatus(service.getStatus());
      })
      .catch(() => undefined);

    const unsubscribeStatus = service.subscribeStatus((nextStatus) => {
      setStatus(nextStatus);
    });

    const unsubscribePeers = service.subscribePeers((nextPeers) => {
      setPeers(nextPeers);
    });

    const unsubscribeSignals = service.subscribeSignals((signal) => {
      if (signal.kind === "ack") {
        markAckReceived(signal);
        return;
      }

      if (signal.requiresAck) {
        service.sendSignal(signal.fromPeerId, "ack", null, {
          ackForId: signal.id,
          ttlMs: 4_000,
          expiresAt: Date.now() + 4_000,
          attempt: 1,
          maxAttempts: 1,
        });
      }

      if (signal.kind === "chat-text" && signal.requiresAck) {
        pruneSeen();
        if (seenRef.current.has(signal.id)) {
          setReliability((prev) => ({
            pending: prev.pending,
            delivered: prev.delivered,
            failed: prev.failed,
            duplicatesDropped: prev.duplicatesDropped + 1,
            acksReceived: prev.acksReceived,
          }));
          appendLog(`DROP DUP ${signal.id.slice(0, 8)}`);
          return;
        }

        seenRef.current.set(signal.id, Date.now());
      }

      if (signal.kind === "ping") {
        service.sendSignal(signal.fromPeerId, "pong", "ack");
      }

      if (signal.kind === "pairing-intent") {
        ensureChatForIncomingPairingIntent(signal.fromPeerId, signal.payload)
          .then(() => {
            appendLog(`IN START CHAT ${signal.fromPeerId.slice(0, 8)}`);
          })
          .catch(() => undefined);
        return;
      }

      if (signal.kind === "chat-text") {
        appendLog(
          `IN CHAT ${signal.fromPeerId.slice(0, 8)}: ${signal.payload ?? ""}`,
        );
        return;
      }

      appendLog(`IN ${formatSignalLine(signal)}`);
    });

    return () => {
      mounted = false;
      unsubscribeStatus();
      unsubscribePeers();
      unsubscribeSignals();

      pendingRef.current.forEach((entry) => {
        if (entry.retryTimer) {
          clearTimeout(entry.retryTimer);
        }
      });
      pendingRef.current.clear();
    };
  }, [service]);

  useEffect(() => {
    if (status.relayUrl || isAutoDetectingRelay) {
      return;
    }

    autoDetectRelay().catch(() => undefined);
  }, [status.relayUrl, isAutoDetectingRelay]);

  const refreshNow = async () => {
    const identity = await getOrCreateDeviceIdentity();
    service.start(identity);
    setStatus(service.getStatus());
    setPeers(service.getPeers());
  };

  const applyRelayUrl = async () => {
    const identity = await getOrCreateDeviceIdentity();
    service.setRelayUrl(relayUrlInput);
    service.start(identity);
    setStatus(service.getStatus());
    appendLog(`RELAY SET ${relayUrlInput.trim() || "none"}`);
  };

  const useBrowserLocalTransport = async () => {
    const identity = await getOrCreateDeviceIdentity();
    service.setRelayUrl(null);
    setRelayUrlInput("");
    service.start(identity);
    setStatus(service.getStatus());
    appendLog("RELAY SET browser-local");
  };

  const sendPing = (peerId: string) => {
    service.sendSignal(peerId, "ping", "hello");

    const line = `OUT PING ${peerId.slice(0, 8)} ${formatPeerLine(
      peers.find((peer) => peer.peerId === peerId) ?? {
        peerId,
        displayName: "Peer",
        publicKey: "",
        transport: "broadcast-web-local",
        lastSeenAt: Date.now(),
      },
    )}`;

    appendLog(line);
  };

  const sendChatText = (peerId: string, text: string) => {
    sendReliableChatText(peerId, text);
  };

  const sendPairingIntent = (peerId: string, displayName?: string) => {
    service.sendSignal(peerId, "pairing-intent", displayName ?? null);
    appendLog(`OUT START CHAT ${peerId.slice(0, 8)}`);
  };

  return {
    status,
    relayUrlInput,
    setRelayUrlInput,
    isAutoDetectingRelay,
    reliability,
    peers,
    logs,
    refreshNow,
    applyRelayUrl,
    autoDetectRelay,
    useBrowserLocalTransport,
    sendPing,
    sendChatText,
    sendPairingIntent,
  };
}
