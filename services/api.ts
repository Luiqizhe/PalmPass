import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  where
} from "firebase/firestore";

import { db } from "../src/firebase";

export interface Student {
  id: string;
  name: string;
  status: "present" | "absent" | "out" | "returned";
  seatNumber: string;
  timeOut?: string;
}

// Link Auth UID to Firestore Collection with CUSTOM DOC IDs
export const createUserProfile = async (uid: string, role: "lecturer" | "student", email: string, matricOrId: string, name: string, program: string, department: string) => {
  let collectionName = "";
  let docId = "";
  let userData = {};

  if (role === "student") {
    collectionName = "STUDENT";
    docId = matricOrId; // Student Doc ID = Matric No
    
    userData = {
      uid: uid,
      matric_no: docId,
      name: name,
      program: program,
      palm_pattern: ""
    };
  } else {
    collectionName = "LECTURER";
    const randomId = Math.floor(10000 + Math.random() * 90000); 
    docId = `L_${randomId}`; 
    
    userData = {
      uid: uid,
      lecturer_id: docId,
      email: email,
      name: name,
      department: department
    };
  }

  // Create the document
  await setDoc(doc(db, collectionName, docId), userData);
};

// Get Student Profile by searching for their Auth UID
export const getStudentProfile = async (uid: string) => {
  try {
    const q = query(
      collection(db, "STUDENT"), 
      where("uid", "==", uid),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data();
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching profile:", error);
    return null;
  }
};

export const getStudentExams = async (uid: string) => {
  try {
    // 1. Get the Student's Matric No using their UID
    const studentProfile = await getStudentProfile(uid);
    
    if (!studentProfile || !studentProfile.matric_no) {
      console.log("No student profile found for this UID.");
      return [];
    }

    const matricNo = studentProfile.matric_no;

    // 2. Find all Attendance records for this Matric No
    // This tells us which exams they are registered for
    const attendanceQuery = query(
      collection(db, "ATTENDANCE"),
      where("matric_no", "==", matricNo)
    );
    
    const attendanceSnap = await getDocs(attendanceQuery);
    
    if (attendanceSnap.empty) {
      return []; // Student has no registered exams
    }

    // Extract all Exam IDs
    const registeredExamIds = attendanceSnap.docs.map(doc => doc.data().exam_id);

    // 3. Fetch details for each Exam ID from the EXAM collection
    const examPromises = registeredExamIds.map(async (examId) => {
      const examDocRef = doc(db, "EXAM", examId);
      const examSnap = await getDoc(examDocRef);

      if (examSnap.exists()) {
        const data = examSnap.data();
        return {
          id: examSnap.id,
          code: data.exam_id,
          name: data.subject,
          venue: data.location,
          time: `${data.start_time} - ${data.end_time}`,
          isActive: true // You could add date logic here to check if it's past
        };
      }
      return null;
    });

    // Wait for all exam fetches to complete and filter out any nulls
    const exams = await Promise.all(examPromises);
    return exams.filter(exam => exam !== null);

  } catch (error) {
    console.error("Error fetching student exams:", error);
    return [];
  }
};

// --- EXAM & MONITORING ---

// Fetch Exams (Matches 'EXAM' collection)
export const getActiveExams = async () => {
  try {
    const examsRef = collection(db, "EXAM");
    const snapshot = await getDocs(examsRef);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        code: data.exam_id,       
        name: data.subject,       
        venue: data.location,     
        time: `${data.startTime} - ${data.endTime}`, 
        isActive: true            
      };
    });
  } catch (error) {
    console.error("Error fetching exams:", error);
    return [];
  }
};

const getStudentMapForExam = async (examId: string) => {
  const studentMap = new Map<string, { name: string; matric: string }>();
  
  // 1. Get Attendance Entries for this Exam
  const attendanceQuery = query(
    collection(db, "ATTENDANCE"), 
    where("exam_id", "==", examId)
  );
  
  const attendanceSnap = await getDocs(attendanceQuery);
  const matricNumbers = new Set<string>();

  // 2. Collect all Matric Numbers
  attendanceSnap.forEach((doc) => {
    const data = doc.data();
    if (data.matric_no) matricNumbers.add(data.matric_no);
  });

  // 3. Fetch Student Profiles (in parallel)
  const studentProfiles = new Map<string, string>(); // matric -> name
  
  await Promise.all(
    Array.from(matricNumbers).map(async (matric) => {
      try {
        const studentDoc = await getDoc(doc(db, "STUDENT", matric));
        if (studentDoc.exists()) {
          studentProfiles.set(matric, studentDoc.data().name);
        }
      } catch (e) {
        console.warn("Failed to load student:", matric);
      }
    })
  );

  // Map Attendance ID -> Student Details
  attendanceSnap.forEach((doc) => {
    const data = doc.data();
    const realName = studentProfiles.get(data.matric_no) || "Unknown Student";
    
    studentMap.set(doc.id, {
      name: realName,
      matric: data.matric_no
    });
  });

  return studentMap;
};

// Listen to Seating
export const subscribeToSeating = (examId: string, callback: (data: any[]) => void) => {
  let unsubscribe = () => {};

  // Load names first, then start listening
  getStudentMapForExam(examId).then((studentMap) => {
    const q = query(
      collection(db, "ATTENDANCE"), 
      where("exam_id", "==", examId)
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
      const seats = snapshot.docs.map(doc => {
        const data = doc.data();
        const studentDetails = studentMap.get(doc.id);

        return {
          id: doc.id,
          // Use fetched name, fallback to matric if missing
          name: studentDetails?.name || data.matric_no || "Unknown", 
          matric: data.matric_no, 
          seatNumber: data.table_no, 
          status: data.status ? data.status.toLowerCase() : "absent", 
        };
      });
      callback(seats);
    });
  });

  // Return wrapper to allow cleanup even if promise isn't done
  return () => unsubscribe();
};


// Listen to Bathroom Log
export const subscribeToBathroomLog = (examId: string, callback: (data: any[]) => void) => {
  let unsubscribe = () => {};

  getStudentMapForExam(examId).then((studentMap) => {
    const logsQuery = query(
      collection(db, "BATHROOM_LOG"),
      where("status", "==", "Out") 
    );

    unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const filteredLogs = snapshot.docs
        .map(doc => {
          const data = doc.data();
          const attendanceId = data.attendance_id;

          // Check if this log belongs to a student in this exam
          const studentDetails = studentMap.get(attendanceId);
          if (!studentDetails) return null;

          return {
            id: doc.id,
            // Display Real Name
            name: studentDetails.name, 
            matric: studentDetails.matric, 
            timeOut: data.exit_time, 
            status: data.status,
          };
        })
        .filter(item => item !== null);

      callback(filteredLogs);
    });
  });

  return () => unsubscribe();
};

export const checkUserRole = async (uid: string): Promise<"student" | "lecturer" | null> => {
  try {
    // 1. Check Student Collection
    const studentQuery = query(
      collection(db, "STUDENT"), 
      where("uid", "==", uid),
      limit(1)
    );
    const studentSnap = await getDocs(studentQuery);
    if (!studentSnap.empty) return "student";

    // 2. Check Lecturer Collection
    const lecturerQuery = query(
      collection(db, "LECTURER"), 
      where("uid", "==", uid),
      limit(1)
    );
    const lecturerSnap = await getDocs(lecturerQuery);
    if (!lecturerSnap.empty) return "lecturer";

    return null; // User not found in either (maybe incomplete registration)
  } catch (error) {
    console.error("Error checking role:", error);
    return null;
  }
};