import { Pressable, ScrollView, Text, View } from "react-native";

import { useDiscoveryViewModel } from "@/features/discovery";
import { styles } from "./DiscoveryScreen.styles";

function formatAge(lastSeenAt: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - lastSeenAt) / 1000));
  return `${delta}s ago`;
}

export function DiscoveryScreen() {
  const { status, peers, logs, refreshNow, sendPing } = useDiscoveryViewModel();

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
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.statusRow}>
          Running: {status.isRunning ? "yes" : "no"}
        </Text>
        <Text style={styles.statusRow}>Transport: {status.transport}</Text>
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
