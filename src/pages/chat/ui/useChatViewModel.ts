import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Chat, Message } from "@/entities/messenger";
import { getChatById, listChats, upsertChat } from "@/entities/chat";
import {
  listMessagesByChat,
  updateMessageStatus,
  upsertMessage,
} from "@/entities/message";
import { listPeers } from "@/entities/peer";
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

const RELIABLE_TTL_MS = 15_000;
const RETRY_DELAY_MS = 1_250;
const MAX_ATTEMPTS = 5;
const SEEN_TTL_MS = 60_000;

function formatTitle(chat: Chat, peerNameById: Map<string, string>): string {
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

export function useChatViewModel() {
  const service = useMemo(() => getDiscoveryService(), []);
  const pendingRef = useRef<Map<string, PendingReliableMessage>>(new Map());
  const seenRef = useRef<Map<string, number>>(new Map());

  const [isReady, setIsReady] = useState(false);
  const [statusText, setStatusText] = useState("disconnected");
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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

  const loadChats = useCallback(async () => {
    const [dbChats, dbPeers] = await Promise.all([listChats(), listPeers()]);

    const peerNameById = new Map<string, string>();
    dbPeers.forEach((peer) => {
      peerNameById.set(peer.id, peer.displayName);
    });

    const nextChats = dbChats.map((chat) => ({
      ...chat,
      resolvedTitle: formatTitle(chat, peerNameById),
    }));

    setChats(nextChats);

    setSelectedChatId((current) => {
      if (nextChats.length === 0) {
        return null;
      }

      if (current && nextChats.some((chat) => chat.id === current)) {
        return current;
      }

      return nextChats[0].id;
    });
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    const dbMessages = await listMessagesByChat(chatId, 150);
    setMessages([...dbMessages].reverse());
  }, []);

  const refreshAll = useCallback(async () => {
    await loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedChatId).catch(() => undefined);
  }, [selectedChatId, loadMessages]);

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
          lastMessageAt: null,
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

      if (!selectedChatId || selectedChatId === chat.id) {
        setSelectedChatId(chat.id);
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
    };
  }, [service, handleAck, handleIncomingChat, refreshAll]);

  const selectChat = (chatId: string) => {
    setSelectedChatId(chatId);
  };

  const refresh = async () => {
    await refreshAll();
    if (selectedChatId) {
      await loadMessages(selectedChatId);
    }
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

    const message: Message = {
      id,
      chatId: chat.id,
      senderPeerId: localPeerId,
      targetPeerId: chat.participantPeerId,
      kind: "text",
      body: payload,
      ttlMs: RELIABLE_TTL_MS,
      dedupeKey: id,
      status: "sent",
      createdAt: now,
      updatedAt: now,
      deliveredAt: null,
    };

    await upsertMessage(message);
    setDraft("");
    await loadChats();
    await loadMessages(chat.id);

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
    draft,
    setDraft,
    reliability,
    selectChat,
    refresh,
    sendMessage,
  };
}
