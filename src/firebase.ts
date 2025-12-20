import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Firestore, getFirestore } from "firebase/firestore";

// @ts-ignore
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";

// ✅ YOUR ACTUAL CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyD-yvKnWO-aYCle0nURtg_1v7rBdQ4GUsM",
  appId: "1:602650454669:android:60def3b4e3f3bd8541d0c4",
  projectId: "palmpass-39e86",
  storageBucket: "palmpass-39e86.firebasestorage.app",
  messagingSenderId: "602650454669",
  // Derived auth domain (usually projectId.firebaseapp.com)
  authDomain: "palmpass-39e86.firebaseapp.com" 
};

let app: FirebaseApp;
let auth: Auth;

if (getApps().length === 0) {
  // First time initialization
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
} else {
  // App already exists (Fast Refresh)
  app = getApp();
  try {
    auth = getAuth(app);
  } catch {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage)
    });
  }
}

export const firebaseAuth = auth;
export const db: Firestore = getFirestore(app);