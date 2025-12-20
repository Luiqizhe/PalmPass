import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createUserProfile } from "../../services/api";
import { firebaseAuth } from "../../src/firebase";

const FACULTY_DATA = [
  {
    code: "FTMK",
    programs: [
      "BITC - Bachelor of Computer Science (Computer Networking) with Honours",
      "BITS - Bachelor of Computer Science (Software Development) with Honours",
      "BITA - Bachelor of Technology in Cloud Computing and Application with Honours",
      "BITM - Bachelor of Computer Science (Interactive Media) with Honours",
      "BITD - Bachelor of Computer Science (Database Management) with Honours",
      "BITE - Bachelor of Information Technology (Game Technology) with Honours",
      "DCS - Diploma in Computer Science"
    ]
  },
  {
    code: "FAIX",
    programs: [
      "BAXZ - Bachelor of Computer Science (Computer Security) with Honours ",
      "BAXI - Bachelor of Computer Science (Artificial Intelligence) with Honours"
    ]
  },
  {
    code: "FTKEK",
    programs: [
      "BERG - Bachelor of Electronics Engineering with Honours",
      "BERR - Bachelor of Computer Engineering with Honours",
      "BERE - Bachelor of Electronics Engineering Technology (Industrial Electronics) with Honours",
      "BERC - Bachelor of Computer Engineering Technology (Computer Systems) with Honours",
      "BERZ - Bachelor of Electronics Engineering Technology (Telecommunications) with Honours",
      "BERT - Bachelor of Electronics Engineering Technology with Honours",
      "BERL - Bachelor of Technology in Industrial Electronic Automation with Honours",
      "BERV - Bachelor of Technology in Internet of Things (IoT) with Honours",
      "BERW - Bachelor of Technology in Telecommunications with Honours",
      "DER - Diploma in Electronic Engineering"
    ]
  },
  {
    code: "FTKM",
    programs: [
      "BMKU - Bachelor of Mechanical Engineering with Honours",
      "BMKK - Bachelor of Automotive Engineering with Honours",
      "BMKV - Bachelor of Mechanical Engineering Technology with Honours",
      "BMKM - Bachelor of Mechanical Engineering Technology (Maintenance Technology) with Honours",
      "BMKH - Bachelor of Mechanical Engineering Technology (Refrigeration and Air-Conditioning System) with Honours",
      "BMKA - Bachelor of Mechanical Engineering Technology (Automotive Technology) with Honours",
      "BMKS - Bachelor of Technology in Air-Conditioning and Refrigeration with Honours",
      "BMKF - Bachelor of Technology in Automotive with Honours",
      "DMK - Diploma in Mechanical Engineering"
    ]
  },
  {
    code: "FTKE",
    programs: [
      "BELG - Bachelor of Electrical Engineering with Honours",
      "BELM - Bachelor of Mechatronics Engineering with Honours",
      "BELK - Bachelor of Electrical Engineering Technology (Industrial Power) with Honours",
      "BELR - Bachelor of Electrical Engineering Technology (Industrial Automation & Robotics) with Honours",
      "BELT - Bachelor of Electrical Engineering Technology with Honours",
      "BELS - Bachelor of Technology in Electrical System  Maintenance with Honours",
      "DEL - Diploma in Electrical Engineering"
    ]
  },
  {
    code: "FTKIP",
    programs: [
      "BMIG - Bachelor of Manufacturing Engineering",
      "BMIF - Bachelor of Industrial Engineering",
      "BMID - Bachelor of Manufacturing Engineering Technology - Product Design",
      "BMIP - Bachelor of Manufacturing Engineering Technology - Process and Technology",
      "BMIW - Bachelor of Manufacturing Engineering Technology",
      "BMIK - Bachelor of Technology in Welding",
      "BMIM - Bachelor of Technology in Industrial Machining",
      "DMI - Diploma of Manufacturing Engineering"
    ]
  },
  {
    code: "FPTT",
    programs: [
      "BTEC - Bachelor of Technopreneurship",
      "BTMS - Bachelor of Technology Management (Supply Chain Management & Logistics)",
      "BTMM - Bachelor of Technology Management (High Technology Marketing)",
      "BTMI - Bachelor of Technology Management (Technology Innovation)"
    ]
  }
];

