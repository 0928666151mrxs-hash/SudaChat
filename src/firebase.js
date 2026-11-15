
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDoqkA6qpS8nXktiLbnrdLMfh2wEAjElgw",
  authDomain: "sudachat-2cb9e.firebaseapp.com",
  databaseURL: "https://sudachat-2cb9e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "sudachat-2cb9e",
  storageBucket: "sudachat-2cb9e.firebasestorage.app",
  messagingSenderId: "227070176416",
  appId: "1:227070176416:web:f8430360e1134a8f4dadc5"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
