import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword
} from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { db, firebaseAuth } from "../../src/firebase";

export default function LoginPage() {
  const router = useRouter();
  const passwordInputRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [errors, setErrors] = useState({ email: "", password: "" });

  const handleForgotPassword = async () => {
    if (!email) return Alert.alert("Missing Email", "Please enter your email address first.");
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      Alert.alert("Email Sent", "Check your inbox for password reset instructions.");
    } catch (error: any) {
      Alert.alert("Error", "Could not send reset email.");
    }
  };

  const handleLogin = async () => {
    // 1. Validation
    const newErrors = {
      email: email ? "" : "Email/Username is required",
      password: password ? "" : "Password is required",
    };
    setErrors(newErrors);
    if (newErrors.email || newErrors.password) return;

    // ➕ ADDED: Hardcoded Admin Login
    if (email === "admin" && password === "admin") {
        router.replace("/(bpa)");
        return; 
    }

    setIsLoading(true);
    try {
      // 2. Firebase Auth Login (For Lecturers & Students)
      const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      const uid = userCredential.user.uid;

      console.log("Authenticated User:", uid);

      // 3. Role Auto-Detection Strategy
      
      // Check LECTURER
      const lecturerQuery = query(collection(db, "LECTURER"), where("uid", "==", uid));
      const lecturerSnap = await getDocs(lecturerQuery);
      if (!lecturerSnap.empty) {
        router.replace("/(lecturer)");
        return;
      }

      // Check STUDENT
      const studentQuery = query(collection(db, "STUDENT"), where("uid", "==", uid));
      const studentSnap = await getDocs(studentQuery);
      if (!studentSnap.empty) {
        router.replace("/(student)");
        return;
      }

      // 4. Fallback if no role is found in DB
      Alert.alert("Access Denied", "No profile found associated with this account.");
      await firebaseAuth.signOut();

    } catch (error: any) {
      let msg = "Login failed.";
      if (error.code === 'auth/wrong-password') msg = "Incorrect password."; 
      else if (error.code === 'auth/user-not-found') msg = "No user found with this email.";
      else if (error.code === 'auth/invalid-email') msg = "Invalid email format.";
      else if (error.code === 'auth/too-many-requests') msg = "Too many attempts. Try again later.";
      Alert.alert("Error", msg);
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
            <Text style={styles.title}>PalmPass</Text>
            <Text style={styles.subtitle}>Exam Hall Management</Text>
          </View>

          {/* FORM CARD */}
          <View style={styles.card}>
            
            {/* EMAIL / USERNAME */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email or Username</Text>
              <View style={[styles.inputContainer, errors.email ? styles.inputError : null]}>
                <Ionicons name="person-outline" size={20} color="#94a3b8" />
                <TextInput
                  style={styles.input}
                  placeholder="admin or name@example.com"
                  placeholderTextColor="#64748b"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setErrors({ ...errors, email: "" }); }}
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
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
                  onChangeText={(t) => { setPassword(t); setErrors({ ...errors, password: "" }); }}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
            </View>

            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>
            
          </View>

          <View style={styles.footer}>
             <Text style={styles.footerText}>Universiti Teknikal Malaysia Melaka</Text>
          </View>

        </ScrollView>
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
  title: { fontSize: 28, fontWeight: "bold", color: "#fff" },
  subtitle: { fontSize: 14, color: "#94a3b8", marginTop: 4 },

  card: { 
    backgroundColor: "#1e293b", 
    borderRadius: 20, 
    padding: 24, 
    borderWidth: 1,
    borderColor: "#334155"
  },
  
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

  forgotBtn: { alignSelf: "flex-end", marginBottom: 24 },
  forgotText: { color: "#38bdf8", fontSize: 13, fontWeight: "600" },

  button: { 
    backgroundColor: "#38bdf8", 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#38bdf8", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  footer: { alignItems: "center", marginTop: 30 },
  footerText: { color: "#64748b", fontSize: 12 },
});