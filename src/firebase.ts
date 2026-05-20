import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBgaajXEXFjU6RRcpIWC6Qq1_wOCnr26u4",
  authDomain: "fitness-test-tool.firebaseapp.com",
  projectId: "fitness-test-tool",
  storageBucket: "fitness-test-tool.firebasestorage.app",
  messagingSenderId: "742147408129",
  appId: "1:742147408129:web:a15440b49327d516955b00",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
