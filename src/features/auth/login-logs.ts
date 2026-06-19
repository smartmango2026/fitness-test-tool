import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import type { DiagnosticEnvironment } from "../diagnostics/diagnostics";

export type LoginLogInput = {
  uid: string;
  username: string;
  displayName: string | null;
  email: string | null;
  browserId: string;
  environment: DiagnosticEnvironment;
};

export async function writeLoginLog(input: LoginLogInput): Promise<void> {
  try {
    const logRef = doc(collection(db, "loginLogs"));
    await setDoc(logRef, {
      uid: input.uid,
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      browserId: input.browserId,
      pageUrl: input.environment.pageUrl,
      referrer: input.environment.referrer,
      viewport: input.environment.viewport,
      screen: input.environment.screen,
      device: input.environment.device,
      ipAddress: null,
      ipSource: "not-collected-client-only",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("loginLogs write failed", error);
  }
}
