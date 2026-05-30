import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type QuerySnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { defaultAppData } from "./sample-data";
import type { AppData } from "./types";

export type CloudFileSummary = {
  id: string;
  fileName: string;
  rosterName: string;
  gradeLabel: string;
  academicTerm: string;
  rosterCount: number;
  recordCount: number;
  status: "active" | "archived";
  createdAt: string | null;
  updatedAt: string | null;
};

function timestampToIso(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("toDate" in value && typeof value.toDate === "function") {
    return (value as Timestamp).toDate().toISOString();
  }

  return null;
}

function buildFileName(data: Pick<AppData, "rosterName" | "academicTerm">): string {
  const rosterName = data.rosterName.trim() || "未命名班級";
  const academicTerm = data.academicTerm.trim();
  return academicTerm ? `${academicTerm} / ${rosterName}` : rosterName;
}

function mapFileSummary(id: string, data: DocumentData): CloudFileSummary {
  return {
    id,
    fileName:
      typeof data.fileName === "string" && data.fileName.trim()
        ? data.fileName
        : "未命名檔案",
    rosterName:
      typeof data.rosterName === "string" && data.rosterName.trim()
        ? data.rosterName
        : "未命名班級",
    gradeLabel:
      typeof data.gradeLabel === "string" && data.gradeLabel.trim()
        ? data.gradeLabel
        : "未設定",
    academicTerm:
      typeof data.academicTerm === "string" && data.academicTerm.trim()
        ? data.academicTerm
        : "尚未設定",
    rosterCount: typeof data.rosterCount === "number" ? data.rosterCount : 0,
    recordCount: typeof data.recordCount === "number" ? data.recordCount : 0,
    status: data.status === "archived" ? "archived" : "active",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function mapFileSnapshot(snapshot: QuerySnapshot<DocumentData>): CloudFileSummary[] {
  return snapshot.docs
    .map((entry) => mapFileSummary(entry.id, entry.data()))
    .filter((file) => file.status !== "archived");
}

function buildStoredFileData(username: string, data: AppData) {
  return {
    ownerUsername: username,
    status: "active",
    fileName: buildFileName(data),
    rosterName: data.rosterName,
    gradeLabel: data.gradeLabel,
    academicTerm: data.academicTerm,
    rosterCount: data.rosterEntries.length,
    recordCount: data.records.length,
    schemaVersion: data.schemaVersion,
    testDate: data.testDate,
    itemLabels: data.itemLabels,
    rosterEntries: data.rosterEntries,
    records: data.records,
    updatedAt: serverTimestamp(),
  };
}

export function subscribeToCloudFiles(
  uid: string,
  callback: (files: CloudFileSummary[]) => void,
): () => void {
  const filesQuery = query(
    collection(db, "users", uid, "files"),
    orderBy("updatedAt", "desc"),
  );

  return onSnapshot(filesQuery, (snapshot) => {
    callback(mapFileSnapshot(snapshot));
  });
}

export async function createCloudFile(options: {
  uid: string;
  username: string;
  data: AppData;
}): Promise<string> {
  const fileRef = doc(collection(db, "users", options.uid, "files"));
  await setDoc(fileRef, {
    ownerUid: options.uid,
    createdAt: serverTimestamp(),
    ...buildStoredFileData(options.username, options.data),
  });
  return fileRef.id;
}

export async function saveCloudFile(options: {
  uid: string;
  fileId: string;
  username: string;
  data: AppData;
}): Promise<void> {
  const fileRef = doc(db, "users", options.uid, "files", options.fileId);
  await setDoc(
    fileRef,
    {
      ownerUid: options.uid,
      ...buildStoredFileData(options.username, options.data),
    },
    { merge: true },
  );
}

export async function updateCloudFileInfo(options: {
  uid: string;
  fileId: string;
  rosterName: string;
  gradeLabel: string;
  academicTerm: string;
}): Promise<void> {
  const fileRef = doc(db, "users", options.uid, "files", options.fileId);
  const rosterName = options.rosterName.trim() || "未命名班級";
  const academicTerm = options.academicTerm.trim();

  await setDoc(
    fileRef,
    {
      rosterName,
      gradeLabel: options.gradeLabel,
      academicTerm,
      fileName: academicTerm ? `${academicTerm} / ${rosterName}` : rosterName,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function archiveCloudFile(options: {
  uid: string;
  fileId: string;
}): Promise<void> {
  const fileRef = doc(db, "users", options.uid, "files", options.fileId);
  await setDoc(
    fileRef,
    {
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadCloudFile(
  uid: string,
  fileId: string,
): Promise<AppData> {
  const snapshot = await getDoc(doc(db, "users", uid, "files", fileId));
  if (!snapshot.exists()) {
    throw new Error("找不到這份雲端檔案。");
  }

  const data = snapshot.data();
  return {
    schemaVersion:
      typeof data.schemaVersion === "number"
        ? data.schemaVersion
        : defaultAppData.schemaVersion,
    testDate:
      typeof data.testDate === "string" && data.testDate
        ? data.testDate
        : defaultAppData.testDate,
    academicTerm:
      typeof data.academicTerm === "string" && data.academicTerm
        ? data.academicTerm
        : defaultAppData.academicTerm,
    itemLabels:
      Array.isArray(data.itemLabels) && data.itemLabels.length
        ? data.itemLabels
        : defaultAppData.itemLabels,
    rosterName: typeof data.rosterName === "string" ? data.rosterName : "",
    gradeLabel: typeof data.gradeLabel === "string" ? data.gradeLabel : "",
    rosterEntries: Array.isArray(data.rosterEntries) ? data.rosterEntries : [],
    records: Array.isArray(data.records) ? data.records : [],
  };
}
