// app/bathroomlog/_styles.ts

import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  // =========================
  // MAIN LAYOUT
  // =========================
  container: { 
    flex: 1, 
    backgroundColor: "#0f172a", // Dark background
  }, 

    headerWrapper: { 
      backgroundColor: "#1e293b" ,
      borderBottomWidth: 1,
      borderBottomColor: "#334155",
  },


  // =========================
  // NAVIGATION BAR
  // =========================
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

  // =========================
  // SEARCH BAR (Slate 700)
  // =========================
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
  },
  sectionTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },

  // =========================
  // CONTENT AREA
  // =========================
  contentArea: { flex: 1, paddingHorizontal: 16 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 15,
    paddingHorizontal: 5
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },

  // =========================
  // CARDS (The Red/Blue Logic)
  // =========================
  logCard: { 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12, 
    justifyContent: "center",
  },
  
  // Normal (Blue/Grey)
  logCardNormal: { 
    backgroundColor: "#1e293b", 
  },
  
  // Late (Dark Red)
  logCardLate: { 
    backgroundColor: "#7f1d1d", // Deep Red
    borderWidth: 1,
    borderColor: "#991b1b",
  },

  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  
  cardName: { color: "white", fontWeight: "bold", fontSize: 18 },
  
  // ID Text
  cardId: { color: "#94a3b8", fontSize: 14, marginTop: 2, marginBottom: 5 },
  cardIdLate: { color: "#e2e8f0", fontSize: 13, marginBottom: 12 }, // Lighter text on red bg

  // Time Text
  timeTextBlue: { color: "#38bdf8", fontWeight: "bold", fontSize: 15 },
  timeTextYellow: { color: "#facc15", fontWeight: "bold", fontSize: 16 },

  // =========================
  // BOTTOM TAB BAR
  // =========================
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
    justifyContent: "space-around" 
  },
  tabItem: { alignItems: "center", justifyContent: "center", flex: 1 },
  tabText: { color: "#64748b", fontSize: 11, marginTop: 4, fontWeight: "600" },
  tabTextActive: { color: "#38bdf8", fontWeight: "bold" },
});

export default function Styles() { return null; }