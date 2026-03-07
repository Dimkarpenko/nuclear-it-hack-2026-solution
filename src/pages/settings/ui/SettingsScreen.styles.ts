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
  headerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTextWrap: {
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2b3154",
    backgroundColor: "#101326",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: "#e8eeff",
    fontSize: 14,
    fontWeight: "700",
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
  profileInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2b3154",
    backgroundColor: "#090b14",
    color: "#f2f5ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  errorText: {
    color: "#ff9aa8",
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryButton: {
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2b3154",
    backgroundColor: "#0d1224",
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: "#dbe3ff",
    fontSize: 13,
    fontWeight: "700",
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
