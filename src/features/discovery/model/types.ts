export type DiscoveryTransport =
  | "broadcast-web-local"
  | "lan-relay"
  | "unavailable";

export type DiscoveryScope = "same-device-browser" | "local-network";

export type DiscoveryConnectionState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error";

export interface DiscoveredPeer {
  peerId: string;
  displayName: string;
  publicKey: string;
  transport: DiscoveryTransport;
  lastSeenAt: number;
}

export type SignalKind =
  | "ping"
  | "pong"
  | "pairing-intent"
  | "chat-text"
  | "voice-intent"
  | "file-init"
  | "file-chunk"
  | "file-request-next"
  | "file-complete"
  | "ack";

export interface DiscoverySignal {
  id: string;
  fromPeerId: string;
  toPeerId: string;
  kind: SignalKind;
  payload: string | null;
  sentAt: number;
  requiresAck?: boolean;
  ackForId?: string | null;
  ttlMs?: number;
  expiresAt?: number;
  attempt?: number;
  maxAttempts?: number;
}

export interface DiscoveryReliabilityStats {
  pending: number;
  delivered: number;
  failed: number;
  duplicatesDropped: number;
  acksReceived: number;
}

export interface DiscoveryStatus {
  isRunning: boolean;
  transport: DiscoveryTransport;
  scope: DiscoveryScope;
  internetRequired: false;
  localPeerId: string | null;
  relayUrl: string | null;
  connectionState: DiscoveryConnectionState;
}

export interface DiscoveryLogEntry {
  id: string;
  timestamp: number;
  text: string;
}
