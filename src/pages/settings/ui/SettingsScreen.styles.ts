import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090b14",
  },
  content: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 112,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f2f5ff",
  },
  subtitle: {
    marginTop: 4,
    color: "#9ca8d3",
    fontSize: 14,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2b3154",
    backgroundColor: "#101326",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  cardTitle: {
    color: "#f2f5ff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  metric: {
    color: "#ced7f6",
    fontSize: 14,
  },
  button: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "#57d3ff",
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#03111c",
    fontWeight: "700",
    fontSize: 14,
  },
});
