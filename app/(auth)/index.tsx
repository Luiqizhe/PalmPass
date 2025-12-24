import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { checkUserRole } from "../../services/api";
import { db, firebaseAuth } from "../../src/firebase";

// --- DATA ---
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

export default function LoginPage() {
  const router = useRouter();
  
  // Refs
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  // --- STATES ---
  const [isRegistering, setIsRegistering] = useState(false);
  const [role, setRole] = useState<"lecturer" | "student">("student");
  const [isLoading, setIsLoading] = useState(false);

  // Input Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); // 🆕 Added state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false); // 🆕 Added state
  
  // Registration Only Fields
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState(""); 
  const [selectedFaculty, setSelectedFaculty] = useState<any>(null);
  const [program, setProgram] = useState("");
  
  // Modals
  const [activeModal, setActiveModal] = useState<"faculty" | "program" | null>(null);

  // Errors
  const [errors, setErrors] = useState({ email: "", password: "", confirmPassword: "", name: "", id: "", faculty: "", program: "" });
  const [authError, setAuthError] = useState("");

  // --- HANDLERS ---

  const handleRoleChange = (newRole: "lecturer" | "student") => {
    if (role !== newRole) {
      setRole(newRole);
      // Reset registration fields
      setErrors({ email: "", password: "", confirmPassword: "", name: "", id: "", faculty: "", program: "" });
      setAuthError("");
      setSelectedFaculty(null);
      setProgram("");
      setConfirmPassword(""); // Reset confirm password
    }
  };

  const handleForgotPassword = async () => {
    if (!email) return Alert.alert("Missing Email", "Please enter your email address first.");
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      Alert.alert("Email Sent", "Check your inbox for password reset instructions.");
    } catch (error: any) {
      Alert.alert("Error", "Could not send reset email.");
    }
  };

  const handleAuthAction = async () => {
    setAuthError("");
    setErrors({ email: "", password: "", confirmPassword: "", name: "", id: "", faculty: "", program: "" });
    // 1. Common Validation
    let hasError = false;
    if (!email) { setErrors(p => ({...p, email: "Email is required"})); hasError = true; }
    if (!password) { setErrors(p => ({...p, password: "Password is required"})); hasError = true; }

    // 2. Signup Validation
    if (isRegistering) {
        if (!name) { setErrors(p => ({...p, name: "Name is required"})); hasError = true; }
        if (!idNumber) { setErrors(p => ({...p, id: role === "student" ? "Matric Number is required" : "Staff ID is required"})); hasError = true; }
        
        if (!selectedFaculty) { 
            setErrors(p => ({...p, faculty: role === "student" ? "Faculty is required" : "Department is required"})); 
            hasError = true; 
        }

        if (role === 'student' && !program) { 
            setErrors(p => ({...p, program: "Program is required"})); 
            hasError = true; 
        }
        
        if (password !== confirmPassword) {
            setErrors(p => ({...p, confirmPassword: "Passwords do not match"}));
            hasError = true;
        }
    }

    if (hasError) return;

    // 3. BPA Hardcoded Login (Only during Login)
    if (!isRegistering && email === "admin" && password === "admin") {
        router.replace("/(bpa)");
        return;
    }

    setIsLoading(true);

    try {
      if (isRegistering) {
        // SIGN UP FLOW
        const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        const uid = userCredential.user.uid;
        
        if (role === "student") {
            const matricNo = idNumber.toUpperCase();
            
            const profileData = {
                matric_no: matricNo,
                uid: uid,
                name: name,
                program: program.split(' - ')[0], // e.g. "BITS"
                palm_pattern: null
            };
            
            await setDoc(doc(db, "STUDENT", matricNo), profileData);
            router.replace("/(student)");

        } else {
            const lecturerId = idNumber.toUpperCase();

            const profileData = {
                lecturer_id: lecturerId,
                uid: uid,
                name: name,
                email: email,
                department: selectedFaculty.code
            };

            await setDoc(doc(db, "LECTURER", lecturerId), profileData);
            router.replace("/(lecturer)");
        }
        
        Alert.alert("Success", `Account created successfully.`);

      } else {
        // LOGIN FLOW
        const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
        const user = userCredential.user;
        
        const actualRole = await checkUserRole(user.uid);

        if (!actualRole) {
          Alert.alert("Error", "Profile not found. Please contact support.");
          setIsLoading(false);
          await signOut(firebaseAuth);
          return;
        }

        if (actualRole === "student") {
          router.replace("/(student)");
        } else if (actualRole === "lecturer") {
          router.replace("/(lecturer)");
        } else {
          router.replace("/(bpa)");
        }
      }
    } catch (error: any) {
      let msg = "Authentication failed. Please try again.";
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') msg = "Incorrect email or password.";
      else if (error.code === 'auth/invalid-email') msg = "Invalid email format.";
      else if (error.code === 'auth/user-not-found') msg = "No account found. Please sign up.";
      else if (error.code === 'auth/email-already-in-use') msg = "Email already registered. Please login.";
      else if (error.code === 'auth/weak-password') msg = "Password must be at least 6 characters.";
      else if (error.code === 'auth/too-many-requests') msg = "Too many attempts. Try again later.";
      setAuthError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* HEADER */}
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Ionicons name="scan-outline" size={32} color="white" />
            </View>
            <Text style={styles.title}>{"PalmPass"}</Text>
            <Text style={styles.subtitle}>{"Exam Hall Management"}</Text>
          </View>

          {/* FORM CARD */}
          <View style={styles.card}>

            {/* ROLE SWITCH (REGISTER ONLY) */}
            {isRegistering && (
                <View style={styles.roleContainer}>
                <TouchableOpacity onPress={() => handleRoleChange("lecturer")} style={[styles.rolePill, role === "lecturer" && styles.rolePillActive]}>
                    <Ionicons name="school-outline" size={18} color={role === "lecturer" ? "#fff" : "#94a3b8"} />
                    <Text style={[styles.roleText, role === "lecturer" && styles.roleTextActive]}>Lecturer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleRoleChange("student")} style={[styles.rolePill, role === "student" && styles.rolePillActive]}>
                    <Ionicons name="person-outline" size={18} color={role === "student" ? "#fff" : "#94a3b8"} />
                    <Text style={[styles.roleText, role === "student" && styles.roleTextActive]}>Student</Text>
                </TouchableOpacity>
                </View>
            )}

            {/* REGISTER: NAME & ID */}
            {isRegistering && (
                <>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Full Name</Text>
                        <View style={[styles.inputContainer, errors.name ? styles.inputError : null]}>
                            <Ionicons name="person-outline" size={20} color="#94a3b8" />
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Ali bin Abu"
                                placeholderTextColor="#64748b"
                                value={name}
                                onChangeText={(t) => { setName(t); setErrors(p => ({ ...p, name: "" })); }}
                                returnKeyType="next"
                            />
                        </View>
                        {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{role === 'student' ? "Matric Number" : "Staff ID"}</Text>
                        <View style={[styles.inputContainer, errors.id ? styles.inputError : null]}>
                            <Ionicons name="card-outline" size={20} color="#94a3b8" />
                            <TextInput
                                style={styles.input}
                                placeholder={role === 'student' ? "e.g. B032110001" : "e.g. S12345"}
                                placeholderTextColor="#64748b"
                                value={idNumber}
                                onChangeText={(t) => { setIdNumber(t); setErrors(p => ({ ...p, id: "" })); }}
                                autoCapitalize="characters"
                            />
                        </View>
                        {errors.id ? <Text style={styles.errorText}>{errors.id}</Text> : null}
                    </View>

                    {/* FACULTY SELECTOR */}
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
                        {errors.faculty ? <Text style={styles.errorText}>{errors.faculty}</Text> : null}
                    </View>

                    {/* PROGRAM SELECTOR (STUDENT ONLY) */}
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
                </>
            )}

            {/* EMAIL */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={[styles.inputContainer, errors.email ? styles.inputError : null]}>
                <Ionicons name="mail-outline" size={20} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  placeholder={!isRegistering ? "admin or name@example.com" : "name@example.com"}
                  placeholderTextColor="#64748b"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setErrors(p => ({ ...p, email: "" })); setAuthError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
              {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
            </View>

            {/* PASSWORD */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputContainer, errors.password ? styles.inputError : null]}>
                <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" />
                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#64748b"
                  value={password}
                  secureTextEntry={!showPassword}
                  onChangeText={(t) => { setPassword(t); setErrors(p => ({ ...p, password: "" })); setAuthError(""); }}
                  returnKeyType={isRegistering ? "next" : "go"}
                  onSubmitEditing={() => isRegistering ? confirmPasswordInputRef.current?.focus() : handleAuthAction()}
                  blurOnSubmit={!isRegistering}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
            </View>

            {/* 🆕 CONFIRM PASSWORD (REGISTER ONLY) */}
            {isRegistering && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={[styles.inputContainer, errors.confirmPassword ? styles.inputError : null]}>
                    <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" />
                    <TextInput
                      ref={confirmPasswordInputRef}
                      style={styles.input}
                      placeholder="Confirm your password"
                      placeholderTextColor="#64748b"
                      value={confirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      onChangeText={(t) => { setConfirmPassword(t); setErrors(p => ({ ...p, confirmPassword: "" })); }}
                      returnKeyType="go"
                      onSubmitEditing={handleAuthAction}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                  {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword}</Text> : null}
                </View>
            )}

            {/* ERROR BANNER */}
            {authError ? (
              <View style={styles.authErrorContainer}>
                <Ionicons name="alert-circle" size={18} color="#ef4444" />
                <Text style={styles.authErrorText}>{authError}</Text>
              </View>
            ) : null}

            {!isRegistering && (
              <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.button} onPress={handleAuthAction} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.buttonText}>{isRegistering ? "Sign Up" : "Login"}</Text>
              )}
            </TouchableOpacity>

            {/* TOGGLE MODE */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>{isRegistering ? "Already have an account?" : "Don't have an account?"}</Text>
              <TouchableOpacity onPress={() => { setIsRegistering(!isRegistering); setAuthError(""); setErrors({ email: "", password: "", confirmPassword: "", name: "", id: "", faculty: "", program: "" }); setConfirmPassword(""); }}>
                <Text style={styles.footerLink}>{isRegistering ? "Login" : "Sign Up"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* MODAL FOR SELECTION */}
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
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 20 },

  header: { alignItems: "center", marginBottom: 30 },
  logoBox: {
    width: 64, height: 64, backgroundColor: "#38bdf8", borderRadius: 16,
    justifyContent: "center", alignItems: "center", marginBottom: 16,
    shadowColor: "#38bdf8", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
  },
  logoText: { color: "#fff", fontSize: 32, fontWeight: "bold" },
  title: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  subtitle: { fontSize: 14, color: "#94a3b8", marginTop: 4 },

  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155"
  },

  roleContainer: { flexDirection: "row", backgroundColor: "#0f172a", borderRadius: 12, padding: 4, marginBottom: 24 },
  rolePill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10 },
  rolePillActive: { backgroundColor: "#38bdf8" },
  roleText: { marginLeft: 8, fontWeight: "600", color: "#94a3b8" },
  roleTextActive: { color: "#fff" },

  formTitle: { fontSize: 18, fontWeight: "600", color: "#e2e8f0", marginBottom: 20, textAlign: "center" },

  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginBottom: 8 },
  inputContainer: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#0f172a",
    borderWidth: 1, borderColor: "#334155",
    borderRadius: 12, paddingHorizontal: 12, height: 50
  },
  input: { flex: 1, marginLeft: 10, fontSize: 15, color: "#fff" },
  inputError: { borderColor: "#ef4444" },
  errorText: { color: "#ef4444", fontSize: 12, marginTop: 4, marginLeft: 4 },

  // Selector (Dropdown Style)
  selector: { 
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", 
    backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155", 
    borderRadius: 12, paddingHorizontal: 12, height: 50 
  },
  selectorText: { marginLeft: 10, fontSize: 15, color: "#fff", flex: 1 },
  placeholderText: { color: "#64748b" },

  authErrorContainer: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.15)", borderWidth: 1, borderColor: "#ef4444",
    borderRadius: 10, padding: 12, marginBottom: 16, marginTop: 8,
  },
  authErrorText: { color: "#ef4444", fontSize: 13, fontWeight: "500", marginLeft: 8, flex: 1 },

  forgotBtn: { alignSelf: "flex-end", marginBottom: 24 },
  forgotText: { color: "#38bdf8", fontSize: 13, fontWeight: "600" },

  button: {
    backgroundColor: "#38bdf8",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  footer: { flexDirection: "row", justifyContent: "center" },
  footerText: { color: "#94a3b8", fontSize: 14 },
  footerLink: { color: "#38bdf8", fontWeight: "bold", marginLeft: 4, fontSize: 14 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#1e293b", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "60%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottomWidth: 1, borderBottomColor: "#334155", paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  optionItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#334155" },
  optionText: { fontSize: 15, color: "#e2e8f0" },
});