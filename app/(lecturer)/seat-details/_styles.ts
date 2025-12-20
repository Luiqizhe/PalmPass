// app/seat-details/styles.ts

import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },


  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "white" },
  closeButton: { padding: 5 },

  modalBody: { width: "100%" },

  profileRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#334155",
    marginRight: 15,
  },
  textInfo: { flex: 1 },

  modalName: { color: "white", fontSize: 16, fontWeight: "bold" },
  modalSub: { color: "#94a3b8", fontSize: 12 },

  infoBox: {
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoLabel: { color: "#94a3b8", fontSize: 14, marginBottom: 5 },
  infoValue: { color: "white", fontWeight: "600" },

  updateTitle: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 10,
    textTransform: "uppercase",
  },

  actionBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  btnText: { color: "white", fontSize: 14, fontWeight: "bold" },
});

export default function Styles() { return null; }