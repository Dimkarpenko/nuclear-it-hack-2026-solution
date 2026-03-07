import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useDiscoveryViewModel } from "@/features/discovery";
import { styles } from "./DiscoveryScreen.styles";

function formatAge(lastSeenAt: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - lastSeenAt) / 1000));
  return `${delta}s ago`;
}

export function DiscoveryScreen() {
  const {
    status,
    relayUrlInput,
    setRelayUrlInput,
    peers,
    logs,
    refreshNow,
    applyRelayUrl,
    useBrowserLocalTransport,
    sendPing,
    sendChatText,
  } = useDiscoveryViewModel();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const updateDraft = (peerId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [peerId]: value }));
  };

  const submitChat = (peerId: string) => {
    const text = (drafts[peerId] ?? "").trim();
    if (!text) {
      return;
    }

    sendChatText(peerId, text);
    setDrafts((prev) => ({ ...prev, [peerId]: "" }));
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
    >
      <Text style={styles.title}>Local Discovery</Text>
      <Text style={styles.subtitle}>
        Nearby peers and signaling via local channel.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>LAN relay for Android</Text>
        <TextInput
          value={relayUrlInput}
          onChangeText={setRelayUrlInput}
          style={styles.relayInput}
          placeholder="ws://192.168.1.10:8787"
          placeholderTextColor="#7e86a8"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={styles.actionButton}
          onPress={() => applyRelayUrl().catch(() => undefined)}
        >
          <Text style={styles.actionButtonText}>Apply relay URL</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryActionButton}
          onPress={() => useBrowserLocalTransport().catch(() => undefined)}
        >
          <Text style={styles.secondaryActionButtonText}>
            Use browser local transport
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.statusRow}>
          Running: {status.isRunning ? "yes" : "no"}
        </Text>
        <Text style={styles.statusRow}>Transport: {status.transport}</Text>
        <Text style={styles.statusRow}>Scope: {status.scope}</Text>
        <Text style={styles.statusRow}>
          Internet required: {status.internetRequired ? "yes" : "no"}
        </Text>
        <Text style={styles.statusRow}>
          Connection: {status.connectionState}
        </Text>
        <Text style={styles.statusRow}>
          Relay URL: {status.relayUrl ?? "-"}
        </Text>
        <Text style={styles.statusRow}>
          Local peer: {status.localPeerId ?? "-"}
        </Text>
        <Pressable
          style={styles.actionButton}
          onPress={() => refreshNow().catch(() => undefined)}
        >
          <Text style={styles.actionButtonText}>Refresh discovery</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nearby peers ({peers.length})</Text>
        {peers.length === 0 ? (
          <Text style={styles.emptyText}>No peers discovered yet</Text>
        ) : (
          peers.map((peer) => (
            <View key={peer.peerId} style={styles.peerRow}>
              <Text style={styles.peerName}>{peer.displayName}</Text>
              <Text style={styles.peerMeta}>ID: {peer.peerId}</Text>
              <Text style={styles.peerMeta}>
                Last seen: {formatAge(peer.lastSeenAt)}
              </Text>
              <Pressable
                style={styles.pingButton}
                onPress={() => sendPing(peer.peerId)}
              >
                <Text style={styles.pingButtonText}>Send ping</Text>
              </Pressable>
              <TextInput
                value={drafts[peer.peerId] ?? ""}
                onChangeText={(value) => updateDraft(peer.peerId, value)}
                style={styles.chatInput}
                placeholder="Type local message"
                placeholderTextColor="#7e86a8"
              />
              <Pressable
                style={styles.chatButton}
                onPress={() => submitChat(peer.peerId)}
              >
                <Text style={styles.chatButtonText}>Send local message</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signal log</Text>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>No signals yet</Text>
        ) : (
          logs.map((line) => (
            <Text key={line.id} style={styles.logLine}>
              {new Date(line.timestamp).toLocaleTimeString()} {line.text}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}
