import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { subscribeToBathroomLog, subscribeToSeating } from "../../services/api";

export default function MonitorPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"seating" | "bathroom">("seating");

  // State for Real-Time Data
  const [seats, setSeats] = useState<any[]>([]);
  const [bathroomLogs, setBathroomLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const examId = Array.isArray(id) ? id[0] : id; 

    // 1. Subscribe to Live Seating
    const unsubscribeSeats = subscribeToSeating(examId, (data) => {
      const sortedSeats = data.sort((a, b) => {
        const seatA = a.seatNumber || "";
        const seatB = b.seatNumber || "";
        return seatA.localeCompare(seatB);
      });
      setSeats(sortedSeats);
      setLoading(false);
    });

    // 2. Subscribe to Bathroom Logs
    const unsubscribeBathroom = subscribeToBathroomLog(examId, (data) => {
      // Sort logs: "Out" status first, then by name
      const sortedLogs = data.sort((a, b) => {
        const statusA = a.status?.toLowerCase() || "";
        const statusB = b.status?.toLowerCase() || "";
        if (statusA === "out" && statusB !== "out") return -1;
        if (statusA !== "out" && statusB === "out") return 1;
        return 0; 
      });
      setBathroomLogs(sortedLogs);
    });

    return () => {
      unsubscribeSeats();
      unsubscribeBathroom();
    };
  }, [id]);

  const renderSeat = ({ item }: { item: any }) => (
    <View
      style={[
        styles.seat,
        item.status === "present" ? styles.seatPresent : styles.seatAbsent,
      ]}
    >
      <Text
        style={[
          styles.seatText,
          item.status === "present" ? styles.textWhite : styles.textGray,
        ]}
      >
        {item.seatNumber || item.id}
      </Text>
    </View>
  );

  const renderLog = ({ item }: { item: any }) => {
    // Handle Case Sensitivity ("Out" vs "out")
    const isOut = item.status === "Out" || item.status === "out";
    
    return (
      <View style={[styles.logRow, isOut ? styles.logRowOut : null]}>
        <View style={styles.logIconContainer}>
           <MaterialIcons 
              name={isOut ? "directions-run" : "check-circle"} 
              size={24} 
              color={isOut ? "#DC2626" : "#10B981"} 
           />
        </View>
        <View style={{flex: 1}}>
          {/* Now displays Real Name from the JOIN operation */}
          <Text style={styles.logName}>{item.name}</Text>
          <Text style={styles.logMatric}>{item.matric}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.logTimeLabel}>{isOut ? "Left at:" : "Returned:"}</Text>
          <Text style={styles.logTime}>{item.timeOut || "--:--"}</Text>
          
          {isOut && (
             <View style={styles.badgeRed}>
               <Text style={styles.textRed}>OUT</Text>
             </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{id}</Text>
          <Text style={styles.headerSubtitle}>Live Monitoring</Text>
        </View>
        <View style={{ width: 24 }} /> 
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab("seating")}
          style={[styles.tab, activeTab === "seating" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "seating" && styles.tabTextActive]}>
            Hall Seating
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={() => setActiveTab("bathroom")}
          style={[styles.tab, activeTab === "bathroom" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "bathroom" && styles.tabTextActive]}>
            Bathroom Log
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={{ marginTop: 10, color: "#666" }}>Syncing...</Text>
          </View>
        ) : activeTab === "seating" ? (
          <View style={{ flex: 1 }}>
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.seatPresent]} />
                <Text style={styles.legendText}>Present</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.seatAbsent]} />
                <Text style={styles.legendText}>Absent</Text>
              </View>
            </View>
            <FlatList
              data={seats}
              renderItem={renderSeat}
              keyExtractor={(item) => item.id}
              numColumns={4}
              columnWrapperStyle={{ gap: 12 }}
              contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                   <MaterialIcons name="event-seat" size={48} color="#E5E7EB" />
                   <Text style={styles.emptyText}>No seating data available.</Text>
                </View>
              }
            />
          </View>
        ) : (
          <FlatList
            data={bathroomLogs}
            renderItem={renderLog}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                 <MaterialIcons name="check-circle-outline" size={48} color="#D1FAE5" />
                 <Text style={styles.emptyText}>All students are in the hall.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: "bold", textAlign: "center", color: "#111827" },
  headerSubtitle: { fontSize: 12, color: "#6B7280", textAlign: "center" },
  
  tabContainer: {
    flexDirection: "row",
    margin: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tab: { 
    flex: 1, 
    paddingVertical: 12, 
    alignItems: "center", 
    borderRadius: 8 
  },
  tabActive: { backgroundColor: "#4F46E5" },
  tabText: { color: "#6B7280", fontWeight: "600", fontSize: 14 },
  tabTextActive: { color: "#fff", fontWeight: "700" },

  content: { flex: 1, paddingHorizontal: 16 },

  // Seat Grid
  seat: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  seatPresent: { backgroundColor: "#10B981", borderColor: "#059669" },
  seatAbsent: { backgroundColor: "#fff", borderColor: "#E5E7EB", borderStyle: "dashed" },
  seatText: { fontWeight: "bold", fontSize: 16 },
  textWhite: { color: "#fff" },
  textGray: { color: "#9CA3AF" },

  legendContainer: { flexDirection: "row", justifyContent: "center", marginBottom: 20, gap: 24 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 14, color: '#4B5563', fontWeight: "500" },

  // Bathroom Log Styles
  logRow: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  logRowOut: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  logIconContainer: {
    marginRight: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  logName: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  logMatric: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  logTimeLabel: { fontSize: 10, color: "#9CA3AF", marginBottom: 2, textAlign: "right" },
  logTime: { fontSize: 14, color: "#374151", fontWeight: "600", marginBottom: 4, textAlign: "right" },
  
  badgeRed: { backgroundColor: "#DC2626", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  textRed: { color: "#fff", fontSize: 10, fontWeight: "800" },

  emptyState: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#9CA3AF", marginTop: 12, fontSize: 16 },
});