import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

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

export function ChatScreen() {
  const {
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
    fileDraft,
    setFileDraft,
    reliability,
    selectChat,
    refresh,
    sendMessage,
    sendFile,
  } = useChatViewModel();

  const canSend = draft.trim().length > 0 && selectedChatId !== null;
  const canSendFile = fileDraft.trim().length > 0 && selectedChatId !== null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.title}>Chats</Text>
        <Text style={styles.subtitle}>
          Reliable local messaging with ACK status.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Transport</Text>
        <Text style={styles.statusRow}>State: {statusText}</Text>
        <Text style={styles.statusRow}>
          Relay: {relayUrl ?? "browser-local"}
        </Text>
        <Text style={styles.statusRow}>Local peer: {localPeerId ?? "-"}</Text>
        <Pressable
          style={styles.actionButton}
          onPress={() => refresh().catch(() => undefined)}
        >
          <Text style={styles.actionButtonText}>Refresh chats</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reliable delivery</Text>
        <Text style={styles.statusRow}>Pending: {reliability.pending}</Text>
        <Text style={styles.statusRow}>Delivered: {reliability.delivered}</Text>
        <Text style={styles.statusRow}>Failed: {reliability.failed}</Text>
        <Text style={styles.statusRow}>
          ACK received: {reliability.acksReceived}
        </Text>
        <Text style={styles.statusRow}>
          Duplicates dropped: {reliability.duplicatesDropped}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Private chats ({chats.length})</Text>
        {chats.length === 0 ? (
          <Text style={styles.emptyText}>
            No chats yet. Pair a peer and open discovery.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chatTabsRow}>
              {chats.map((chat) => {
                const active = chat.id === selectedChatId;
                return (
                  <Pressable
                    key={chat.id}
                    style={[
                      styles.chatTab,
                      active ? styles.chatTabActive : null,
                    ]}
                    onPress={() => selectChat(chat.id)}
                  >
                    <Text style={styles.chatTabName}>{chat.resolvedTitle}</Text>
                    <Text style={styles.chatTabMeta}>
                      {chat.participantPeerId.slice(0, 12)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Messages</Text>
        {!isReady ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : selectedChatId === null ? (
          <Text style={styles.emptyText}>Select a chat</Text>
        ) : messages.length === 0 ? (
          <Text style={styles.emptyText}>No messages yet</Text>
        ) : (
          <ScrollView style={styles.messageList}>
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
            placeholder="Type local message"
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
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>File transfer</Text>
        <TextInput
          value={fileDraft}
          onChangeText={setFileDraft}
          style={styles.fileInput}
          placeholder="Type file content for chunked send"
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
          <Text style={styles.fileButtonText}>Send file in chunks</Text>
        </Pressable>

        {transfers.length === 0 ? (
          <Text style={styles.emptyText}>No transfers yet</Text>
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
  );
}
