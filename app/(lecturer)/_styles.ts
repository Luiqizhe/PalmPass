import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    marginBottom: 12, 
    borderRadius: 12,
    marginLeft: 10,
  },
  deleteText: { 
    color: 'white', 
    fontSize: 12, 
    fontWeight: 'bold' 
  },
  fab: {
      position: 'absolute',
      bottom: 30,
      right: 20,
      backgroundColor: '#38bdf8', 
      width: 60,
      height: 60,
      borderRadius: 30,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      zIndex: 50,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#1e293b", borderTopLeftRadius: 20, borderTopRightRadius: 20, height: "70%", padding: 20, display: 'flex' },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15, borderBottomWidth: 1, borderBottomColor: "#334155", paddingBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "white" },
  modalItem: { flexDirection: "row", alignItems: "center", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#334155" },
  modalItemTitle: { color: "white", fontSize: 16, fontWeight: "600" },
  modalItemSub: { color: "#94a3b8", fontSize: 13, marginTop: 4 },
  container: { 
    flex: 1, 
    backgroundColor: "#0f172a", 
    padding: 20, 
  },
  header: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center",
    marginBottom: 20,
    paddingTop: 10
  },
  title: { 
    fontSize: 24, 
    fontWeight: "bold", 
    color: "#6190d7ff" 
  },
  subtitle: { 
    fontSize: 14, 
    color: "#94a3b8", 
    marginTop: 4 
  },
  navRight: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 8 
  },
    logout: { 
      color: "#007AFF", 
      fontSize: 16, 
      fontWeight: "600" 
  },
  card: { 
    backgroundColor: "#1e293b", 
    padding: 20, 
    borderRadius: 12, 
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#1e293b"
  },
  examTitle: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "bold",  
  },
  examDetail: { 
    color: "#aaa", 
    fontSize: 14, 
    marginBottom: 3, 
    marginTop: 2
  },
  loading: {
    color: "#fff",
    textAlign: "center",
    marginTop: 20
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center",
    marginTop: 40,
    fontSize: 16
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#334155'
  },
  searchInput: {
    flex: 1,
    color: 'white',
    fontSize: 16
  }
});

export default function Styles() { return null; }