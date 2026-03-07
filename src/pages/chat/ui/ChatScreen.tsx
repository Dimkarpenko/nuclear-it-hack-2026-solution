import { useState } from "react";
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

import { RootStackParamList } from "@/core/navigation/RootNavigator";
import { styles } from "./ChatScreen.styles";
import { useChatViewModel } from "./useChatViewModel";

function formatMessageMeta(createdAt: number, status: string): string {
  return `${new Date(createdAt).toLocaleTimeString()} · ${status}`;
}

function formatPercent(transferredBytes: number, totalBytes: number): string {
  if (totalBytes <= 0) {
    return "0%";
  }

  const ratio = Math.min(1, Math.max(0, transferredBytes / totalBytes));
  return `${Math.round(ratio * 100)}%`;
}

function formatLastActivity(value: number | null): string {
  if (!value) {
    return "No messages yet";
  }

  return new Date(value).toLocaleString();
}

export function ChatScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    isReady,
    localPeerId,
    chats,
    selectedChatId,
    messages,
    transfers,
    draft,
    setDraft,
    fileDraft,
    setFileDraft,
    selectChat,
    refresh,
    sendMessage,
    sendFile,
  } = useChatViewModel();

  const canSend = draft.trim().length > 0 && selectedChatId !== null;
  const canSendFile = fileDraft.trim().length > 0 && selectedChatId !== null;
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Чаты</Text>
            <Text style={styles.subtitle}>Локальный мессенджер без облака</Text>
          </View>
          <Pressable
            style={styles.refreshPill}
            onPress={() => refresh().catch(() => undefined)}
          >
            <Text style={styles.refreshPillText}>Обновить</Text>
          </Pressable>
        </View>

        <View style={styles.identityCard}>
          <Text style={styles.identityLabel}>Это устройство</Text>
          <Text style={styles.identityValue}>{localPeerId ?? "-"}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Список чатов</Text>
          {chats.length === 0 ? (
            <Text style={styles.emptyText}>
              Нажми + чтобы добавить собеседника
            </Text>
          ) : (
            <View style={styles.chatList}>
              {chats.map((chat) => {
                const active = chat.id === selectedChatId;
                return (
                  <Pressable
                    key={chat.id}
                    style={[
                      styles.chatRow,
                      active ? styles.chatRowActive : null,
                    ]}
                    onPress={() => selectChat(chat.id)}
                  >
                    <Text style={styles.chatName}>{chat.resolvedTitle}</Text>
                    <Text style={styles.chatMeta}>
                      {chat.participantPeerId.slice(0, 12)}
                    </Text>
                    <Text style={styles.chatMeta}>
                      {formatLastActivity(chat.lastMessageAt)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Диалог</Text>
          {!isReady ? (
            <Text style={styles.emptyText}>Загрузка данных...</Text>
          ) : selectedChatId === null ? (
            <Text style={styles.emptyText}>
              Выбери чат, чтобы начать переписку
            </Text>
          ) : messages.length === 0 ? (
            <Text style={styles.emptyText}>Отправь первое сообщение</Text>
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

          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              style={styles.input}
              placeholder="Введите сообщение"
              placeholderTextColor="#7e86a8"
              editable={selectedChatId !== null}
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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Передача файла (демо)</Text>
          <TextInput
            value={fileDraft}
            onChangeText={setFileDraft}
            style={styles.fileInput}
            placeholder="Текст файла для отправки по частям"
            placeholderTextColor="#7e86a8"
            editable={selectedChatId !== null}
            multiline
            numberOfLines={3}
          />
          <Pressable
            style={[
              styles.fileButton,
              canSendFile ? null : styles.disabledSendButton,
            ]}
            onPress={() => sendFile().catch(() => undefined)}
            disabled={!canSendFile}
          >
            <Text style={styles.fileButtonText}>Отправить файл</Text>
          </Pressable>

          {transfers.length === 0 ? (
            <Text style={styles.emptyText}>Передач пока нет</Text>
          ) : (
            <View style={styles.transferList}>
              {transfers.map((transfer) => (
                <View key={transfer.id} style={styles.transferRow}>
                  <Text style={styles.transferName}>{transfer.fileName}</Text>
                  <Text style={styles.transferMeta}>
                    {transfer.direction} · {transfer.status}
                  </Text>
                  <Text style={styles.transferMeta}>
                    {transfer.transferredBytes}/{transfer.totalBytes} B ·{" "}
                    {formatPercent(
                      transfer.transferredBytes,
                      transfer.totalBytes,
                    )}
                  </Text>
                </View>
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
          style={styles.fabBackdrop}
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
              <Text style={styles.fabActionTitle}>Подключить по коду</Text>
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

      <Pressable style={styles.fab} onPress={() => setIsFabMenuOpen(true)}>
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}
