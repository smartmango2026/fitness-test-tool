import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  getFirebaseRuntimeInfo,
  getFitnessRuntime,
  resolveFirebaseConfig,
} from "./firebase-config";

export const firebaseRuntime = getFitnessRuntime();
export const firebaseRuntimeInfo = getFirebaseRuntimeInfo(firebaseRuntime);
const firebaseConfig = resolveFirebaseConfig(firebaseRuntime);

export const firebaseApp = initializeApp(firebaseConfig, firebaseRuntime);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
