import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export type SystemLogPhase = "started" | "completed" | "failed";

export type SystemLogEntry = {
  operationId?: string;
  actionType: string;
  phase: SystemLogPhase;
  actorUid?: string | null;
  actorUsername?: string | null;
  actorDisplayName?: string | null;
  targetUid?: string | null;
  targetUsername?: string | null;
  ownerUid?: string | null;
  fileId?: string | null;
  fileName?: string | null;
  requestId?: string | null;
  inviteId?: string | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
};

function sanitizeLogValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeLogValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object") {
    const nextEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, sanitizeLogValue(entry)] as const)
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(nextEntries);
  }

  return String(value);
}

export function createSystemLogOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function writeSystemLog(entry: SystemLogEntry): Promise<void> {
  try {
    const logRef = doc(collection(db, "systemLogs"));
    const payload = sanitizeLogValue(entry.payload ?? null);
    await setDoc(logRef, {
      operationId: entry.operationId ?? createSystemLogOperationId(),
      actionType: entry.actionType,
      phase: entry.phase,
      actorUid: entry.actorUid ?? null,
      actorUsername: entry.actorUsername ?? null,
      actorDisplayName: entry.actorDisplayName ?? null,
      targetUid: entry.targetUid ?? null,
      targetUsername: entry.targetUsername ?? null,
      ownerUid: entry.ownerUid ?? null,
      fileId: entry.fileId ?? null,
      fileName: entry.fileName ?? null,
      requestId: entry.requestId ?? null,
      inviteId: entry.inviteId ?? null,
      message: entry.message ?? null,
      payload: payload ?? null,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("systemLogs write failed", error);
  }
}
