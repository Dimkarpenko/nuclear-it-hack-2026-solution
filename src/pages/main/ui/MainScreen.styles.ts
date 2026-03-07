import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090b14",
  },
  content: {
    flex: 1,
  },
  tabBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 8,
    backgroundColor: "rgba(9, 11, 20, 0.9)",
  },
  tabBar: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2b3154",
    backgroundColor: "#101326",
    flexDirection: "row",
    overflow: "hidden",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  tabLabel: {
    color: "#8b95bb",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: "#f2f5ff",
  },
});
