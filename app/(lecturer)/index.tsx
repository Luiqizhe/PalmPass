import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { db, firebaseAuth } from "../../src/firebase";
import { styles } from "./_styles";

export default function LecturerDashboard() {
  const router = useRouter();
  const user = firebaseAuth.currentUser;

  if (!user) return <Redirect href="./(auth)/" />;

  const [lecturerId, setLecturerId] = useState<string | null>(null);
  const [lecturerEmail, setLecturerEmail] = useState<string>("");
  const [lecturerDept, setLecturerDept] = useState<string>("");
  
  const [loading, setLoading] = useState(true);
  const [invigilatedExamIds, setInvigilatedExamIds] = useState<Set<string>>(new Set());
  const [allExams, setAllExams] = useState<any[]>([]);
  const [myExams, setMyExams] = useState<any[]>([]);

  const formatTime = (timeString: string) => {
    if (!timeString) return "TBA";
    const [hours, minutes] = timeString.split(":").map(Number);
    const suffix = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12; 
    const minutesFormatted = minutes < 10 ? `0${minutes}` : minutes;
    return `${hours12}:${minutesFormatted} ${suffix}`;
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const q = query(collection(db, "LECTURER"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setLecturerId(data.lecturer_id);
          setLecturerEmail(data.email || user.email || "No Email Provided");
          setLecturerDept(data.department || "Faculty");
        }
      } catch (e) { console.error("Profile Error", e); }
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    if (!lecturerId) return;

    const invigilationQ = query(collection(db, "EXAM_INVIGILATOR"), where("lecturer_id", "==", lecturerId));
    const unsubInvigilation = onSnapshot(invigilationQ, (snap) => {
      const ids = new Set<string>();
      snap.forEach(doc => ids.add(doc.data().exam_id));
      setInvigilatedExamIds(ids);
    });

    const examQ = query(collection(db, "EXAM"));
    const unsubExam = onSnapshot(examQ, (snap) => {
      const exams = snap.docs.map(doc => ({
        exam_id: doc.id, 
        ...doc.data()
      }));
      setAllExams(exams);
      setLoading(false);
    });

    return () => { unsubInvigilation(); unsubExam(); };
  }, [lecturerId]);

  useEffect(() => {
    const filtered = allExams.filter(exam => invigilatedExamIds.has(exam.exam_id));
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    setMyExams(filtered);
  }, [invigilatedExamIds, allExams]);

  const handleLogout = () => {
    Alert.alert("Logout", "Confirm logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: async () => { await signOut(firebaseAuth); router.replace("./(auth)/"); } },
    ]);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Invigilation</Text>
            <Text style={styles.subtitle}>
                {lecturerEmail ? `${lecturerEmail} | ${lecturerDept}` : "Loading Profile..."}
            </Text>
          </View>
          <TouchableOpacity 
            style={{ padding: 8 }} 
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={26} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#38bdf8" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={myExams}
            keyExtractor={(item) => item.exam_id}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.card} 
                onPress={() => router.push({ pathname: "/(lecturer)/seat-monitoring", params: item })}
                activeOpacity={0.9}
              >
                {/* Header Section: Code & Name */}
                <View>
                    <Text style={styles.examTitle}>{item.exam_id}</Text>
                    <Text style={styles.examSubTitle}>{item.subject}</Text>
                </View>

                {/* Divider Line */}
                <View style={styles.divider} />

                {/* Details Section */}
                <Text style={styles.examDetail}>📅 {item.date} | 📍 {item.location}</Text>
                <Text style={styles.examDetail}>🕒 {formatTime(item.start_time)} - {formatTime(item.end_time)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No invigilation duties assigned.</Text>
            }
          />
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}