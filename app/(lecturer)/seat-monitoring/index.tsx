import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../../../src/firebase";
import SeatDetails from "../seat-details";
import { styles } from "./_styles";

// Helper to handle Firestore Timestamps or Strings
const safeDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  try {
    if (typeof timestamp.toDate === "function") return timestamp.toDate();
    if (typeof timestamp === "string") return new Date(timestamp);
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === "number") return new Date(timestamp);
  } catch { return null; }
  return null;
};

// Helper to format 24h time to 12h AM/PM
const formatTimeStr = (t: string | undefined) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    const suffix = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${suffix}`;
};

export default function SeatMonitoring() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { exam_id, subject, location, time, start_time, end_time } = params;

  const displayTime = time 
    ? time 
    : (start_time && end_time) 
        ? `${formatTimeStr(start_time as string)} - ${formatTimeStr(end_time as string)}` 
        : "Time TBA";

  const [seating, setSeating] = useState<any[]>([]);
  const [studentMap, setStudentMap] = useState<Record<string, any>>({});
  const [bathroomIds, setBathroomIds] = useState<string[]>([]); 
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isStudentsLoaded, setStudentsLoaded] = useState(false);

  // 1. Load Student Data (Map Matric -> Name)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "STUDENT"), (snap) => {
      const map: any = {};
      snap.forEach((doc) => {
        const data = doc.data();
        map[data.matric_no] = data; 
      });
      setStudentMap(map);
      setStudentsLoaded(true);
    });
    return unsub;
  }, []);

  // 2. Load Attendance (The Seat Grid)
  useEffect(() => {
    if (!exam_id) return;
    const q = query(collection(db, "ATTENDANCE"), where("exam_id", "==", exam_id));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => {
        const docData = d.data();
        const matricNo = docData.matric_no;
        const studentData = studentMap[matricNo] || {};
        
        return {
          ...docData,
          attendance_id: d.id,
          matric_no: matricNo,
          name: studentData.name || "Unknown",
          program: studentData.program || "Not Available",
          table_no: docData.table_no || "N/A",
          status: docData.status || "Pending",
          scan_time: safeDate(docData.timestamp),
        };
      });
      data.sort((a, b) => (a.table_no || "").localeCompare(b.table_no || "", undefined, { numeric: true }));
      setSeating(data);
    });
    return unsub;
  }, [exam_id, studentMap]);

  // 3. Load Bathroom Log (Who is OUT?)
  useEffect(() => {
    const q = query(collection(db, "BATHROOM_LOG"), where("status", "==", "OUT"));
    
    const unsub = onSnapshot(q, (snap) => {
      // Just capture the attendance_id of everyone who is OUT.
      // If the ID matches someone in our seat grid, they will turn orange.
      const activeIds = snap.docs.map(doc => doc.data().attendance_id);
      setBathroomIds(activeIds);
    });
    return unsub;
  }, []); // Removed exam_id dependency

  // 4. Color Logic
  const getSeatColor = useCallback((s: any) => {
    if (s.status === "Absent") return "#ef4444"; 
    // Check if this student's attendance_id is in the bathroom list
    if (bathroomIds.includes(s.attendance_id)) return "#f59e0b"; 
    if (s.status === "Present") return "#22c55e"; 
    return "#334155"; 
  }, [bathroomIds]);

  const updateStatus = async (status: string) => {
    if (!selectedStudent) return;
    try {
      const updateData: any = { status };

      if (status === "Present") {
        updateData.timestamp = serverTimestamp(); // Record time
      } else if (status === "Pending") {
        updateData.timestamp = null; // Reset time if pending
      }

      await updateDoc(doc(db, "ATTENDANCE", selectedStudent.attendance_id), updateData);
      setSelectedStudent(null);
    } catch { Alert.alert("Error", "Failed to update status"); }
  };

  const handleMarkOut = async () => {
    if (!selectedStudent) return;
    try {
        // 1. Query existing logs for this student to get the count
        const q = query(
            collection(db, "BATHROOM_LOG"),
            where("attendance_id", "==", selectedStudent.attendance_id)
        );
        const snapshot = await getDocs(q);
        
        // 2. Determine the next log number (e.g., if 0 exist, next is 1)
        const visitCount = snapshot.size + 1;
        
        // 3. Generate the custom log_id
        const customLogId = `${selectedStudent.attendance_id}_${visitCount}`;

        // 4. Save with custom document ID
        await setDoc(doc(db, "BATHROOM_LOG", customLogId), {
            log_id: customLogId,
            attendance_id: selectedStudent.attendance_id, 
            exit_time: serverTimestamp(),
            entry_time: null,
            status: "OUT"
        });

        // 5. Update Attendance Status
        await updateDoc(doc(db, "ATTENDANCE", selectedStudent.attendance_id), {
            status: "Out"
        });

        setSelectedStudent(null);
    } catch (error) {
        Alert.alert("Error", "Failed to mark student out.");
    }
  };

  const handleMarkIn = async () => {
    if (!selectedStudent) return;
    try {
        // 1. Find the open log for this attendance_id
        const q = query(
            collection(db, "BATHROOM_LOG"),
            where("attendance_id", "==", selectedStudent.attendance_id),
            where("status", "==", "OUT")
        );
        const snapshot = await getDocs(q);

        // 2. Update Log(s)
        const updates = snapshot.docs.map(d => updateDoc(d.ref, {
            entry_time: serverTimestamp(),
            status: "RETURNED"
        }));
        await Promise.all(updates);

        // 3. Update Attendance Status
        await updateDoc(doc(db, "ATTENDANCE", selectedStudent.attendance_id), {
            status: "Present"
        });

        setSelectedStudent(null);
    } catch (error) {
        Alert.alert("Error", "Failed to mark student in.");
    }
  };

  const filtered = useMemo(() => {
    return seating.filter((s) => {
      const text = search.toLowerCase();
      return (
        (s.name && s.name.toLowerCase().includes(text)) ||
        (s.table_no && s.table_no.toLowerCase().includes(text)) ||
        (s.matric_no && s.matric_no.toLowerCase().includes(text))
      );
    });
  }, [seating, search]);

  const navigateToBathroomLog = () => {
    router.replace({
      pathname: "/(lecturer)/bathroomlog",
      params: { exam_id, subject, location, time: displayTime }
    });
  };

  if (!isStudentsLoaded) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={{ color: "white", marginTop: 10 }}>Loading Student Names...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerWrapper}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navLeft}>
            <Ionicons name="chevron-back" size={24} color="#38bdf8" />
          </TouchableOpacity>
          <View style={styles.navCenter}>
            <Text style={styles.navTitle}>{exam_id}</Text>
            <Text style={styles.navSub}>{location} | {displayTime}</Text>
          </View>
          <View style={styles.navRight} />
        </View>

        <View style={styles.headerSeparator} />

        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#94a3b8" />
            <TextInput 
              style={styles.searchInput} 
              placeholder="Search by Table, Name, or Matric No..." 
              placeholderTextColor="#64748b " 
              value={search} 
              onChangeText={setSearch} 
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        <View style={styles.sectionHeader}>
          <Ionicons name="people-outline" size={20} color="#38bdf8" />
          <Text style={styles.sectionTitle}>Hall Seating Status</Text>
        </View>
        
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#334155" }]} /><Text style={styles.legendText}>Pending</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#22c55e" }]} /><Text style={styles.legendText}>Present</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#f59e0b" }]} /><Text style={styles.legendText}>Toilet</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#ef4444" }]} /><Text style={styles.legendText}>Absent</Text></View>
        </View>

        <View style={styles.gridContainer}>
          {filtered.map((s) => (
            <TouchableOpacity 
                key={s.attendance_id} 
                style={[styles.seat, { backgroundColor: getSeatColor(s) }]} 
                onPress={() => setSelectedStudent(s)}
            >
              <Text style={styles.seatNumber}>{s.table_no}</Text>
              <Text style={styles.seatName}>{s.name.length > 10 ? s.name.slice(0, 10) + "..." : s.name}</Text>
              
              <View style={styles.statusIconContainer}>
                {s.status === "Present" && !bathroomIds.includes(s.attendance_id) && <Ionicons name="checkmark-circle-outline" size={20} color="white" />}
                {s.status === "Absent" && <Ionicons name="close-circle-outline" size={20} color="white" />}
                {bathroomIds.includes(s.attendance_id) && <Ionicons name="time-outline" size={20} color="white" />}
                {s.status === "Pending" && <Ionicons name="person-outline" size={20} color="#94a3b8" />}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {selectedStudent && (
        <SeatDetails 
          visible={!!selectedStudent} 
          student={selectedStudent} 
          onClose={() => setSelectedStudent(null)} 
          getSeatColor={getSeatColor} 
          updateStatus={updateStatus} 
          onMarkOut={handleMarkOut}
          onMarkIn={handleMarkIn}
          isOut={bathroomIds.includes(selectedStudent.attendance_id)}
          formatTime={(d: any) => d ? d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "-"} 
        />
      )}

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem}>
          <Ionicons name="grid-outline" size={24} color="#38bdf8" />
          <Text style={[styles.tabText, styles.tabTextActive]}>Hall Status</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={navigateToBathroomLog}>
          <Ionicons name="timer-outline" size={24} color="#64748b" />
          <Text style={styles.tabText}>Bathroom Log</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}