export type DiscoveryTransport = "broadcast-web" | "unavailable";

export interface DiscoveredPeer {
  peerId: string;
  displayName: string;
  publicKey: string;
  transport: DiscoveryTransport;
  lastSeenAt: number;
}

export type SignalKind = "ping" | "pong" | "pairing-intent";

export interface DiscoverySignal {
  id: string;
  fromPeerId: string;
  toPeerId: string;
  kind: SignalKind;
  payload: string | null;
  sentAt: number;
}

export interface DiscoveryStatus {
  isRunning: boolean;
  transport: DiscoveryTransport;
  localPeerId: string | null;
}

export interface DiscoveryLogEntry {
  id: string;
  timestamp: number;
  text: string;
}
