// firebaseConfig.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCfP357qK8eoSP7BM9QqaHkuIomxukhBNk",
  authDomain: "palmpass-39e86.firebaseapp.com",
  databaseURL: "https://palmpass-39e86-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "palmpass-39e86",
  storageBucket: "palmpass-39e86.firebasestorage.app",
  messagingSenderId: "602650454669",
  appId: "1:602650454669:web:9a9474f3e92bbafc41d0c4",
  measurementId: "G-J54D3C844N",
};

// Initialize Firebase app only if it hasn't been initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

export { auth, db };
