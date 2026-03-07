import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { StorageStats } from "../domain/models";
import { getStorageStats } from "../storage/database";

export function HomeScreen() {
  const [stats, setStats] = useState<StorageStats | null>(null);

  const loadStats = async () => {
    const next = await getStorageStats();
    setStats(next);
  };

  useEffect(() => {
    loadStats().catch(() => undefined);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Local messenger MVP initialized.</Text>
      <Text style={styles.subtitle}>
        Stage 2 completed: domain models and local SQLite persistence.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Local storage</Text>
        <Text style={styles.metric}>Peers: {stats?.peers ?? 0}</Text>
        <Text style={styles.metric}>Chats: {stats?.chats ?? 0}</Text>
        <Text style={styles.metric}>Messages: {stats?.messages ?? 0}</Text>
        <Text style={styles.metric}>Transfers: {stats?.transfers ?? 0}</Text>
      </View>
      <Pressable
        style={styles.button}
        onPress={() => loadStats().catch(() => undefined)}
      >
        <Text style={styles.buttonText}>Refresh stats</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#090b14",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f2f5ff",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#b8c0df",
    marginBottom: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2b3154",
    backgroundColor: "#101326",
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: "#f2f5ff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  metric: {
    color: "#d6dcf3",
    fontSize: 15,
  },
  button: {
    marginTop: 20,
    backgroundColor: "#57d3ff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#03111c",
    fontSize: 15,
    fontWeight: "700",
  },
});
