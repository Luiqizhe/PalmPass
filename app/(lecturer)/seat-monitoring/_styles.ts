// app/seat-monitoring/_styles.ts

import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },

  // Header wrapper with border at the bottom
  headerWrapper: { 
    backgroundColor: "#1e293b",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },

  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: "#1e293b",
  },

  navLeft: { width: 40 },
  navCenter: { flex: 1, alignItems: "center" ,justifyContent:"center",paddingTop: 10},
  navRight: { width: 40, alignItems: "flex-end" },
  navTitle: { color: "white", fontSize: 18, fontWeight: "bold",marginBottom:-5},
  navSubtitle: { color: "white", fontSize: 14, marginBottom:1},
  navSub: { color: "#94a3b8", fontSize: 14 , marginTop:10},

  // Separator line between title and search
  headerSeparator: {
    height: 1,
    backgroundColor: "#334155",
  },

  // Search bar now inside header
  searchContainer: { 
    paddingHorizontal: 16, 
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: "#1e293b",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#334155",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  searchInput: { flex: 1, color: "white", fontSize: 14, marginLeft: 10 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 1,
  },
  sectionTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },

  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop:2,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  legendItem: { flexDirection: "row", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { color: "#94a3b8", fontSize: 12 },

  contentArea: { flex: 1 },
  grid: { paddingHorizontal: 16, paddingBottom: 100 },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  seat: {
    width: "32%",
    aspectRatio: 1.1,
    borderRadius: 10,
    marginBottom: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    elevation: 4,
  },
  seatNumber: { color: "white", fontSize: 20, fontWeight: "800" },
  seatName: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 10,
    textAlign: "center",
    fontWeight: "500",
    marginBottom: 4,
  },
  statusIconContainer: { height: 24, justifyContent: "center" },

  logCard: {
    backgroundColor: "#1e293b",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#38bdf8",
  },
  logCardLate: {
    borderLeftColor: "#ef4444",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  logName: { color: "white", fontWeight: "bold", fontSize: 15 },
  timeText: { color: "#38bdf8", fontWeight: "bold" },

  tabBar: {
    flexDirection: "row",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "#334155",
    height: 85,
    paddingBottom: 25,
    alignItems: "center",
    justifyContent: "space-around",
  },
  tabItem: { alignItems: "center", justifyContent: "center", flex: 1 },
  tabText: { color: "#64748b", fontSize: 11, marginTop: 4, fontWeight: "600" },
  tabTextActive: { color: "#38bdf8", fontWeight: "bold" },
});

export default function Styles() { return null; }