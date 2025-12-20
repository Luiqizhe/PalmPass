  import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
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
  
  // Update Type: Map Attendance ID -> Object containing Matric AND Table
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { matric: string, table: string }>>({});

  useEffect(() => {
    if (!exam_id) return;

    const checkExamStatus = async () => {
        try {
            const examRef = doc(db, "EXAM", exam_id);
            const examSnap = await getDoc(examRef);
            
            if (examSnap.exists()) {
                const data = examSnap.data();
                
                // Expecting date="YYYY-MM-DD" and end_time="HH:mm"
                if (data.date && data.end_time) {
                    const now = new Date();
                    
                    const [year, month, day] = data.date.split("-").map(Number);
                    const [hour, minute] = data.end_time.split(":").map(Number);
                    
                    // Create Exam End Date Object
                    const examEnd = new Date(year, month - 1, day, hour, minute);
                    const gracePeriod = 15 * 60000; // 15 minutes in milliseconds

                    // Check if current time has past exam end time more than 15 minutes
                    if (now.getTime() > (examEnd.getTime() + gracePeriod)) {
                        setIsExamEnded(true);
                    }
                }
            }
        } catch (error) {
            console.error("Error checking exam status:", error);
        }
    };
    checkExamStatus();
  }, [exam_id]);

  // 1. Load Student Names
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

  // 2. Load Attendance (Attendance ID -> Matric & Table)
  useEffect(() => {
    if (!exam_id || isExamEnded) return;

    const q = query(collection(db, "ATTENDANCE"), where("exam_id", "==", exam_id));
    const unsub = onSnapshot(q, snap => {
        const map: Record<string, { matric: string, table: string }> = {};
        snap.forEach(doc => {
            const data = doc.data();
            const info = { 
                matric: data.matric_no || "Unknown", 
                table: data.table_no || "-" // Capture Table No
            };
            
            map[doc.id] = info;
            if (data.attendance_id) map[data.attendance_id] = info;
        });
        setAttendanceMap(map);
    });
    return unsub;
  }, [exam_id]);

  // 3. Load Bathroom Logs
  useEffect(() => {
    if (isExamEnded) return;

    const q = query(collection(db, "BATHROOM_LOG"), where("status", "==", "OUT"));
    
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(doc => {
        const d = doc.data();
        
        // Calculate Time
        const timeOutDate = safeDate(d.exit_time);
        let minutesAgo = 0;
        if (timeOutDate) {
            minutesAgo = Math.floor((new Date().getTime() - timeOutDate.getTime()) / 60000);
        }

        // Resolve Info from Attendance Map
        // We look up by attendance_id to get both matric and table
        const attendanceInfo = attendanceMap[d.attendance_id];

        // If this log doesn't match any attendance ID in our map, it belongs to another exam
        if (!attendanceInfo) return null;
        
        const matricNo = attendanceInfo?.matric || d.attendance_id || "Unknown ID";
        const tableNo = attendanceInfo?.table || "-"; // Get Table No
        
        // Resolve Name
        const studentName = studentMap[matricNo]?.name || "Unknown Student";

        return {
          id: doc.id,
          ...d,
          exam_id: d.exam_id, 
          attendance_id: d.attendance_id, 
          status: d.status,
          
          student_id: matricNo, 
          name: studentName,    
          table_no: tableNo, // Add Table No to state
          minutesAgo: isNaN(minutesAgo) ? 0 : minutesAgo
        };
      });

      // Filter
      const activeLogs = data.filter(l => l !== null);
      
      activeLogs.sort((a, b) => b.minutesAgo - a.minutesAgo);
      setBathroomLog(activeLogs);
    });
    return unsub;
  }, [exam_id, studentMap, attendanceMap]);

  const filteredLog = bathroomLog.filter(l => 
    (l.name && l.name.toLowerCase().includes(search.toLowerCase())) ||
    (l.student_id && l.student_id.toLowerCase().includes(search.toLowerCase())) ||
    (l.table_no && l.table_no.toLowerCase().includes(search.toLowerCase()))
  );

  const goBackToHall = () => {
    router.replace({
        pathname: "/seat-monitoring",
        params: { exam_id, subject, location, time }
    });
  };

  if (isExamEnded) {
    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
           <StatusBar barStyle="light-content" />
           
           {/* Header (Keep header so user can navigate back) */}
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
           
           {/* "Exam Ended" Message */}
           <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
               <View style={{ 
                   width: 80, height: 80, borderRadius: 40, backgroundColor: "#334155", 
                   justifyContent: 'center', alignItems: 'center', marginBottom: 20 
               }}>
                   <Ionicons name="checkmark-done" size={40} color="#94a3b8" />
               </View>
               <Text style={{ color: "white", fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>
                   Exam Has Ended
               </Text>
               <Text style={{ color: "#94a3b8", textAlign: "center", lineHeight: 22 }}>
                   The scheduled time for this exam has passed. Bathroom monitoring is no longer active.
               </Text>
               
               <TouchableOpacity 
                  onPress={goBackToHall}
                  style={{ 
                      marginTop: 30, backgroundColor: "#38bdf8", paddingHorizontal: 24, paddingVertical: 12, 
                      borderRadius: 12 
                  }}
               >
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
            <TouchableOpacity onPress={() => router.replace("/")} style={styles.navLeft}>
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
         </View>

         {filteredLog.length === 0 ? (
             <Text style={{color: "#64748b", textAlign: "center", marginTop: 50, fontSize: 16}}>
                No students currently outside.
             </Text>
         ) : (
             filteredLog.map((log, index) => {
                // Check for > 15 minutes
                const isLate = log.minutesAgo > 15;
                
                return (
                    <View key={index} style={[styles.logCard, isLate ? styles.logCardLate : styles.logCardNormal]}>
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardName}>{log.name}</Text>
                            {isLate && <Ionicons name="warning-outline" size={22} color="#facc15" />}
                        </View>
                        
                        {/* Display Table No + Matric No */}
                        <Text style={isLate ? styles.cardIdLate : styles.cardId}>
                           Table {log.table_no} | {log.student_id}
                        </Text>
                        
                        <Text style={isLate ? styles.timeTextYellow : styles.timeTextBlue}>
                            {log.minutesAgo} min ago
                        </Text>
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