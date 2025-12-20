import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
    collection,
    onSnapshot,
    query,
    where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { getStudentProfile } from "../../services/api";
import { db, firebaseAuth } from "../../src/firebase";

export default function StudentDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [attendanceMap, setAttendanceMap] = useState<Record<string, any>>({});
  const [availableExams, setAvailableExams] = useState<any[]>([]);
  const [myExams, setMyExams] = useState<any[]>([]);

  // Details Modal (View Only)
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [viewingExam, setViewingExam] = useState<any>(null);

  const formatTime = (timeString: string) => {
    if (!timeString) return "TBA";
    const [hours, minutes] = timeString.split(":").map(Number);
    const suffix = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12; 
    const minutesFormatted = minutes < 10 ? `0${minutes}` : minutes;
    return `${hours12}:${minutesFormatted} ${suffix}`;
  };

  useEffect(() => {
    const loadData = async () => {
      if (firebaseAuth.currentUser) {
        const studentData = await getStudentProfile(firebaseAuth.currentUser.uid);
        setProfile(studentData);
      }
    };
    loadData();
  }, []);

  // Listeners
  useEffect(() => {
    if (!profile?.matric_no) return;

    const attendanceQ = query(collection(db, "ATTENDANCE"), where("matric_no", "==", profile.matric_no));
    const unsubAttendance = onSnapshot(attendanceQ, (snap) => {
        const map: Record<string, any> = {};
        snap.forEach(doc => {
            const d = doc.data();
            map[d.exam_id] = {
                attendance_id: doc.id,
                table_no: d.table_no,
                status: d.status
            };
        });
        setAttendanceMap(map);
    });

    const examQ = query(collection(db, "EXAM"));
    const unsubExam = onSnapshot(examQ, (snap) => {
        const exams = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailableExams(exams);
        setLoading(false);
    });

    return () => { unsubAttendance(); unsubExam(); };
  }, [profile]);

  useEffect(() => {
    const merged = availableExams
        .filter(exam => attendanceMap[exam.id])
        .map(exam => ({
            ...exam,
            ...attendanceMap[exam.id]
        }));
    setMyExams(merged);
  }, [attendanceMap, availableExams]);

  const handleLogout = async () => {
      Alert.alert("Logout", "Confirm logout?", [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: async () => { await signOut(firebaseAuth); router.replace("./(auth)/"); } }
      ]);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        
        <View style={styles.header}>
            <View>
            <Text style={styles.title}>My Exams</Text>
            <Text style={styles.subtitle}>{profile ? `${profile.name} (${profile.matric_no})` : "Loading..."}</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}>
                <Ionicons name="log-out-outline" size={26} color="#94a3b8" />
            </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator size="large" color="#38bdf8" /> : (
            <FlatList
            data={myExams}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
                <TouchableOpacity 
                    activeOpacity={0.9} 
                    onPress={() => { setViewingExam(item); setDetailsModalVisible(true); }}
                >
                    <View style={styles.card}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                            <View style={{flex: 1}}>
                                <Text style={styles.examTitle}>{item.exam_id}</Text>
                                <Text style={styles.examSubTitle}>{item.subject}</Text>
                            </View>
                            <View style={styles.tableBadge}>
                                <Text style={styles.tableLabel}>Table</Text>
                                <Text style={styles.tableValue}>{item.table_no || "-"}</Text>
                            </View>
                        </View>
                        
                        <View style={styles.divider} />

                        <Text style={styles.examDetail}>📅 {item.date || "TBA"} | 📍 {item.location}</Text>
                        <Text style={styles.examDetail}>
                            🕒 {formatTime(item.start_time)} - {formatTime(item.end_time)}
                        </Text>
                    </View>
                </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No registered exams found.</Text>}
            />
        )}

        {/* DETAILS MODAL (Read Only) */}
        <Modal animationType="slide" transparent visible={detailsModalVisible} onRequestClose={() => setDetailsModalVisible(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { height: 'auto', paddingBottom: 40 }]}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Exam Details</Text>
                        <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                            <Ionicons name="close" size={24} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>
                    
                    {viewingExam && (
                        <View>
                            <Text style={styles.detailTitle}>{viewingExam.exam_id}</Text>
                            <Text style={styles.detailSub}>{viewingExam.subject}</Text>
                            
                            <View style={styles.detailRow}>
                                <Ionicons name="calendar-outline" size={20} color="#38bdf8" />
                                <Text style={styles.detailText}>{viewingExam.date}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Ionicons name="time-outline" size={20} color="#38bdf8" />
                                <Text style={styles.detailText}>{formatTime(viewingExam.start_time)} - {formatTime(viewingExam.end_time)}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Ionicons name="location-outline" size={20} color="#38bdf8" />
                                <Text style={styles.detailText}>{viewingExam.location}</Text>
                            </View>
                             <View style={styles.divider} />
                            <Text style={styles.inputLabel}>My Table Number: <Text style={{color:"white", fontWeight:'bold'}}>{viewingExam.table_no || "N/A"}</Text></Text>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
        
        </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingTop: 10 },
  title: { fontSize: 24, fontWeight: "bold", color: "#6190d7ff" },
  subtitle: { fontSize: 14, color: "#94a3b8", marginTop: 4 },
  iconBtn: { padding: 8 },
  card: { backgroundColor: "#1e293b", padding: 20, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: "#334155" },
  examTitle: { color: "#38bdf8", fontSize: 18, fontWeight: "bold" },
  examSubTitle: { color: "white", fontSize: 16, marginBottom: 8, fontWeight: "600" },
  examDetail: { color: "#cbd5e1", fontSize: 14, marginBottom: 4 },
  divider: { height: 1, backgroundColor: "#334155", marginVertical: 10 },
  tableBadge: { backgroundColor: "#0f172a", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: "#334155" },
  tableLabel: { color: "#94a3b8", fontSize: 10, textTransform: "uppercase" },
  tableValue: { color: "white", fontSize: 16, fontWeight: "bold" },
  emptyText: { textAlign: "center", color: "#64748b", marginTop: 40, fontSize: 16 },
  
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#1e293b", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15, borderBottomWidth: 1, borderBottomColor: "#334155", paddingBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "white" },
  detailTitle: { fontSize: 24, fontWeight: "bold", color: "#38bdf8", marginBottom: 4 },
  detailSub: { fontSize: 18, color: "white", marginBottom: 20, fontWeight: "600" },
  detailRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  detailText: { color: "#cbd5e1", fontSize: 16, marginLeft: 10 },
  inputLabel: { color: "#94a3b8", fontSize: 14, marginBottom: 8, marginTop: 10 },
});