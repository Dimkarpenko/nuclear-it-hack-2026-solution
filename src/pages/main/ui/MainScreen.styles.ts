import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1624",
  },
  scene: {
    flex: 1,
    backgroundColor: "#0b1624",
  },
  drawerPanel: {
    width: "82%",
    maxWidth: 360,
    backgroundColor: "#0f2438",
    borderRightWidth: 1,
    borderRightColor: "#295271",
  },
  drawerContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    gap: 18,
  },
  drawerProfileBlock: {
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#254866",
  },
  drawerAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f29b50",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  drawerAvatarText: {
    color: "#31170c",
    fontSize: 26,
    fontWeight: "800",
  },
  drawerProfileTitle: {
    color: "#f2f8ff",
    fontSize: 28,
    fontWeight: "700",
  },
  drawerProfileSubtitle: {
    marginTop: 2,
    color: "#78b8ee",
    fontSize: 14,
    fontWeight: "500",
  },
  drawerSection: {
    gap: 12,
  },
  drawerItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a5372",
    backgroundColor: "#15314b",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  drawerToggleRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a5372",
    backgroundColor: "#15314b",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  drawerItemLabel: {
    color: "#eff7ff",
    fontSize: 16,
    fontWeight: "700",
  },
  drawerHint: {
    color: "#9ec3e3",
    fontSize: 12,
    lineHeight: 16,
  },
});
