import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuration Firebase fournie
const firebaseConfig = {
  apiKey: "AIzaSyBMvLtHjKUT29g3C5XRE9LM7oMYcr86CsY",
  authDomain: "deuil-12369.firebaseapp.com",
  databaseURL: "https://deuil-12369-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "deuil-12369",
  storageBucket: "deuil-12369.firebasestorage.app",
  messagingSenderId: "1007706187993",
  appId: "1:1007706187993:web:24a6fff9b0b6cbe5f136c8",
  measurementId: "G-L15WM3BN4N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
