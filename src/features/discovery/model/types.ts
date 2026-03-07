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

export type SignalKind = "ping" | "pong" | "pairing-intent" | "chat-text";

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
