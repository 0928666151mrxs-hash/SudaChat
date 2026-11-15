import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAMgAGDFlnAmaba4e2fiEC1w3_kgdYQ8WA",
  authDomain: "sudachat-733c0.firebaseapp.com",
  projectId: "sudachat-733c0",
  storageBucket: "sudachat-733c0.firebasestorage.app",
  messagingSenderId: "959926854548",
  appId: "1:959926854548:web:6c631eee2552741f766581"
};

// تهيئة التطبيق والخدمات وتصديرها
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
