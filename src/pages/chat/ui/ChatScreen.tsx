import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
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

function formatMessageMeta(createdAt: number, status: string): string {
  return `${new Date(createdAt).toLocaleTimeString()} · ${status}`;
}

function formatLastActivity(value: number | null): string {
  if (!value) {
    return "Без сообщений";
  }

  return new Date(value).toLocaleString();
}

export function ChatScreen() {
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
    refresh,
    sendMessage,
  } = useChatViewModel();

  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const canSend = draft.trim().length > 0 && activeChat !== null;

  if (activeChat) {
    return (
      <View style={styles.container}>
        <View
          style={[
            styles.roomHeader,
            {
              paddingTop: insets.top,
              minHeight: 68 + insets.top,
            },
          ]}
        >
          <Pressable style={styles.backButton} onPress={closeChat}>
            <Text style={styles.backButtonText}>Назад</Text>
          </Pressable>
          <View style={styles.roomHeaderTextWrap}>
            <Text style={styles.roomHeaderTitle}>
              {activeChat.resolvedTitle}
            </Text>
            <Text style={styles.roomHeaderMeta}>
              {activeChat.id === FAVORITES_CHAT_ID
                ? "Сохраненные сообщения"
                : activeChat.participantPeerId.slice(0, 12)}
            </Text>
          </View>
        </View>

        <View style={styles.roomBody}>
          {!isReady ? (
            <View style={styles.centerWrap}>
              <Text style={styles.emptyText}>Загрузка...</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.centerWrap}>
              <Text style={styles.emptyText}>Начни переписку первым</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
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
                        isOutgoing ? styles.bubbleTextOut : styles.bubbleTextIn
                      }
                    >
                      {message.body}
                    </Text>
                    <Text
                      style={
                        isOutgoing ? styles.bubbleMetaOut : styles.bubbleMetaIn
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
              paddingBottom: 86 + insets.bottom,
            },
          ]}
        >
          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              style={styles.input}
              placeholder="Сообщение"
              placeholderTextColor="#7e86a8"
            />
            <Pressable
              style={[
                styles.sendButton,
                canSend ? null : styles.disabledSendButton,
              ]}
              onPress={() => sendMessage().catch(() => undefined)}
              disabled={!canSend}
            >
              <Text style={styles.sendButtonText}>Отправить</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: 16 + insets.top,
            paddingBottom: 156 + insets.bottom,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Чаты</Text>
          </View>
          <Pressable
            style={styles.refreshPill}
            onPress={() => refresh().catch(() => undefined)}
          >
            <Text style={styles.refreshPillText}>Обновить</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          {chats.length === 0 ? (
            <Text style={styles.emptyText}>Чатов пока нет</Text>
          ) : (
            <View style={styles.chatList}>
              {chats.map((chat) => (
                <Pressable
                  key={chat.id}
                  style={styles.chatRow}
                  onPress={() => selectChat(chat.id)}
                >
                  <Text style={styles.chatName}>{chat.resolvedTitle}</Text>
                  <Text style={styles.chatMeta}>
                    {chat.id === FAVORITES_CHAT_ID
                      ? "Сохраненные сообщения"
                      : chat.participantPeerId.slice(0, 12)}
                  </Text>
                  <Text style={styles.chatMeta}>
                    {formatLastActivity(chat.lastMessageAt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
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
              paddingBottom: 98 + insets.bottom,
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
            bottom: 98 + insets.bottom,
          },
        ]}
        onPress={() => setIsFabMenuOpen(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}