export default function CompleteProfilePage() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  const role = (params.role as "lecturer" | "student") || "student";
  const email = (params.email as string) || firebaseAuth.currentUser?.email || "";

  const [name, setName] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<any>(null); 
  const [program, setProgram] = useState(""); 
  const [loading, setLoading] = useState(false);
  const [activeModal, setActiveModal] = useState<"faculty" | "program" | null>(null);

  const handleSaveProfile = async () => {
    if (!name || !selectedFaculty) return Alert.alert("Error", "Please fill in all fields.");
    if (role === "student" && !program) return Alert.alert("Error", "Program is required.");

    setLoading(true);
    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error("No user.");
      const matricOrId = email.split('@')[0].toUpperCase();

      await createUserProfile(user.uid, role, email, matricOrId, name, role === "student" ? program.split(' - ')[0] : "", role === "lecturer" ? selectedFaculty.code : "");

      if (role === "student") router.replace("/(student)");
      else router.replace("/(lecturer)");
    } catch (error: any) {
      Alert.alert("Error", "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => signOut(firebaseAuth).then(() => router.replace("/"))} style={styles.navLeft}>
            <Ionicons name="chevron-back" size={24} color="#38bdf8" />
          </TouchableOpacity>
          <View>
             <Text style={styles.navTitle}>Complete Profile</Text>
          </View>
          <View style={{width: 24}}/>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter full name"
                  placeholderTextColor="#64748b"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{role === "student" ? "Faculty" : "Department"}</Text>
              <TouchableOpacity style={styles.selector} onPress={() => setActiveModal("faculty")}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="business-outline" size={20} color="#94a3b8" />
                    <Text style={[styles.selectorText, !selectedFaculty && styles.placeholderText]}>
                        {selectedFaculty ? selectedFaculty.code : "Select Faculty"}
                    </Text>
                </View>
                <Ionicons name="chevron-down" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {role === "student" && (
              <View style={[styles.inputGroup, !selectedFaculty && { opacity: 0.5 }]}>
                <Text style={styles.label}>Program</Text>
                <TouchableOpacity 
                  style={styles.selector} 
                  onPress={() => selectedFaculty && setActiveModal("program")}
                  disabled={!selectedFaculty}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="school-outline" size={20} color="#94a3b8" />
                    <Text style={[styles.selectorText, !program && styles.placeholderText]} numberOfLines={1}>
                        {program || "Select Program"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.button} onPress={handleSaveProfile} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save & Continue</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* MODAL */}
        <Modal animationType="slide" transparent visible={activeModal !== null} onRequestClose={() => setActiveModal(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Option</Text>
                <TouchableOpacity onPress={() => setActiveModal(null)}><Ionicons name="close" size={24} color="#94a3b8" /></TouchableOpacity>
              </View>
              <FlatList
                data={activeModal === "faculty" ? FACULTY_DATA : (selectedFaculty ? selectedFaculty.programs : [])}
                keyExtractor={(item: any) => activeModal === "faculty" ? item.code : item}
                renderItem={({ item }: any) => (
                  <TouchableOpacity style={styles.optionItem} onPress={() => {
                    if (activeModal === "faculty") { setSelectedFaculty(item); setProgram(""); }
                    else setProgram(item);
                    setActiveModal(null);
                  }}>
                    <Text style={styles.optionText}>{activeModal === "faculty" ? item.code : item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20 },
  navLeft: { padding: 4 },
  navTitle: { fontSize: 20, fontWeight: "bold", color: "#6190d7ff" },
  
  scrollContainer: { padding: 20 },
  card: { backgroundColor: "#1e293b", borderRadius: 12, padding: 20, borderWidth: 1, borderColor: "#334155" },
  
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginBottom: 8 },
  inputContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155", borderRadius: 12, paddingHorizontal: 12, height: 50 },
  input: { flex: 1, marginLeft: 10, fontSize: 15, color: "#fff" },
  
  selector: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155", borderRadius: 12, paddingHorizontal: 12, height: 50 },
  selectorText: { marginLeft: 10, fontSize: 15, color: "#fff", flex: 1 },
  placeholderText: { color: "#64748b" },

  button: { backgroundColor: "#38bdf8", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#1e293b", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "60%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottomWidth: 1, borderBottomColor: "#334155", paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  optionItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#334155" },
  optionText: { fontSize: 15, color: "#e2e8f0" },
});