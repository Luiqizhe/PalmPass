import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Modal, Text, TouchableOpacity, View } from "react-native";
import { styles } from "./_styles";

// Helper to fix GitHub image URLs
const fixImageUrl = (url: string) => {
  if (url && url.includes("github.com") && url.includes("blob")) {
    return url.replace("github.com", "raw.githubusercontent.com").replace("/blob", "");
  }
  return url;
};

// ➕ ADDED: Props for new handlers
export default function SeatDetails({ 
    visible, 
    student, 
    onClose, 
    getSeatColor, 
    updateStatus, 
    onMarkOut, 
    onMarkIn, 
    isOut, 
    formatTime 
}: any) {
    
  if (!student) return null;

  const imageUrl = fixImageUrl(student.image_url);

  // Only allow "Mark Out" if status is "Present" and they aren't already out
  const canMarkOut = student.status === "Present" && !isOut;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* HEADER */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seat Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* BODY */}
          <View style={styles.modalBody}>
            <View style={styles.profileRow}>
              <Image
                source={{ uri: imageUrl || 'https://via.placeholder.com/150' }} 
                style={styles.profileImage}
              />
              <View style={styles.textInfo}>
                <Text style={styles.modalName}>{student.name || "Unknown"}</Text>
                <Text style={styles.modalSub}>Matric: {student.matric_no || "Not Available"}</Text>
                <Text style={styles.modalSub}>Program: {student.program || "Not Available"}</Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>
                Table No: <Text style={styles.infoValue}>{student.table_no || "Not Available"}</Text>
              </Text>

              <Text style={styles.infoLabel}>
                Status:{" "}
                {/*Show 'OUT (Toilet)' if isOut is true */}
                <Text style={{ color: getSeatColor(student), fontWeight: "bold" }}>
                  {isOut ? "OUT (Toilet)" : (student.status || "Not Available")}
                </Text>
              </Text>

              <Text style={styles.infoLabel}>
                Scanned In:{" "}
                <Text style={styles.infoValue}>{formatTime(student.scan_time) || "Not Available"}</Text>
              </Text>
            </View>

            {/* ACTION BUTTONS */}
            <Text style={styles.updateTitle}>Update Status</Text>

            <View style={{ gap: 10 }}>           
                <TouchableOpacity
                    style={[
                        styles.actionBtn, 
                        { backgroundColor: "#22c55e" },
                        isOut && { opacity: 0.5 } // ✏️ Visual feedback
                    ]}
                    onPress={() => updateStatus("Present")}
                    disabled={isOut} // ✏️ Locked during bathroom break
                >
                    <Text style={styles.btnText}>✓ Mark Present</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.actionBtn, 
                        { backgroundColor: "#ef4444" },
                        isOut && { opacity: 0.5 } // Visual feedback
                    ]}
                    onPress={() => updateStatus("Absent")}
                    disabled={isOut} // ✏️ Locked during bathroom break
                >
                    <Text style={styles.btnText}>✕ Mark Absent</Text>
                </TouchableOpacity>

                {isOut ? (
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: "#3b82f6" }]} // Blue for Return
                        onPress={onMarkIn}
                    >
                        <Text style={styles.btnText}>↩ Mark In (Returned)</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        // Disable if not "Present"
                        style={[
                            styles.actionBtn, 
                            { backgroundColor: "#f59e0b" },
                            !canMarkOut && { opacity: 0.5 } 
                        ]}
                        onPress={onMarkOut}
                        disabled={!canMarkOut} 
                    >
                        <Text style={styles.btnText}>⚠ Mark Out (Toilet)</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[
                        styles.actionBtn, 
                        { backgroundColor: "#334155" },
                        isOut && { opacity: 0.5 } // Visual feedback: fade button if disabled
                    ]}
                    onPress={() => updateStatus("Pending")}
                    disabled={isOut} // Prevents clicking if isOut is true
                >
                    <Text style={styles.btnText}>↺ Reset to Pending</Text>
                </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}