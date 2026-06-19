import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { AppData } from "../domain/types";

const TEST_DOC_PATH = ["cloudDebug", "connection-test"] as const;

export async function writeFirebaseConnectionTest(data: AppData): Promise<void> {
  const ref = doc(db, ...TEST_DOC_PATH);
  await setDoc(
    ref,
    {
      rosterName: data.rosterName,
      testDate: data.testDate,
      recordCount: data.records.length,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function readFirebaseConnectionTest(): Promise<{
  exists: boolean;
  data: Record<string, unknown> | null;
}> {
  const ref = doc(db, ...TEST_DOC_PATH);
  const snapshot = await getDoc(ref);
  return {
    exists: snapshot.exists(),
    data: snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null,
  };
}
