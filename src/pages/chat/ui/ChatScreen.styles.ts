import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090b14",
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f2f5ff",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#b8c0df",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2b3154",
    backgroundColor: "#101326",
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    color: "#f2f5ff",
    fontSize: 16,
    fontWeight: "700",
  },
  statusRow: {
    color: "#d6dcf3",
    fontSize: 14,
  },
  actionButton: {
    marginTop: 8,
    backgroundColor: "#57d3ff",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#03111c",
    fontSize: 14,
    fontWeight: "700",
  },
  chatTabsRow: {
    flexDirection: "row",
    gap: 8,
  },
  chatTab: {
    minWidth: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2b3154",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#111833",
  },
  chatTabActive: {
    borderColor: "#57d3ff",
    backgroundColor: "#132340",
  },
  chatTabName: {
    color: "#f2f5ff",
    fontSize: 14,
    fontWeight: "700",
  },
  chatTabMeta: {
    color: "#9ba6cd",
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: "#9ba6cd",
    fontSize: 14,
  },
  messageList: {
    maxHeight: 320,
    gap: 8,
  },
  bubbleOut: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    borderRadius: 12,
    borderTopRightRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#57d3ff",
    borderWidth: 1,
    borderColor: "#57d3ff",
    gap: 4,
  },
  bubbleIn: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    borderRadius: 12,
    borderTopLeftRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#151d37",
    borderWidth: 1,
    borderColor: "#2b3154",
    gap: 4,
  },
  bubbleTextOut: {
    color: "#03111c",
    fontSize: 14,
  },
  bubbleTextIn: {
    color: "#e5ebff",
    fontSize: 14,
  },
  bubbleMetaOut: {
    color: "#0a2230",
    fontSize: 11,
  },
  bubbleMetaIn: {
    color: "#91a0cb",
    fontSize: 11,
  },
  composerRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2b3154",
    backgroundColor: "#0f1530",
    color: "#f2f5ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    borderRadius: 10,
    backgroundColor: "#57d3ff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: {
    color: "#03111c",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledSendButton: {
    opacity: 0.5,
  },
});
