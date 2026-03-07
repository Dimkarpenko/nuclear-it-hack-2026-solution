import { StyleSheet, Text, View } from "react-native";

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Local messenger MVP is initialized.</Text>
      <Text style={styles.subtitle}>
        Next steps: identity, pairing, discovery, reliable delivery, and chats.
      </Text>
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
  },
});
