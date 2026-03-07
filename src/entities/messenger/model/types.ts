export type ChatType = "private";

export type MessageKind = "text" | "file" | "system";

export type MessageDeliveryStatus = "queued" | "sent" | "delivered" | "failed";

export type TransferDirection = "upload" | "download";

export type TransferStatus =
  | "queued"
  | "active"
  | "paused"
  | "completed"
  | "failed";

export interface Peer {
  id: string;
  displayName: string;
  publicKey: string;
  trustLevel: number;
  isBlocked: boolean;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Chat {
  id: string;
  type: ChatType;
  participantPeerId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number | null;
}

export interface Message {
  id: string;
  chatId: string;
  senderPeerId: string;
  targetPeerId: string;
  kind: MessageKind;
  body: string;
  ttlMs: number;
  dedupeKey: string;
  status: MessageDeliveryStatus;
  createdAt: number;
  updatedAt: number;
  deliveredAt: number | null;
}

export interface FileTransfer {
  id: string;
  messageId: string;
  chatId: string;
  direction: TransferDirection;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  transferredBytes: number;
  chunkSize: number;
  status: TransferStatus;
  createdAt: number;
  updatedAt: number;
}

export interface StorageStats {
  peers: number;
  chats: number;
  messages: number;
  transfers: number;
}
