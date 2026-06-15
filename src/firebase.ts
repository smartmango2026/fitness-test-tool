import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB092-jPGNKofKu51vQaayZC1qXwCmC_8g",
  authDomain: "fitness-test-tool-42789.firebaseapp.com",
  projectId: "fitness-test-tool-42789",
  storageBucket: "fitness-test-tool-42789.firebasestorage.app",
  messagingSenderId: "953175047502",
  appId: "1:953175047502:web:1912d2f9ce23cbf83bf21f",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
