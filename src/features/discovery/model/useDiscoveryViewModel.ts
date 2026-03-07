import { useEffect, useMemo, useState } from "react";

import { getOrCreateDeviceIdentity } from "@/features/security";

import { getDiscoveryService } from "./discoveryService";
import { detectRelayUrl } from "./relayAutoDiscovery";
import {
  DiscoveredPeer,
  DiscoveryLogEntry,
  DiscoverySignal,
  DiscoveryStatus,
} from "./types";

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

  const service = useMemo(() => getDiscoveryService(), []);

  const appendLog = (text: string) => {
    setLogs((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          text,
        },
        ...prev,
      ].slice(0, 40),
    );
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
      setLogs((prev) =>
        [
          {
            id: signal.id,
            timestamp: Date.now(),
            text: `IN ${formatSignalLine(signal)}`,
          },
          ...prev,
        ].slice(0, 40),
      );

      if (signal.kind === "ping") {
        service.sendSignal(signal.fromPeerId, "pong", "ack");
      }
    });

    return () => {
      mounted = false;
      unsubscribeStatus();
      unsubscribePeers();
      unsubscribeSignals();
    };
  }, [service]);

  useEffect(() => {
    if (status.relayUrl || isAutoDetectingRelay) {
      return;
    }

    autoDetectRelay().catch(() => undefined);
  }, [status.relayUrl]);

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

    setLogs((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          text: line,
        },
        ...prev,
      ].slice(0, 40),
    );
  };

  const sendChatText = (peerId: string, text: string) => {
    const payload = text.trim();
    if (!payload) {
      return;
    }

    service.sendChatText(peerId, payload);

    const target = peers.find((peer) => peer.peerId === peerId);
    const title = target ? formatPeerLine(target) : peerId.slice(0, 8);

    setLogs((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          text: `OUT CHAT ${title}: ${payload}`,
        },
        ...prev,
      ].slice(0, 40),
    );
  };

  return {
    status,
    relayUrlInput,
    setRelayUrlInput,
    isAutoDetectingRelay,
    peers,
    logs,
    refreshNow,
    applyRelayUrl,
    autoDetectRelay,
    useBrowserLocalTransport,
    sendPing,
    sendChatText,
  };
}
