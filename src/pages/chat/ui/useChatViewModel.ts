import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import { Chat, FileTransfer, Message, Peer } from "@/entities/messenger";
import { getChatById, listChats, upsertChat } from "@/entities/chat";
import {
  listMessagesByChat,
  updateMessageStatus,
  upsertMessage,
} from "@/entities/message";
import { listPeers, upsertPeer } from "@/entities/peer";
import {
  listTransfersByChat,
  updateTransferProgress,
  upsertTransfer,
} from "@/entities/transfer";
import { getDiscoveryService } from "@/features/discovery";
import {
  createPrivateChatId,
  getOrCreateDeviceIdentity,
} from "@/features/security";

type ChatListItem = Chat & { resolvedTitle: string };

type ChatReliabilityStats = {
  pending: number;
  delivered: number;
  failed: number;
  duplicatesDropped: number;
  acksReceived: number;
};

type PendingReliableMessage = {
  id: string;
  chatId: string;
  peerId: string;
  payload: string;
  expiresAt: number;
  attempt: number;
  maxAttempts: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

type FileInitPayload = {
  transferId: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
};

type FileChunkPayload = {
  transferId: string;
  index: number;
  data: string;
};

type FileRequestNextPayload = {
  transferId: string;
  nextChunkIndex: number;
};

type FileCompletePayload = {
  transferId: string;
};

type OutgoingFileSession = {
  transferId: string;
  messageId: string;
  chatId: string;
  peerId: string;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  chunks: string[];
  started: boolean;
  initAttempt: number;
  initRetryTimer: ReturnType<typeof setTimeout> | null;
};

type IncomingFileSession = {
  transferId: string;
  messageId: string;
  chatId: string;
  peerId: string;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  nextChunkIndex: number;
  receivedBytes: number;
  requestRetryTimer: ReturnType<typeof setTimeout> | null;
};

const RELIABLE_TTL_MS = 15_000;
const RETRY_DELAY_MS = 1_250;
const MAX_ATTEMPTS = 5;
const SEEN_TTL_MS = 60_000;
const FILE_CHUNK_SIZE = 320;
const FILE_REQUEST_RETRY_MS = 1_800;
const FILE_INIT_RETRY_MS = 2_000;
const FILE_INIT_MAX_ATTEMPTS = 5;
const FAVORITES_PEER_ID = "favorites-peer";
const FAVORITES_CHAT_ID = "favorites-chat";
const FAVORITES_TITLE = "Избранное";
const VOICE_INVITE_TEXT = "Голосовой чат: приглашение";

function formatTitle(chat: Chat, peerNameById: Map<string, string>): string {
  if (chat.id === FAVORITES_CHAT_ID) {
    return FAVORITES_TITLE;
  }

  if (chat.title && chat.title.trim().length > 0) {
    return chat.title;
  }

  const peerName = peerNameById.get(chat.participantPeerId);
  if (peerName && peerName.trim().length > 0) {
    return peerName;
  }

  return `Peer ${chat.participantPeerId.slice(0, 8)}`;
}

function makeMessageId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function makeTransferId(): string {
  return `transfer-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function splitToChunks(value: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  let offset = 0;

  while (offset < value.length) {
    chunks.push(value.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }

  if (chunks.length === 0) {
    chunks.push("");
  }

  return chunks;
}

function parseSignalPayload<T>(payload: string | null): T | null {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

function clampIndex(value: number, totalChunks: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value >= totalChunks) {
    return totalChunks;
  }

  return Math.floor(value);
}

function makeFileMessageBody(fileName: string, totalBytes: number): string {
  return `File: ${fileName} (${totalBytes} B)`;
}

function makeVoiceMessageBody(peerName: string | null | undefined): string {
  if (peerName && peerName.trim().length > 0) {
    return `Голосовой чат: приглашение для ${peerName}`;
  }

  return VOICE_INVITE_TEXT;
}

export function useChatViewModel() {
  const service = useMemo(() => getDiscoveryService(), []);
  const pendingRef = useRef<Map<string, PendingReliableMessage>>(new Map());
  const seenRef = useRef<Map<string, number>>(new Map());
  const outgoingFileRef = useRef<Map<string, OutgoingFileSession>>(new Map());
  const incomingFileRef = useRef<Map<string, IncomingFileSession>>(new Map());

  const [isReady, setIsReady] = useState(false);
  const [statusText, setStatusText] = useState("disconnected");
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [draft, setDraft] = useState("");
  const [reliability, setReliability] = useState<ChatReliabilityStats>({
    pending: 0,
    delivered: 0,
    failed: 0,
    duplicatesDropped: 0,
    acksReceived: 0,
  });

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

  const appendSystemMessage = useCallback(
    async (
      chatId: string,
      senderPeerId: string,
      targetPeerId: string,
      body: string,
      status: "sent" | "delivered",
    ) => {
      const now = Date.now();
      const message: Message = {
        id: makeMessageId(),
        chatId,
        senderPeerId,
        targetPeerId,
        kind: "system",
        body,
        ttlMs: RELIABLE_TTL_MS,
        dedupeKey: makeMessageId(),
        status,
        createdAt: now,
        updatedAt: now,
        deliveredAt: status === "delivered" ? now : null,
      };

      await upsertMessage(message);
    },
    [],
  );

  const ensureFavoritesChat = useCallback(async () => {
    if (!localPeerId) {
      return;
    }

    const now = Date.now();
    const favoritesPeer: Peer = {
      id: FAVORITES_PEER_ID,
      displayName: FAVORITES_TITLE,
      publicKey: localPeerId,
      trustLevel: 100,
      isBlocked: false,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await upsertPeer(favoritesPeer);

    const existing = await getChatById(FAVORITES_CHAT_ID);

    const favoritesChat: Chat = existing
      ? {
          ...existing,
          participantPeerId: FAVORITES_PEER_ID,
          title: FAVORITES_TITLE,
          updatedAt: now,
        }
      : {
          id: FAVORITES_CHAT_ID,
          type: "private",
          participantPeerId: FAVORITES_PEER_ID,
          title: FAVORITES_TITLE,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: null,
        };

    await upsertChat(favoritesChat);
  }, [localPeerId]);

  const loadChats = useCallback(async () => {
    await ensureFavoritesChat();

    const [dbChats, dbPeers] = await Promise.all([listChats(), listPeers()]);

    const peerNameById = new Map<string, string>();
    dbPeers.forEach((peer) => {
      peerNameById.set(peer.id, peer.displayName);
    });

    const nextChats = dbChats
      .map((chat) => ({
        ...chat,
        resolvedTitle: formatTitle(chat, peerNameById),
      }))
      .sort((a, b) => {
        if (a.id === FAVORITES_CHAT_ID) {
          return -1;
        }

        if (b.id === FAVORITES_CHAT_ID) {
          return 1;
        }

        const aDate = a.lastMessageAt ?? 0;
        const bDate = b.lastMessageAt ?? 0;

        if (aDate !== bDate) {
          return bDate - aDate;
        }

        return b.updatedAt - a.updatedAt;
      });

    setChats(nextChats);

    setSelectedChatId((current) => {
      if (current && nextChats.some((chat) => chat.id === current)) {
        return current;
      }

      return null;
    });
  }, [ensureFavoritesChat]);

  const loadMessages = useCallback(async (chatId: string) => {
    const dbMessages = await listMessagesByChat(chatId, 150);
    setMessages([...dbMessages].reverse());
  }, []);

  const loadTransfers = useCallback(async (chatId: string) => {
    const dbTransfers = await listTransfersByChat(chatId);
    setTransfers(dbTransfers);
  }, []);

  const refreshAll = useCallback(async () => {
    await loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setTransfers([]);
      return;
    }

    Promise.all([
      loadMessages(selectedChatId),
      loadTransfers(selectedChatId),
    ]).catch(() => undefined);
  }, [selectedChatId, loadMessages, loadTransfers]);

  useEffect(() => {
    if (!localPeerId) {
      return;
    }

    refreshAll().catch(() => undefined);
  }, [localPeerId, refreshAll]);

  const refreshChatData = useCallback(
    async (chatId: string) => {
      if (selectedChatId !== chatId) {
        return;
      }

      await Promise.all([loadMessages(chatId), loadTransfers(chatId)]);
    },
    [selectedChatId, loadMessages, loadTransfers],
  );

  const ensureChatForPeer = useCallback(
    async (peerId: string, peerNameHint?: string) => {
      if (!localPeerId) {
        return null;
      }

      const chatId = await createPrivateChatId(localPeerId, peerId);
      const existing = await getChatById(chatId);
      const now = Date.now();

      if (!existing) {
        const created: Chat = {
          id: chatId,
          type: "private",
          participantPeerId: peerId,
          title: peerNameHint ?? null,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
        };
        await upsertChat(created);
        await loadChats();
        return created;
      }

      if (!existing.title && peerNameHint) {
        const patched: Chat = {
          ...existing,
          title: peerNameHint,
          updatedAt: now,
        };
        await upsertChat(patched);
        await loadChats();
        return patched;
      }

      return existing;
    },
    [localPeerId, loadChats],
  );

  const pruneSeen = () => {
    const now = Date.now();
    seenRef.current.forEach((timestamp, id) => {
      if (now - timestamp > SEEN_TTL_MS) {
        seenRef.current.delete(id);
      }
    });
  };

  const clearOutgoingInitTimer = (transferId: string) => {
    const session = outgoingFileRef.current.get(transferId);
    if (!session || !session.initRetryTimer) {
      return;
    }

    clearTimeout(session.initRetryTimer);
    session.initRetryTimer = null;
  };

  const clearIncomingRequestTimer = (transferId: string) => {
    const session = incomingFileRef.current.get(transferId);
    if (!session || !session.requestRetryTimer) {
      return;
    }

    clearTimeout(session.requestRetryTimer);
    session.requestRetryTimer = null;
  };

  const sendFileInit = useCallback(
    async (transferId: string) => {
      const session = outgoingFileRef.current.get(transferId);
      if (!session) {
        return;
      }

      const payload: FileInitPayload = {
        transferId: session.transferId,
        messageId: session.messageId,
        fileName: session.fileName,
        mimeType: session.mimeType,
        totalBytes: session.totalBytes,
        chunkSize: session.chunkSize,
        totalChunks: session.totalChunks,
      };

      service.sendSignal(session.peerId, "file-init", JSON.stringify(payload));
    },
    [service],
  );

  const markFileTransferFailed = useCallback(
    async (transferId: string) => {
      const session = outgoingFileRef.current.get(transferId);
      if (!session) {
        return;
      }

      clearOutgoingInitTimer(transferId);
      outgoingFileRef.current.delete(transferId);

      const now = Date.now();
      await Promise.all([
        updateTransferProgress(transferId, 0, "failed", now),
        updateMessageStatus(session.messageId, "failed", now, null),
      ]);

      await refreshChatData(session.chatId);
    },
    [refreshChatData],
  );

  const scheduleFileInitRetry = useCallback(
    (transferId: string) => {
      const session = outgoingFileRef.current.get(transferId);
      if (!session || session.started) {
        return;
      }

      clearOutgoingInitTimer(transferId);
      session.initRetryTimer = setTimeout(() => {
        const current = outgoingFileRef.current.get(transferId);
        if (!current || current.started) {
          return;
        }

        if (current.initAttempt >= FILE_INIT_MAX_ATTEMPTS) {
          markFileTransferFailed(transferId).catch(() => undefined);
          return;
        }

        current.initAttempt += 1;
        sendFileInit(transferId)
          .catch(() => undefined)
          .finally(() => {
            scheduleFileInitRetry(transferId);
          });
      }, FILE_INIT_RETRY_MS);
    },
    [markFileTransferFailed, sendFileInit],
  );

  const sendNextChunkRequest = useCallback(
    (session: IncomingFileSession) => {
      const payload: FileRequestNextPayload = {
        transferId: session.transferId,
        nextChunkIndex: session.nextChunkIndex,
      };

      service.sendSignal(
        session.peerId,
        "file-request-next",
        JSON.stringify(payload),
      );
    },
    [service],
  );

  const scheduleChunkRequestRetry = useCallback(
    (transferId: string) => {
      const session = incomingFileRef.current.get(transferId);
      if (!session) {
        return;
      }

      clearIncomingRequestTimer(transferId);
      session.requestRetryTimer = setTimeout(() => {
        const current = incomingFileRef.current.get(transferId);
        if (!current) {
          return;
        }

        sendNextChunkRequest(current);
        scheduleChunkRequestRetry(transferId);
      }, FILE_REQUEST_RETRY_MS);
    },
    [sendNextChunkRequest],
  );

  const markDeliveryFailed = useCallback(
    async (messageId: string, chatId: string) => {
      pendingRef.current.delete(messageId);
      const now = Date.now();
      await updateMessageStatus(messageId, "failed", now, null);
      setReliability((prev) => ({
        pending: pendingRef.current.size,
        delivered: prev.delivered,
        failed: prev.failed + 1,
        duplicatesDropped: prev.duplicatesDropped,
        acksReceived: prev.acksReceived,
      }));
      if (selectedChatId === chatId) {
        await loadMessages(chatId);
      }
    },
    [selectedChatId, loadMessages],
  );

  const scheduleRetry = useCallback(
    (id: string) => {
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
          markDeliveryFailed(current.id, current.chatId).catch(() => undefined);
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
          markDeliveryFailed(current.id, current.chatId).catch(() => undefined);
          return;
        }

        updateMessageStatus(current.id, "sent", now, null)
          .then(() => {
            if (selectedChatId === current.chatId) {
              return loadMessages(current.chatId);
            }
            return undefined;
          })
          .catch(() => undefined)
          .finally(() => {
            setPendingCount();
            scheduleRetry(id);
          });
      }, RETRY_DELAY_MS);
    },
    [markDeliveryFailed, selectedChatId, service, loadMessages],
  );

  const handleAck = useCallback(
    async (ackForId: string) => {
      const pending = pendingRef.current.get(ackForId);
      if (!pending) {
        return;
      }

      clearPendingTimer(ackForId);
      pendingRef.current.delete(ackForId);

      const now = Date.now();
      await updateMessageStatus(ackForId, "delivered", now, now);
      setReliability((prev) => ({
        pending: pendingRef.current.size,
        delivered: prev.delivered + 1,
        failed: prev.failed,
        duplicatesDropped: prev.duplicatesDropped,
        acksReceived: prev.acksReceived + 1,
      }));

      if (selectedChatId === pending.chatId) {
        await loadMessages(pending.chatId);
      }
    },
    [selectedChatId, loadMessages],
  );

  const handleIncomingChat = useCallback(
    async (
      signalId: string,
      fromPeerId: string,
      payload: string | null,
      sentAt: number,
      ttlMs?: number,
      requiresAck?: boolean,
    ) => {
      if (!localPeerId) {
        return;
      }

      pruneSeen();
      if (requiresAck && seenRef.current.has(signalId)) {
        setReliability((prev) => ({
          pending: prev.pending,
          delivered: prev.delivered,
          failed: prev.failed,
          duplicatesDropped: prev.duplicatesDropped + 1,
          acksReceived: prev.acksReceived,
        }));
        return;
      }

      if (requiresAck) {
        seenRef.current.set(signalId, Date.now());
      }

      const text = (payload ?? "").trim();
      if (!text) {
        return;
      }

      const peerNameHint =
        service.getPeers().find((peer) => peer.peerId === fromPeerId)
          ?.displayName ?? null;

      const chat = await ensureChatForPeer(
        fromPeerId,
        peerNameHint ?? undefined,
      );
      if (!chat) {
        return;
      }

      const now = Date.now();
      const message: Message = {
        id: signalId,
        chatId: chat.id,
        senderPeerId: fromPeerId,
        targetPeerId: localPeerId,
        kind: "text",
        body: text,
        ttlMs: ttlMs ?? RELIABLE_TTL_MS,
        dedupeKey: signalId,
        status: "delivered",
        createdAt: sentAt || now,
        updatedAt: now,
        deliveredAt: now,
      };

      await upsertMessage(message);
      await loadChats();

      if (selectedChatId === chat.id) {
        await loadMessages(chat.id);
      }
    },
    [
      localPeerId,
      ensureChatForPeer,
      loadChats,
      selectedChatId,
      loadMessages,
      service,
    ],
  );

  const handleIncomingVoiceIntent = useCallback(
    async (fromPeerId: string) => {
      if (!localPeerId) {
        return;
      }

      const peerNameHint =
        service.getPeers().find((peer) => peer.peerId === fromPeerId)
          ?.displayName ?? null;

      const chat = await ensureChatForPeer(
        fromPeerId,
        peerNameHint ?? undefined,
      );
      if (!chat) {
        return;
      }

      await appendSystemMessage(
        chat.id,
        fromPeerId,
        localPeerId,
        makeVoiceMessageBody(peerNameHint),
        "delivered",
      );

      await loadChats();

      if (selectedChatId === chat.id) {
        await loadMessages(chat.id);
      }
    },
    [
      appendSystemMessage,
      ensureChatForPeer,
      loadChats,
      loadMessages,
      localPeerId,
      selectedChatId,
      service,
    ],
  );

  const handleIncomingPairingIntent = useCallback(
    async (fromPeerId: string, payload: string | null) => {
      if (!localPeerId) {
        return;
      }

      const payloadName = (payload ?? "").trim();
      const peerNameHint =
        service.getPeers().find((peer) => peer.peerId === fromPeerId)
          ?.displayName ?? (payloadName.length > 0 ? payloadName : null);

      const chat = await ensureChatForPeer(
        fromPeerId,
        peerNameHint ?? undefined,
      );
      if (!chat) {
        return;
      }

      await loadChats();
    },
    [ensureChatForPeer, loadChats, localPeerId, service],
  );

  const handleIncomingFileInit = useCallback(
    async (
      fromPeerId: string,
      payload: string | null,
      signalSentAt: number,
    ) => {
      if (!localPeerId) {
        return;
      }

      const meta = parseSignalPayload<FileInitPayload>(payload);
      if (!meta) {
        return;
      }

      const chat = await ensureChatForPeer(fromPeerId);
      if (!chat) {
        return;
      }

      const now = Date.now();
      const message: Message = {
        id: meta.messageId,
        chatId: chat.id,
        senderPeerId: fromPeerId,
        targetPeerId: localPeerId,
        kind: "file",
        body: makeFileMessageBody(meta.fileName, meta.totalBytes),
        ttlMs: RELIABLE_TTL_MS,
        dedupeKey: meta.messageId,
        status: "delivered",
        createdAt: signalSentAt || now,
        updatedAt: now,
        deliveredAt: now,
      };

      await upsertMessage(message);

      const existing = incomingFileRef.current.get(meta.transferId);
      const session: IncomingFileSession = existing ?? {
        transferId: meta.transferId,
        messageId: meta.messageId,
        chatId: chat.id,
        peerId: fromPeerId,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        totalBytes: meta.totalBytes,
        chunkSize: meta.chunkSize,
        totalChunks: meta.totalChunks,
        nextChunkIndex: 0,
        receivedBytes: 0,
        requestRetryTimer: null,
      };

      incomingFileRef.current.set(meta.transferId, session);

      const transfer: FileTransfer = {
        id: meta.transferId,
        messageId: meta.messageId,
        chatId: chat.id,
        direction: "download",
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        totalBytes: meta.totalBytes,
        transferredBytes: session.receivedBytes,
        chunkSize: meta.chunkSize,
        status:
          session.receivedBytes >= meta.totalBytes ? "completed" : "active",
        createdAt: now,
        updatedAt: now,
      };

      await upsertTransfer(transfer);
      await loadChats();
      await refreshChatData(chat.id);

      sendNextChunkRequest(session);
      scheduleChunkRequestRetry(session.transferId);
    },
    [
      localPeerId,
      ensureChatForPeer,
      loadChats,
      refreshChatData,
      sendNextChunkRequest,
      scheduleChunkRequestRetry,
    ],
  );

  const handleIncomingFileChunk = useCallback(
    async (fromPeerId: string, payload: string | null) => {
      const data = parseSignalPayload<FileChunkPayload>(payload);
      if (!data) {
        return;
      }

      const session = incomingFileRef.current.get(data.transferId);
      if (!session) {
        return;
      }

      if (session.peerId !== fromPeerId) {
        return;
      }

      if (data.index !== session.nextChunkIndex) {
        sendNextChunkRequest(session);
        scheduleChunkRequestRetry(session.transferId);
        return;
      }

      clearIncomingRequestTimer(session.transferId);

      session.nextChunkIndex += 1;
      session.receivedBytes = Math.min(
        session.totalBytes,
        session.receivedBytes + data.data.length,
      );

      const now = Date.now();

      if (
        session.nextChunkIndex >= session.totalChunks ||
        session.receivedBytes >= session.totalBytes
      ) {
        await updateTransferProgress(
          session.transferId,
          session.totalBytes,
          "completed",
          now,
        );

        incomingFileRef.current.delete(session.transferId);

        service.sendSignal(
          session.peerId,
          "file-complete",
          JSON.stringify({
            transferId: session.transferId,
          } satisfies FileCompletePayload),
        );

        await refreshChatData(session.chatId);
        return;
      }

      await updateTransferProgress(
        session.transferId,
        session.receivedBytes,
        "active",
        now,
      );

      await refreshChatData(session.chatId);

      sendNextChunkRequest(session);
      scheduleChunkRequestRetry(session.transferId);
    },
    [refreshChatData, scheduleChunkRequestRetry, sendNextChunkRequest, service],
  );

  const handleFileRequestNext = useCallback(
    async (payload: string | null) => {
      const request = parseSignalPayload<FileRequestNextPayload>(payload);
      if (!request) {
        return;
      }

      const session = outgoingFileRef.current.get(request.transferId);
      if (!session) {
        return;
      }

      if (!session.started) {
        session.started = true;
        clearOutgoingInitTimer(session.transferId);
      }

      const nextIndex = clampIndex(request.nextChunkIndex, session.totalChunks);

      if (nextIndex >= session.totalChunks) {
        service.sendSignal(
          session.peerId,
          "file-complete",
          JSON.stringify({
            transferId: session.transferId,
          } satisfies FileCompletePayload),
        );
        return;
      }

      const chunk = session.chunks[nextIndex] ?? "";

      service.sendSignal(
        session.peerId,
        "file-chunk",
        JSON.stringify({
          transferId: session.transferId,
          index: nextIndex,
          data: chunk,
        } satisfies FileChunkPayload),
      );

      const confirmedBytes = Math.min(
        session.totalBytes,
        Math.max(0, nextIndex * session.chunkSize),
      );
      await updateTransferProgress(
        session.transferId,
        confirmedBytes,
        "active",
        Date.now(),
      );
      await refreshChatData(session.chatId);
    },
    [refreshChatData, service],
  );

  const handleFileComplete = useCallback(
    async (payload: string | null) => {
      const complete = parseSignalPayload<FileCompletePayload>(payload);
      if (!complete) {
        return;
      }

      const session = outgoingFileRef.current.get(complete.transferId);
      if (!session) {
        return;
      }

      clearOutgoingInitTimer(session.transferId);
      outgoingFileRef.current.delete(session.transferId);

      const now = Date.now();
      await Promise.all([
        updateTransferProgress(
          session.transferId,
          session.totalBytes,
          "completed",
          now,
        ),
        updateMessageStatus(session.messageId, "delivered", now, now),
      ]);

      await refreshChatData(session.chatId);
    },
    [refreshChatData],
  );

  useEffect(() => {
    let mounted = true;

    getOrCreateDeviceIdentity()
      .then((identity) => {
        if (!mounted) {
          return;
        }

        setLocalPeerId(identity.deviceId);
        service.start(identity);
        const nextStatus = service.getStatus();
        setStatusText(nextStatus.connectionState);
        setRelayUrl(nextStatus.relayUrl);

        refreshAll()
          .then(() => {
            setIsReady(true);
          })
          .catch(() => {
            setIsReady(true);
          });
      })
      .catch(() => {
        if (mounted) {
          setIsReady(true);
        }
      });

    const unsubscribeStatus = service.subscribeStatus((nextStatus) => {
      setStatusText(nextStatus.connectionState);
      setRelayUrl(nextStatus.relayUrl);
      setLocalPeerId(nextStatus.localPeerId);
    });

    const unsubscribeSignals = service.subscribeSignals((signal) => {
      if (signal.kind === "ack") {
        const ackForId = signal.ackForId;
        if (ackForId) {
          handleAck(ackForId).catch(() => undefined);
        }
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

      if (signal.kind === "chat-text") {
        handleIncomingChat(
          signal.id,
          signal.fromPeerId,
          signal.payload,
          signal.sentAt,
          signal.ttlMs,
          signal.requiresAck,
        ).catch(() => undefined);
        return;
      }

      if (signal.kind === "voice-intent") {
        handleIncomingVoiceIntent(signal.fromPeerId).catch(() => undefined);
        return;
      }

      if (signal.kind === "pairing-intent") {
        handleIncomingPairingIntent(signal.fromPeerId, signal.payload).catch(
          () => undefined,
        );
        return;
      }

      if (signal.kind === "file-init") {
        handleIncomingFileInit(
          signal.fromPeerId,
          signal.payload,
          signal.sentAt,
        ).catch(() => undefined);
        return;
      }

      if (signal.kind === "file-chunk") {
        handleIncomingFileChunk(signal.fromPeerId, signal.payload).catch(
          () => undefined,
        );
        return;
      }

      if (signal.kind === "file-request-next") {
        handleFileRequestNext(signal.payload).catch(() => undefined);
        return;
      }

      if (signal.kind === "file-complete") {
        handleFileComplete(signal.payload).catch(() => undefined);
      }
    });

    return () => {
      mounted = false;
      unsubscribeStatus();
      unsubscribeSignals();
      pendingRef.current.forEach((entry) => {
        if (entry.retryTimer) {
          clearTimeout(entry.retryTimer);
        }
      });
      pendingRef.current.clear();

      outgoingFileRef.current.forEach((session) => {
        if (session.initRetryTimer) {
          clearTimeout(session.initRetryTimer);
        }
      });
      outgoingFileRef.current.clear();

      incomingFileRef.current.forEach((session) => {
        if (session.requestRetryTimer) {
          clearTimeout(session.requestRetryTimer);
        }
      });
      incomingFileRef.current.clear();
    };
  }, [
    service,
    handleAck,
    handleIncomingChat,
    handleIncomingVoiceIntent,
    handleIncomingPairingIntent,
    handleIncomingFileInit,
    handleIncomingFileChunk,
    handleFileRequestNext,
    handleFileComplete,
    refreshAll,
  ]);

  const selectChat = (chatId: string) => {
    setSelectedChatId(chatId);
  };

  const closeChat = () => {
    setSelectedChatId(null);
  };

  const startChatWithPeer = async (peerId: string, peerNameHint?: string) => {
    const chat = await ensureChatForPeer(peerId, peerNameHint);
    if (!chat) {
      return false;
    }

    if (localPeerId && chat.participantPeerId !== localPeerId) {
      service.sendSignal(
        chat.participantPeerId,
        "pairing-intent",
        (peerNameHint ?? "").trim() || null,
      );
    }

    setSelectedChatId(chat.id);
    await Promise.all([loadMessages(chat.id), loadTransfers(chat.id)]);
    return true;
  };

  const refresh = async () => {
    await refreshAll();
    if (selectedChatId) {
      await Promise.all([
        loadMessages(selectedChatId),
        loadTransfers(selectedChatId),
      ]);
    }
  };

  const sendFile = async () => {
    if (!selectedChatId || !localPeerId) {
      return;
    }

    const chat = chats.find((item) => item.id === selectedChatId);
    if (!chat) {
      return;
    }

    const picked = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (picked.canceled || picked.assets.length === 0) {
      return;
    }

    const asset = picked.assets[0];
    const fileName = asset.name || `file-${Date.now()}`;
    const mimeType = asset.mimeType || "application/octet-stream";

    const content = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!content) {
      return;
    }

    const now = Date.now();
    const messageId = makeMessageId();
    const transferId = makeTransferId();
    const chunkSize = FILE_CHUNK_SIZE;
    const chunks = splitToChunks(content, chunkSize);
    const totalChunks = chunks.length;
    const encodedBytes = content.length;
    const displayBytes =
      typeof asset.size === "number" && asset.size > 0
        ? asset.size
        : encodedBytes;
    const isFavorites = chat.id === FAVORITES_CHAT_ID;

    const message: Message = {
      id: messageId,
      chatId: chat.id,
      senderPeerId: localPeerId,
      targetPeerId: isFavorites ? localPeerId : chat.participantPeerId,
      kind: "file",
      body: makeFileMessageBody(fileName, displayBytes),
      ttlMs: RELIABLE_TTL_MS,
      dedupeKey: messageId,
      status: isFavorites ? "delivered" : "sent",
      createdAt: now,
      updatedAt: now,
      deliveredAt: isFavorites ? now : null,
    };

    const transfer: FileTransfer = {
      id: transferId,
      messageId,
      chatId: chat.id,
      direction: "upload",
      fileName,
      mimeType,
      totalBytes: encodedBytes,
      transferredBytes: isFavorites ? encodedBytes : 0,
      chunkSize,
      status: isFavorites ? "completed" : "active",
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([upsertMessage(message), upsertTransfer(transfer)]);
    await loadChats();
    await refreshChatData(chat.id);

    if (isFavorites) {
      return;
    }

    const session: OutgoingFileSession = {
      transferId,
      messageId,
      chatId: chat.id,
      peerId: chat.participantPeerId,
      fileName,
      mimeType,
      totalBytes: encodedBytes,
      chunkSize,
      totalChunks,
      chunks,
      started: false,
      initAttempt: 1,
      initRetryTimer: null,
    };

    outgoingFileRef.current.set(transferId, session);
    await sendFileInit(transferId);
    scheduleFileInitRetry(transferId);
  };

  const sendVoiceInvite = async () => {
    if (!selectedChatId || !localPeerId) {
      return;
    }

    const chat = chats.find((item) => item.id === selectedChatId);
    if (!chat) {
      return;
    }

    const isFavorites = chat.id === FAVORITES_CHAT_ID;

    await appendSystemMessage(
      chat.id,
      localPeerId,
      isFavorites ? localPeerId : chat.participantPeerId,
      makeVoiceMessageBody(chat.resolvedTitle),
      isFavorites ? "delivered" : "sent",
    );

    await loadChats();
    await loadMessages(chat.id);

    if (isFavorites) {
      return;
    }

    service.sendSignal(
      chat.participantPeerId,
      "voice-intent",
      VOICE_INVITE_TEXT,
    );
  };

  const sendMessage = async () => {
    if (!selectedChatId || !localPeerId) {
      return;
    }

    const payload = draft.trim();
    if (!payload) {
      return;
    }

    const chat = chats.find((item) => item.id === selectedChatId);
    if (!chat) {
      return;
    }

    const now = Date.now();
    const expiresAt = now + RELIABLE_TTL_MS;
    const id = makeMessageId();
    const isFavorites = chat.id === FAVORITES_CHAT_ID;

    const message: Message = {
      id,
      chatId: chat.id,
      senderPeerId: localPeerId,
      targetPeerId: isFavorites ? localPeerId : chat.participantPeerId,
      kind: "text",
      body: payload,
      ttlMs: RELIABLE_TTL_MS,
      dedupeKey: id,
      status: isFavorites ? "delivered" : "sent",
      createdAt: now,
      updatedAt: now,
      deliveredAt: isFavorites ? now : null,
    };

    await upsertMessage(message);
    setDraft("");
    await loadChats();
    await loadMessages(chat.id);

    if (isFavorites) {
      return;
    }

    const sent = service.sendSignal(
      chat.participantPeerId,
      "chat-text",
      payload,
      {
        id,
        requiresAck: true,
        ttlMs: RELIABLE_TTL_MS,
        expiresAt,
        attempt: 1,
        maxAttempts: MAX_ATTEMPTS,
      },
    );

    if (!sent) {
      await markDeliveryFailed(id, chat.id);
      return;
    }

    pendingRef.current.set(id, {
      id,
      chatId: chat.id,
      peerId: chat.participantPeerId,
      payload,
      expiresAt,
      attempt: 1,
      maxAttempts: MAX_ATTEMPTS,
      retryTimer: null,
    });

    setPendingCount();
    scheduleRetry(id);
  };

  return {
    isReady,
    statusText,
    relayUrl,
    localPeerId,
    chats,
    selectedChatId,
    messages,
    transfers,
    draft,
    setDraft,
    reliability,
    selectChat,
    closeChat,
    startChatWithPeer,
    refresh,
    sendMessage,
    sendFile,
    sendVoiceInvite,
  };
}
