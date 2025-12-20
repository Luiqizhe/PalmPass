import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db, firebaseAuth } from "../../src/firebase";

export default function BPADashboard() {
  const router = useRouter();
  
  // Data State
  const [exams, setExams] = useState<any[]>([]);
  const [lecturers, setLecturers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals State
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [lecturerModalVisible, setLecturerModalVisible] = useState(false);
  const [studentModalVisible, setStudentModalVisible] = useState(false);

  // Selected Data for Editing
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [tempAssignments, setTempAssignments] = useState<Set<string>>(new Set());

  // Input States
  const [newExamId, setNewExamId] = useState("");
  const [newExamSubject, setNewExamSubject] = useState("");
  
  const [editDetails, setEditDetails] = useState({
    date: "", start_time: "", end_time: "", location: ""
  });

  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // ==========================
  // PICKER STATES & HELPERS
  // ==========================
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState<"start" | "end" | null>(null);

  const getSafeDate = (dateStr?: string) => {
    if (!dateStr) return new Date();
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const getSafeTime = (timeStr?: string) => {
    const d = new Date();
    if (!timeStr) return d;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return d;
    d.setHours(h, m, 0, 0);
    return d;
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      setEditDetails(prev => ({ ...prev, date: dateStr }));
    }
  };

  const onTimeChange = (event: any, selectedDate?: Date) => {
    const type = showTimePicker;
    if (Platform.OS === 'android') setShowTimePicker(null);
    if (selectedDate && type) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      if (type === 'start') setEditDetails(prev => ({ ...prev, start_time: timeStr }));
      else setEditDetails(prev => ({ ...prev, end_time: timeStr }));
    }
  };

  const confirmIOSPicker = () => {
    setShowDatePicker(false);
    setShowTimePicker(null);
  };

  // ==========================
  // FETCH DATA
  // ==========================
  useEffect(() => {
    const unsubExams = onSnapshot(query(collection(db, "EXAM"), orderBy("exam_id", "asc")), (snap) => {
      setExams(snap.docs.map(doc => ({ exam_id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    const unsubLecturers = onSnapshot(collection(db, "LECTURER"), (snap) => {
      setLecturers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubStudents = onSnapshot(collection(db, "STUDENT"), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubExams(); unsubLecturers(); unsubStudents(); };
  }, []);

  // ==========================
  // ACTIONS
  // ==========================
  const handleCreateStub = async () => {
    if (!newExamId || !newExamSubject) {
        Alert.alert("Error", "ID and Subject are required.");
        return;
    }
    setSaving(true);
    try {
        await setDoc(doc(db, "EXAM", newExamId), {
            exam_id: newExamId,
            subject: newExamSubject,
            date: null, start_time: null, end_time: null, location: null,
            created_at: new Date()
        });
        setCreateModalVisible(false);
        setNewExamId(""); setNewExamSubject("");
        Alert.alert("Success", "Exam created.");
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setSaving(false); }
  };

  const openDetailsModal = (exam: any) => {
    setSelectedExam(exam);
    setEditDetails({
        date: exam.date || "",
        start_time: exam.start_time || "",
        end_time: exam.end_time || "",
        location: exam.location || ""
    });
    setDetailsModalVisible(true);
  };

  const handleSaveDetails = async () => {
    if (!selectedExam) return;
    setSaving(true);
    try {
        await updateDoc(doc(db, "EXAM", selectedExam.exam_id), editDetails);
        setDetailsModalVisible(false);
        Alert.alert("Success", "Exam details updated.");
    } catch (e) { Alert.alert("Error", "Failed to update details."); } finally { setSaving(false); }
  };

  const openLecturerModal = async (exam: any) => {
    setSelectedExam(exam); setSearchTerm("");
    const q = query(collection(db, "INVIGILATION"), where("exam_id", "==", exam.exam_id));
    const snap = await getDocs(q);
    setTempAssignments(new Set(snap.docs.map(d => d.data().lecturer_id)));
    setLecturerModalVisible(true);
  };
  const toggleLecturer = (id: string) => {
    const newSet = new Set(tempAssignments);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setTempAssignments(newSet);
  };
  const saveLecturers = async () => {
    if(!selectedExam) return; setSaving(true);
    try {
        const batch = writeBatch(db);
        const q = query(collection(db, "INVIGILATION"), where("exam_id", "==", selectedExam.exam_id));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
        tempAssignments.forEach(lid => {
            const docId = `${selectedExam.exam_id}_${lid}`;
            batch.set(doc(db, "INVIGILATION", docId), {
                invigilation_id: docId, exam_id: selectedExam.exam_id, lecturer_id: lid, timestamp: new Date()
            });
        });
        await batch.commit(); setLecturerModalVisible(false); Alert.alert("Success", "Invigilators assigned.");
    } catch(e) { Alert.alert("Error", "Failed."); } finally { setSaving(false); }
  };

  const openStudentModal = async (exam: any) => {
    setSelectedExam(exam); setSearchTerm("");
    const q = query(collection(db, "ATTENDANCE"), where("exam_id", "==", exam.exam_id));
    const snap = await getDocs(q);
    setTempAssignments(new Set(snap.docs.map(d => d.data().matric_no)));
    setStudentModalVisible(true);
  };
  const toggleStudent = (id: string) => {
    const newSet = new Set(tempAssignments);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setTempAssignments(newSet);
  };
  const saveStudents = async () => {
    if(!selectedExam) return; setSaving(true);
    try {
        const batch = writeBatch(db);
        const q = query(collection(db, "ATTENDANCE"), where("exam_id", "==", selectedExam.exam_id));
        const snap = await getDocs(q);
        snap.forEach(d => batch.delete(d.ref));
        
        const studentsToAssign = students.filter(s => tempAssignments.has(s.matric_no))
            .sort((a,b) => a.name.localeCompare(b.name));
            
        tempAssignments.forEach(id => {
             if(!studentsToAssign.find(s => s.matric_no === id)) studentsToAssign.push({matric_no: id, name: "Unknown"});
        });
        
        studentsToAssign.forEach((s, idx) => {
            const docId = `${selectedExam.exam_id}_${s.matric_no}`;
            batch.set(doc(db, "ATTENDANCE", docId), {
                attendance_id: docId, exam_id: selectedExam.exam_id, matric_no: s.matric_no,
                student_name: s.name, table_no: (idx+1).toString(), status: "Pending", timestamp: null
            });
        });
        await batch.commit(); setStudentModalVisible(false); Alert.alert("Success", "Students assigned.");
    } catch(e) { Alert.alert("Error", "Failed."); } finally { setSaving(false); }
  };

  const handleDeleteExam = (examId: string) => {
    Alert.alert("Delete Exam", "Confirm delete?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => await deleteDoc(doc(db, "EXAM", examId)) }
    ]);
  };
  const handleLogout = async () => { await signOut(firebaseAuth); router.replace("./(auth)/"); };
  const isDetailsComplete = (e: any) => e.date && e.start_time && e.end_time && e.location;

  // IOS PICKER RENDERER
  const renderIOSPickerModal = () => {
    if (Platform.OS !== 'ios') return null;
    const isDate = showDatePicker;
    const isTime = !!showTimePicker;
    if (!isDate && !isTime) return null;

    return (
        <Modal transparent animationType="fade" visible={true}>
            <View style={styles.iosPickerOverlay}>
                <View style={styles.iosPickerContent}>
                    <View style={styles.iosPickerHeader}>
                        <TouchableOpacity onPress={confirmIOSPicker}>
                            <Text style={styles.iosPickerDone}>Done</Text>
                        </TouchableOpacity>
                    </View>
                    {isDate && (
                        <DateTimePicker value={getSafeDate(editDetails.date)} mode="date" display="spinner" onChange={onDateChange} textColor="white" />
                    )}
                    {isTime && (
                        <DateTimePicker value={getSafeTime(showTimePicker === 'start' ? editDetails.start_time : editDetails.end_time)} mode="time" display="spinner" onChange={onTimeChange} textColor="white" />
                    )}
                </View>
            </View>
        </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View>
            <Text style={styles.title}>BPA Dashboard</Text>
            <Text style={styles.subtitle}>Master Exam Control</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={26} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* EXAM LIST */}
      {loading ? (
        <ActivityIndicator size="large" color="#38bdf8" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={exams}
          keyExtractor={(item) => item.exam_id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={{flex: 1}}>
                        <Text style={styles.examTitle}>{item.exam_id}</Text>
                        <Text style={styles.examSubTitle}>{item.subject}</Text>
                    </View>
                    {isDetailsComplete(item) && <Ionicons name="checkmark-circle" size={22} color="#22c55e" style={{marginLeft: 10}} />}
                </View>
                
                <Text style={styles.examDetail}>
                    {isDetailsComplete(item) 
                        ? `${item.date} | ${item.start_time}-${item.end_time} | ${item.location}` 
                        : "⚠️ Details missing"}
                </Text>

                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openDetailsModal(item)}>
                        <Ionicons name="create-outline" size={16} color="#38bdf8" />
                        <Text style={styles.actionText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openLecturerModal(item)}>
                        <Ionicons name="person-outline" size={16} color="#facc15" />
                        <Text style={[styles.actionText, {color: "#facc15"}]}>Staff</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openStudentModal(item)}>
                        <Ionicons name="people-outline" size={16} color="#34d399" />
                        <Text style={[styles.actionText, {color: "#34d399"}]}>Students</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconAction} onPress={() => handleDeleteExam(item.exam_id)}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No exams found.</Text>}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}>
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      {/* --- MODAL 1: CREATE STUB --- */}
      <Modal animationType="slide" transparent visible={createModalVisible} onRequestClose={() => setCreateModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>New Exam Skeleton</Text>
                <TextInput placeholder="Exam ID (e.g. BITS1234)" placeholderTextColor="#64748b" style={styles.input} value={newExamId} onChangeText={setNewExamId} />
                <TextInput placeholder="Subject Name" placeholderTextColor="#64748b" style={styles.input} value={newExamSubject} onChangeText={setNewExamSubject} />
                <TouchableOpacity onPress={handleCreateStub} style={styles.saveBtn} disabled={saving}>
                    {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Create Skeleton</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL 2: EDIT DETAILS --- */}
      <Modal animationType="slide" transparent visible={detailsModalVisible} onRequestClose={() => setDetailsModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Update Exam Details</Text>
                
                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.input, {justifyContent: 'center'}]}>
                    <Text style={{color: editDetails.date ? "white" : "#64748b"}}>{editDetails.date || "Select Date (YYYY-MM-DD)"}</Text>
                </TouchableOpacity>

                <View style={{flexDirection: 'row', gap: 10}}>
                    <TouchableOpacity onPress={() => setShowTimePicker('start')} style={[styles.input, {flex: 1, justifyContent: 'center'}]}>
                         <Text style={{color: editDetails.start_time ? "white" : "#64748b"}}>{editDetails.start_time || "Start Time"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowTimePicker('end')} style={[styles.input, {flex: 1, justifyContent: 'center'}]}>
                         <Text style={{color: editDetails.end_time ? "white" : "#64748b"}}>{editDetails.end_time || "End Time"}</Text>
                    </TouchableOpacity>
                </View>

                <TextInput placeholder="Location" placeholderTextColor="#64748b" style={styles.input} value={editDetails.location} onChangeText={t => setEditDetails({...editDetails, location: t})} />

                <TouchableOpacity onPress={handleSaveDetails} style={styles.saveBtn} disabled={saving}>
                    {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Details</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDetailsModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>

                {/* ANDROID PICKERS */}
                {Platform.OS === 'android' && showDatePicker && <DateTimePicker value={getSafeDate(editDetails.date)} mode="date" display="default" onChange={onDateChange} />}
                {Platform.OS === 'android' && showTimePicker && <DateTimePicker value={getSafeTime(showTimePicker === 'start' ? editDetails.start_time : editDetails.end_time)} mode="time" display="default" onChange={onTimeChange} />}
                
                {/* IOS PICKER OVERLAY INSIDE MODAL */}
                {Platform.OS === 'ios' && (showDatePicker || showTimePicker) && (
                    <View style={styles.iosPickerAbsolute}>
                        <View style={styles.iosPickerContent}>
                            <View style={styles.iosPickerHeader}>
                                <TouchableOpacity onPress={confirmIOSPicker}><Text style={styles.iosPickerDone}>Done</Text></TouchableOpacity>
                            </View>
                            {showDatePicker && <DateTimePicker value={getSafeDate(editDetails.date)} mode="date" display="spinner" onChange={onDateChange} textColor="white" />}
                            {showTimePicker && <DateTimePicker value={getSafeTime(showTimePicker === 'start' ? editDetails.start_time : editDetails.end_time)} mode="time" display="spinner" onChange={onTimeChange} textColor="white" />}
                        </View>
                    </View>
                )}
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL 3 & 4 (LECTURERS / STUDENTS) --- */}
      {/* (Logic remains same, just ensuring styles are applied correctly) */}
      <Modal animationType="slide" visible={lecturerModalVisible} onRequestClose={() => setLecturerModalVisible(false)}>
         <SafeAreaView style={styles.fullScreenModal}>
            <View style={styles.fullScreenHeader}>
                <Text style={styles.modalTitle}>Assign Invigilators</Text>
                <TouchableOpacity onPress={() => setLecturerModalVisible(false)}><Ionicons name="close" size={28} color="white" /></TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color="#94a3b8" />
                <TextInput style={styles.searchInput} placeholder="Search Lecturers..." placeholderTextColor="#64748b" value={searchTerm} onChangeText={setSearchTerm}/>
            </View>
            <FlatList 
                data={lecturers.filter(l => l.name?.toLowerCase().includes(searchTerm.toLowerCase()))}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                    <TouchableOpacity style={[styles.listItem, tempAssignments.has(item.lecturer_id) && styles.listItemActive]} onPress={() => toggleLecturer(item.lecturer_id)}>
                        <Text style={[styles.listName, tempAssignments.has(item.lecturer_id) && styles.listNameActive]}>{item.name}</Text>
                        <Text style={styles.listSub}>{item.lecturer_id} | {item.department}</Text>
                        {tempAssignments.has(item.lecturer_id) && <Ionicons name="checkmark-circle" size={24} color="#38bdf8" style={{position: 'absolute', right: 15}} />}
                    </TouchableOpacity>
                )}
            />
            <TouchableOpacity onPress={saveLecturers} style={styles.bottomBtn} disabled={saving}><Text style={styles.saveBtnText}>{saving ? "Saving..." : `Confirm (${tempAssignments.size})`}</Text></TouchableOpacity>
         </SafeAreaView>
      </Modal>

      <Modal animationType="slide" visible={studentModalVisible} onRequestClose={() => setStudentModalVisible(false)}>
         <SafeAreaView style={styles.fullScreenModal}>
            <View style={styles.fullScreenHeader}>
                <Text style={styles.modalTitle}>Assign Students</Text>
                <TouchableOpacity onPress={() => setStudentModalVisible(false)}><Ionicons name="close" size={28} color="white" /></TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color="#94a3b8" />
                <TextInput style={styles.searchInput} placeholder="Search Students..." placeholderTextColor="#64748b" value={searchTerm} onChangeText={setSearchTerm}/>
            </View>
            <FlatList 
                data={students.filter(s => s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.matric_no?.toLowerCase().includes(searchTerm.toLowerCase()))}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                    <TouchableOpacity style={[styles.listItem, tempAssignments.has(item.matric_no) && styles.listItemActive]} onPress={() => toggleStudent(item.matric_no)}>
                        <Text style={[styles.listName, tempAssignments.has(item.matric_no) && styles.listNameActive]}>{item.name}</Text>
                        <Text style={styles.listSub}>{item.matric_no} | {item.program}</Text>
                        {tempAssignments.has(item.matric_no) && <Ionicons name="checkmark-circle" size={24} color="#38bdf8" style={{position: 'absolute', right: 15}} />}
                    </TouchableOpacity>
                )}
            />
            <TouchableOpacity onPress={saveStudents} style={styles.bottomBtn} disabled={saving}><Text style={styles.saveBtnText}>{saving ? "Saving..." : `Confirm (${tempAssignments.size})`}</Text></TouchableOpacity>
         </SafeAreaView>
      </Modal>

      {renderIOSPickerModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingTop: 10 },
  title: { fontSize: 24, fontWeight: "bold", color: "#38bdf8" },
  subtitle: { fontSize: 14, color: "#94a3b8" },
  iconBtn: { padding: 8 },
  
  // Compact Card Style
  card: { backgroundColor: "#1e293b", padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: "#334155" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  
  examTitle: { color: "#38bdf8", fontSize: 18, fontWeight: "bold" },
  examSubTitle: { color: "white", fontSize: 15, fontWeight: "600", marginTop: 2 },
  examDetail: { color: "#cbd5e1", fontSize: 13, marginBottom: 12 },
  
  // Compact Action Row
  actionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: "#0f172a", 
    paddingHorizontal: 8, // reduced
    paddingVertical: 6,   // reduced
    borderRadius: 6, 
    borderWidth: 1, 
    borderColor: "#334155" 
  },
  actionText: { color: "#38bdf8", fontSize: 12, fontWeight: "600", marginLeft: 4 }, // reduced font size
  iconAction: { padding: 6, marginLeft: 'auto' },

  emptyText: { textAlign: "center", color: "#64748b", marginTop: 40, fontSize: 16 },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#38bdf8', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 8, zIndex: 50 },
  
  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#1e293b", padding: 20, borderRadius: 15, borderWidth: 1, borderColor: "#334155", overflow: 'hidden' },
  modalTitle: { color: "white", fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  input: { backgroundColor: "#0f172a", color: "white", padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: "#334155", height: 50 },
  saveBtn: { backgroundColor: "#38bdf8", padding: 15, borderRadius: 8, alignItems: "center", marginTop: 10 },
  saveBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },
  cancelBtn: { marginTop: 10, alignItems: 'center' },
  cancelText: { color: "#94a3b8" },

  // Full Screen Modal
  fullScreenModal: { flex: 1, backgroundColor: "#0f172a" },
  fullScreenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: "#334155" },
  searchBox: { flexDirection: 'row', backgroundColor: "#1e293b", margin: 15, padding: 10, borderRadius: 10, alignItems: 'center' },
  searchInput: { flex: 1, color: "white", marginLeft: 10, fontSize: 16 },
  listItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#334155" },
  listItemActive: { backgroundColor: "rgba(56, 189, 248, 0.1)" },
  listName: { color: "#cbd5e1", fontSize: 16, fontWeight: "600" },
  listNameActive: { color: "#38bdf8" },
  listSub: { color: "#64748b", fontSize: 13, marginTop: 2 },
  bottomBtn: { backgroundColor: "#38bdf8", padding: 15, margin: 20, borderRadius: 10, alignItems: 'center' },

  // iOS Picker Absolute Styles
  iosPickerAbsolute: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: "#1e293b", borderTopWidth: 1, borderTopColor: "#334155" },
  iosPickerContent: { paddingBottom: 20 },
  iosPickerHeader: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#334155", alignItems: "flex-end", backgroundColor: "#0f172a" },
  iosPickerDone: { color: "#38bdf8", fontSize: 16, fontWeight: "bold" },
  iosPickerOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }
});