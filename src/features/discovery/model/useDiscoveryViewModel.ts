import { useEffect, useMemo, useState } from "react";

import { getOrCreateDeviceIdentity } from "@/features/security";

import { getDiscoveryService } from "./discoveryService";
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
  });
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [logs, setLogs] = useState<DiscoveryLogEntry[]>([]);

  const service = useMemo(() => getDiscoveryService(), []);

  useEffect(() => {
    let mounted = true;

    getOrCreateDeviceIdentity()
      .then((identity) => {
        if (!mounted) {
          return;
        }

        service.start(identity);
        setStatus(service.getStatus());
      })
      .catch(() => undefined);

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
      unsubscribePeers();
      unsubscribeSignals();
    };
  }, [service]);

  const refreshNow = async () => {
    const identity = await getOrCreateDeviceIdentity();
    service.start(identity);
    setStatus(service.getStatus());
    setPeers(service.getPeers());
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
    peers,
    logs,
    refreshNow,
    sendPing,
    sendChatText,
  };
}
