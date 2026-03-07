import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RootStackParamList } from "@/core/navigation/RootNavigator";
import { styles } from "./ChatScreen.styles";
import { useChatViewModel } from "./useChatViewModel";

const FAVORITES_CHAT_ID = "favorites-chat";

function formatDeliveryStatus(status: string): string {
  if (status === "delivered") {
    return "доставлено";
  }
  if (status === "sent") {
    return "отправлено";
  }
  if (status === "failed") {
    return "ошибка";
  }
  if (status === "pending") {
    return "ожидание";
  }
  return status;
}

function formatMessageMeta(createdAt: number, status: string): string {
  const hhmm = new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${hhmm} · ${formatDeliveryStatus(status)}`;
}

function formatChatTime(value: number | null): string {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildChatSubtitle(chatId: string, peerId: string): string {
  if (chatId === FAVORITES_CHAT_ID) {
    return "Сохраненные сообщения";
  }

  return peerId.slice(0, 12);
}

type ChatScreenProps = {
  onOpenMenu?: () => void;
  openChatRequest?: {
    peerId: string;
    peerName?: string;
    token: number;
  } | null;
  onOpenChatHandled?: () => void;
};

export function ChatScreen({
  onOpenMenu,
  openChatRequest,
  onOpenChatHandled,
}: ChatScreenProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const {
    isReady,
    localPeerId,
    chats,
    selectedChatId,
    messages,
    draft,
    setDraft,
    selectChat,
    closeChat,
    startChatWithPeer,
    refresh,
    sendMessage,
    sendFile,
    sendVoiceInvite,
  } = useChatViewModel();

  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handledOpenTokenRef = useRef<number | null>(null);
  const messageListRef = useRef<ScrollView | null>(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const canSend = draft.trim().length > 0 && activeChat !== null;

  const handlePullToRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const scrollToBottom = (animated: boolean) => {
    messageListRef.current?.scrollToEnd({ animated });
  };

  useEffect(() => {
    if (!openChatRequest) {
      return;
    }

    if (handledOpenTokenRef.current === openChatRequest.token) {
      return;
    }

    let cancelled = false;

    startChatWithPeer(openChatRequest.peerId, openChatRequest.peerName)
      .then((opened) => {
        if (!opened || cancelled) {
          return;
        }

        handledOpenTokenRef.current = openChatRequest.token;
        onOpenChatHandled?.();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [localPeerId, openChatRequest, onOpenChatHandled, startChatWithPeer]);

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    const timer = setTimeout(() => {
      scrollToBottom(false);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [activeChat?.id]);

  useEffect(() => {
    if (!activeChat || messages.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      scrollToBottom(true);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [activeChat?.id, messages.length]);

  if (activeChat) {
    return (
      <View style={styles.container}>
        <View
          style={[
            styles.roomHeader,
            {
              paddingTop: insets.top + 6,
              minHeight: 74 + insets.top,
            },
          ]}
        >
          <Pressable style={styles.headerBack} onPress={closeChat}>
            <Text style={styles.headerBackText}>{"<"}</Text>
          </Pressable>

          <View style={styles.chatAvatarBig}>
            <Text style={styles.chatAvatarTextBig}>
              {activeChat.id === FAVORITES_CHAT_ID
                ? "S"
                : activeChat.resolvedTitle.slice(0, 1).toUpperCase()}
            </Text>
          </View>

          <View style={styles.roomHeaderTextWrap}>
            <Text style={styles.roomHeaderTitle}>
              {activeChat.resolvedTitle}
            </Text>
            <Text style={styles.roomHeaderMeta}>
              {buildChatSubtitle(activeChat.id, activeChat.participantPeerId)}
            </Text>
          </View>

          <Pressable
            style={styles.headerActionButton}
            onPress={() => sendVoiceInvite().catch(() => undefined)}
          >
            <Text style={styles.headerActionButtonText}>Звонок</Text>
          </Pressable>

          <Pressable style={styles.headerActionButton}>
            <Text style={styles.headerActionButtonText}>Меню</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={styles.roomBody}>
            {!isReady ? (
              <View style={styles.centerWrap}>
                <Text style={styles.emptyText}>Загрузка...</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.centerWrap}>
                <Text style={styles.emptyText}>Сообщений пока нет</Text>
              </View>
            ) : (
              <ScrollView
                ref={messageListRef}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onContentSizeChange={() => scrollToBottom(false)}
              >
                {messages.map((message) => {
                  const isOutgoing = message.senderPeerId === localPeerId;
                  return (
                    <View
                      key={message.id}
                      style={isOutgoing ? styles.bubbleOut : styles.bubbleIn}
                    >
                      <Text
                        style={
                          isOutgoing
                            ? styles.bubbleTextOut
                            : styles.bubbleTextIn
                        }
                      >
                        {message.body}
                      </Text>
                      <Text
                        style={
                          isOutgoing
                            ? styles.bubbleMetaOut
                            : styles.bubbleMetaIn
                        }
                      >
                        {formatMessageMeta(message.createdAt, message.status)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View
            style={[
              styles.composerWrap,
              {
                paddingBottom: 10 + insets.bottom,
              },
            ]}
          >
            <View style={styles.composerRow}>
              <Pressable
                style={styles.sideActionButton}
                onPress={() => sendFile().catch(() => undefined)}
              >
                <Text style={styles.sideActionButtonText}>+</Text>
              </Pressable>

              <TextInput
                value={draft}
                onChangeText={setDraft}
                style={styles.input}
                placeholder="Написать сообщение"
                placeholderTextColor="#7e86a8"
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => sendMessage().catch(() => undefined)}
              />

              <Pressable
                style={styles.voiceButton}
                onPress={() => sendVoiceInvite().catch(() => undefined)}
              >
                <Text style={styles.voiceButtonText}>Голос</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.sendButton,
                  canSend ? null : styles.disabledSendButton,
                ]}
                onPress={() => sendMessage().catch(() => undefined)}
                disabled={!canSend}
              >
                <Text style={styles.sendButtonText}>Отпр.</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => handlePullToRefresh().catch(() => undefined)}
            tintColor="#dceeff"
            colors={["#65c0ff"]}
            progressBackgroundColor="#0f2438"
          />
        }
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: 16 + insets.top,
            paddingBottom: 24 + insets.bottom,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.burgerButton}
              onPress={onOpenMenu}
              accessibilityRole="button"
              accessibilityLabel="Открыть меню"
            >
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
            </Pressable>

            <View>
              <Text style={styles.title}>Чаты</Text>
              <Text style={styles.listSubtitle}>Локальные и сохраненные</Text>
            </View>
          </View>
        </View>

        {chats.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>Чатов пока нет</Text>
          </View>
        ) : (
          <View style={styles.chatList}>
            {chats.map((chat) => (
              <Pressable
                key={chat.id}
                style={styles.chatRow}
                onPress={() => selectChat(chat.id)}
              >
                <View style={styles.chatAvatar}>
                  <Text style={styles.chatAvatarText}>
                    {chat.id === FAVORITES_CHAT_ID
                      ? "S"
                      : chat.resolvedTitle.slice(0, 1).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.chatInfoWrap}>
                  <Text style={styles.chatName}>{chat.resolvedTitle}</Text>
                  <Text style={styles.chatMeta}>
                    {buildChatSubtitle(chat.id, chat.participantPeerId)}
                  </Text>
                </View>

                <View style={styles.chatRightWrap}>
                  <Text style={styles.chatTime}>
                    {formatChatTime(chat.lastMessageAt)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        visible={isFabMenuOpen}
        animationType="fade"
        onRequestClose={() => setIsFabMenuOpen(false)}
      >
        <Pressable
          style={[
            styles.fabBackdrop,
            {
              paddingBottom: 20 + insets.bottom,
            },
          ]}
          onPress={() => setIsFabMenuOpen(false)}
        >
          <View style={styles.fabMenu}>
            <Pressable
              style={styles.fabAction}
              onPress={() => {
                setIsFabMenuOpen(false);
                navigation.navigate("Discovery");
              }}
            >
              <Text style={styles.fabActionTitle}>Найти рядом</Text>
              <Text style={styles.fabActionSubtitle}>
                Поиск устройств в локальной сети
              </Text>
            </Pressable>

            <Pressable
              style={styles.fabAction}
              onPress={() => {
                setIsFabMenuOpen(false);
                navigation.navigate("Pairing");
              }}
            >
              <Text style={styles.fabActionTitle}>Добавить по коду</Text>
              <Text style={styles.fabActionSubtitle}>
                Генерация или ввод случайной код-фразы
              </Text>
            </Pressable>

            <Pressable
              style={styles.fabCloseAction}
              onPress={() => setIsFabMenuOpen(false)}
            >
              <Text style={styles.fabCloseActionText}>Отмена</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Pressable
        style={[
          styles.fab,
          {
            bottom: 20 + insets.bottom,
          },
        ]}
        onPress={() => setIsFabMenuOpen(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}
