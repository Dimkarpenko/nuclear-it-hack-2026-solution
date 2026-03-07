import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#090b14",
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  sectionTitle: {
    color: "#f2f5ff",
    fontSize: 18,
    fontWeight: "700",
  },
  card: {
    borderWidth: 1,
    borderColor: "#2b3154",
    borderRadius: 14,
    backgroundColor: "#101326",
    padding: 14,
    gap: 10,
  },
  label: {
    color: "#b8c0df",
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#2b3154",
    borderRadius: 10,
    backgroundColor: "#090b14",
    color: "#f2f5ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  button: {
    borderRadius: 10,
    backgroundColor: "#57d3ff",
    paddingVertical: 11,
    alignItems: "center",
  },
  buttonText: {
    color: "#03111c",
    fontSize: 14,
    fontWeight: "700",
  },
  outlineButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2b3154",
    paddingVertical: 10,
    alignItems: "center",
  },
  outlineButtonText: {
    color: "#dbe3ff",
    fontSize: 14,
    fontWeight: "700",
  },
  tokenText: {
    color: "#cfd7f7",
    fontSize: 12,
    lineHeight: 18,
  },
  codeText: {
    color: "#f2f5ff",
    fontSize: 16,
    fontWeight: "700",
    textTransform: "lowercase",
  },
  meta: {
    color: "#9ca6cb",
    fontSize: 13,
  },
  peerRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#1f2443",
    paddingVertical: 8,
    gap: 4,
  },
  peerName: {
    color: "#f2f5ff",
    fontSize: 14,
    fontWeight: "600",
  },
  peerMeta: {
    color: "#9ca6cb",
    fontSize: 12,
  },
});
