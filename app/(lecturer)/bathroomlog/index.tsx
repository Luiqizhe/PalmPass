import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "../../../src/firebase";
import { styles } from "./_styles";

type BathroomLogParams = {
  exam_id: string;
  subject: string;
  location: string;
  time: string;
};

// Robust date parser
const safeDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  try {
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'string') {
        if (timestamp.includes(":") && timestamp.length <= 8) {
            const now = new Date();
            const [hours, minutes] = timestamp.split(":").map(Number);
            now.setHours(hours, minutes, 0, 0);
            return now;
        }
        return new Date(timestamp);
    } 
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'number') return new Date(timestamp);
  } catch (error) { return null; }
  return null;
};

export default function BathroomLogScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<BathroomLogParams>();
  const { exam_id, subject, location, time } = params;
  
  const insets = useSafeAreaInsets();
  
  const [bathroomLog, setBathroomLog] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isExamEnded, setIsExamEnded] = useState(false);
  
  // Data Maps
  const [studentMap, setStudentMap] = useState<Record<string, any>>({});
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { matric: string, table: string }>>({});

  // --- NEW FEATURES STATES ---
  const [tick, setTick] = useState(0); // Live timer ticker
  const alertedStudentsRef = useRef<Set<string>>(new Set()); // Track alerts
  const BATHROOM_TIME_LIMIT = 6; 

  // 1. LIVE TIMER (Updates every second)
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. CHECK EXAM STATUS
  useEffect(() => {
    if (!exam_id) return;
    const checkExamStatus = async () => {
        try {
            const examRef = doc(db, "EXAM", exam_id);
            const examSnap = await getDoc(examRef);
            if (examSnap.exists()) {
                const data = examSnap.data();
                if (data.date && data.end_time) {
                    const now = new Date();
                    const [year, month, day] = data.date.split("-").map(Number);
                    const [hour, minute] = data.end_time.split(":").map(Number);
                    const examEnd = new Date(year, month - 1, day, hour, minute);
                    const gracePeriod = 15 * 60000; 
                    if (now.getTime() > (examEnd.getTime() + gracePeriod)) setIsExamEnded(true);
                }
            }
        } catch (error) { console.error("Error checking exam status:", error); }
    };
    checkExamStatus();
  }, [exam_id]);

  // 3. LOAD STUDENT NAMES
  useEffect(() => {
    if (isExamEnded) return;
    const unsub = onSnapshot(collection(db, "STUDENT"), snap => {
      const map: any = {};
      snap.forEach(doc => { 
          const data = doc.data();
          if (data.matric_no) map[data.matric_no] = data; 
      });
      setStudentMap(map);
    });
    return unsub;
  }, []);

  // 4. LOAD ATTENDANCE
  useEffect(() => {
    if (!exam_id || isExamEnded) return;
    const q = query(collection(db, "ATTENDANCE"), where("exam_id", "==", exam_id));
    const unsub = onSnapshot(q, snap => {
        const map: Record<string, { matric: string, table: string }> = {};
        snap.forEach(doc => {
            const data = doc.data();
            const info = { matric: data.matric_no || "Unknown", table: data.table_no || "-" };
            map[doc.id] = info;
            if (data.attendance_id) map[data.attendance_id] = info;
        });
        setAttendanceMap(map);
    });
    return unsub;
  }, [exam_id]);

  // 5. LOAD BATHROOM LOGS
  useEffect(() => {
    if (isExamEnded) return;

    const q = query(collection(db, "BATHROOM_LOG"), where("status", "==", "OUT"));
    
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(doc => {
        const d = doc.data();
        const timeOutDate = safeDate(d.exit_time);

        // Resolve Info strictly via Attendance ID
        const attendanceInfo = attendanceMap[d.attendance_id];
        if (!attendanceInfo) return null;

        const matricNo = attendanceInfo.matric;
        const tableNo = attendanceInfo.table;
        const studentName = studentMap[matricNo]?.name || "Unknown Student";

        return {
          id: doc.id,
          ...d,
          attendance_id: d.attendance_id, 
          status: d.status,
          rawExitTime: timeOutDate, 
          
          student_id: matricNo, 
          name: studentName,    
          table_no: tableNo, 
        };
      });

      const activeLogs = data.filter(l => l !== null);
      setBathroomLog(activeLogs);
    });
    return unsub;
  }, [exam_id, studentMap, attendanceMap]);

  // 6. ALERT LOGIC
  useEffect(() => {
  if (isExamEnded) return;

  // Correctly filter students by evaluating each one individually
  const newlyLateStudents = bathroomLog.filter((log) => {
    if (!log.rawExitTime) return false;

    // Use total seconds for high precision calculation
    const secondsAgo = Math.floor((new Date().getTime() - log.rawExitTime.getTime()) / 1000);
    
    // This prevents "early" alerts if the phone clock is slightly fast
    const threshold = (BATHROOM_TIME_LIMIT * 60) + 5;

    // Only return true if they crossed the limit AND haven't been alerted yet
    return secondsAgo >= threshold && !alertedStudentsRef.current.has(log.id);
  });

  // Trigger ONE grouped alert if we found newly late students
  if (newlyLateStudents.length > 0) {
    // Record that these students have been alerted
    newlyLateStudents.forEach(log => alertedStudentsRef.current.add(log.id));

    const namesList = newlyLateStudents.map(log => `• ${log.name} (Table ${log.table_no})`).join("\n");
    const count = newlyLateStudents.length;

    Alert.alert(
      "⚠️ Time Limit Exceeded",
      `${count} student${count > 1 ? 's' : ''} exceeded the ${BATHROOM_TIME_LIMIT}-min limit:\n\n${namesList}`,
      [{ text: "OK", style: "cancel" }]
    );
  }

  // Remove students from the "Already Alerted" list if they return
  const currentIds = new Set(bathroomLog.map(l => l.id));
  alertedStudentsRef.current.forEach(id => {
    if (!currentIds.has(id)) alertedStudentsRef.current.delete(id);
  });
}, [bathroomLog, tick]);

  // --- HELPERS ---
  const formatElapsedTime = (startTime: Date | null) => {
    if (!startTime) return "00:00";
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredLog = bathroomLog.filter(l => 
    (l.name && l.name.toLowerCase().includes(search.toLowerCase())) ||
    (l.student_id && l.student_id.toLowerCase().includes(search.toLowerCase())) ||
    (l.table_no && l.table_no.toLowerCase().includes(search.toLowerCase()))
  );

  filteredLog.sort((a, b) => {
      const timeA = a.rawExitTime ? a.rawExitTime.getTime() : 0;
      const timeB = b.rawExitTime ? b.rawExitTime.getTime() : 0;
      return timeA - timeB; 
  });

  const goBackToHall = () => {
    router.replace({
        pathname: "/(lecturer)/seat-monitoring",
        params: { exam_id, subject, location, time }
    });
  };

  if (isExamEnded) {
    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
           <StatusBar barStyle="light-content" />
           <View style={styles.headerWrapper}>
             <View style={styles.navBar}>
                 <TouchableOpacity onPress={goBackToHall} style={styles.navLeft}>
                     <Ionicons name="chevron-back" size={24} color="#38bdf8" />
                 </TouchableOpacity>
                 <View style={styles.navCenter}>
                     <Text style={styles.navTitle} numberOfLines={1}>{exam_id}</Text>
                     <Text style={styles.navSub} numberOfLines={1}>Exam Completed</Text>
                 </View>
                 <View style={styles.navRight} />
             </View>
           </View>
           <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
               <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#334155", justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                   <Ionicons name="checkmark-done" size={40} color="#94a3b8" />
               </View>
               <Text style={{ color: "white", fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>Exam Has Ended</Text>
               <Text style={{ color: "#94a3b8", textAlign: "center", lineHeight: 22 }}>The scheduled time for this exam has passed. Bathroom monitoring is no longer active.</Text>
               <TouchableOpacity onPress={goBackToHall} style={{ marginTop: 30, backgroundColor: "#38bdf8", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
                   <Text style={{ color: "white", fontWeight: "bold" }}>Back to Dashboard</Text>
               </TouchableOpacity>
           </View>
        </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" />

      {/* NAV BAR */}
      <View style={styles.headerWrapper}>
        <View style={styles.navBar}>
            <TouchableOpacity onPress={goBackToHall} style={styles.navLeft}>
                <Ionicons name="chevron-back" size={24} color="#38bdf8" />
            </TouchableOpacity>
            <View style={styles.navCenter}>
                <Text style={styles.navTitle} numberOfLines={1}>{exam_id}</Text>
                <Text style={styles.navSub} numberOfLines={1}>{location} | {time}</Text>
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
                    placeholderTextColor="#64748b"
                    value={search}
                    onChangeText={setSearch}
                />
            </View>
        </View>
      </View>

      {/* LIST CONTENT */}
      <ScrollView style={styles.contentArea}>
         <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={24} color="#38bdf8" />
            <Text style={styles.sectionTitle}>Bathroom Log (Live)</Text>
            <View style={{backgroundColor: "#3b82f6", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 10}}>
                <Text style={{color: "white", fontWeight: "bold", fontSize: 12}}>{filteredLog.length}</Text>
            </View>
         </View>

         {filteredLog.length === 0 ? (
             <Text style={{color: "#64748b", textAlign: "center", marginTop: 50, fontSize: 16}}>
                No students currently outside.
             </Text>
         ) : (
             filteredLog.map((log, index) => {
                const minutesAgo = log.rawExitTime 
                    ? Math.floor((new Date().getTime() - log.rawExitTime.getTime()) / 60000) 
                    : 0;
                const isLate = minutesAgo >= BATHROOM_TIME_LIMIT;
                
                return (
                    <View key={index} style={[styles.logCard, isLate ? styles.logCardLate : styles.logCardNormal]}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                            
                            {/* LEFT: Info & Live Timer */}
                            <View style={{flex: 1}}>
                                <Text style={styles.cardName}>{log.name}</Text>
                                <Text style={styles.cardId}>{log.student_id}</Text>

                                {/* ⚡ Live Timer Row */}
                                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 6}}>
                                    <Ionicons name="timer-outline" size={16} color={isLate ? "#ef4444" : "#38bdf8"} />
                                    <Text style={{
                                        color: isLate ? "#ef4444" : "#38bdf8", 
                                        fontWeight: "bold", 
                                        marginLeft: 4, 
                                        fontSize: 14
                                    }}>
                                        {formatElapsedTime(log.rawExitTime)}
                                    </Text>
                                    {isLate && (
                                        <Text style={{color: "#ef4444", fontSize: 10, marginLeft: 6, fontWeight:'bold', backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 4, borderRadius: 4}}>
                                            OVER LIMIT
                                        </Text>
                                    )}
                                </View>
                            </View>

                            {/* RIGHT: Student Dashboard Style Table Badge */}
                            <View style={badgeStyles.tableBadge}>
                                <Text style={badgeStyles.tableLabel}>Table</Text>
                                <Text style={badgeStyles.tableValue}>{log.table_no}</Text>
                            </View>
                        </View>
                    </View>
                );
             })
         )}
         <View style={{height: 100}} /> 
      </ScrollView>

      {/* BOTTOM TAB BAR */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={goBackToHall}>
            <Ionicons name="grid-outline" size={24} color="#64748b" />
            <Text style={styles.tabText}>Hall Status</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem}>
            <Ionicons name="timer-outline" size={24} color="#38bdf8" />
            <Text style={[styles.tabText, styles.tabTextActive]}>Bathroom Log</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Inline styles for the specific badge to match Student Dashboard exactly
const badgeStyles = StyleSheet.create({
    tableBadge: {
        backgroundColor: "#0f172a",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#334155",
        minWidth: 60,
        marginLeft: 10
    },
    tableLabel: {
        color: "#94a3b8",
        fontSize: 10,
        textTransform: "uppercase",
        fontWeight: "600",
        marginBottom: 2
    },
    tableValue: {
        color: "white",
        fontSize: 18,
        fontWeight: "bold"
    }
});