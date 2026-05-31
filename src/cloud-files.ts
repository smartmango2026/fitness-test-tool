import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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
  ownerUid: string;
  ownerUsername: string;
  ownerDisplayName: string | null;
  accessRole: "owner" | "editor";
};

export type FileShareRecord = {
  id: string;
  fileId: string;
  ownerUid: string;
  ownerUsername: string;
  ownerDisplayName: string | null;
  ownerFileName: string;
  recipientUid: string;
  recipientUsername: string;
  recipientDisplayName: string | null;
  status: "active" | "revoked";
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

function buildStoredFileData(
  ownerUid: string,
  ownerUsername: string,
  ownerDisplayName: string | null,
  data: AppData,
) {
  return {
    ownerUid,
    ownerUsername,
    ownerDisplayName,
    editorUids: [],
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

function mapOwnedFileSummary(id: string, data: DocumentData): CloudFileSummary {
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
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerUsername:
      typeof data.ownerUsername === "string" ? data.ownerUsername : "未命名使用者",
    ownerDisplayName:
      typeof data.ownerDisplayName === "string" && data.ownerDisplayName.trim()
        ? data.ownerDisplayName.trim()
        : null,
    accessRole: "owner",
  };
}

function mapShareRecord(id: string, data: DocumentData): FileShareRecord {
  return {
    id,
    fileId: typeof data.fileId === "string" ? data.fileId : "",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerUsername:
      typeof data.ownerUsername === "string" ? data.ownerUsername : "未命名使用者",
    ownerDisplayName:
      typeof data.ownerDisplayName === "string" && data.ownerDisplayName.trim()
        ? data.ownerDisplayName.trim()
        : null,
    ownerFileName:
      typeof data.fileName === "string" && data.fileName.trim()
        ? data.fileName
        : "未命名檔案",
    recipientUid: typeof data.recipientUid === "string" ? data.recipientUid : "",
    recipientUsername:
      typeof data.recipientUsername === "string" ? data.recipientUsername : "",
    recipientDisplayName:
      typeof data.recipientDisplayName === "string" && data.recipientDisplayName.trim()
        ? data.recipientDisplayName.trim()
        : null,
    status: data.status === "revoked" ? "revoked" : "active",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

async function syncShareMetadata(options: {
  ownerUid: string;
  fileId: string;
  fileName: string;
  rosterName: string;
  gradeLabel: string;
  academicTerm: string;
  rosterCount: number;
  recordCount: number;
  status?: "active" | "archived";
  ownerUsername?: string;
  ownerDisplayName?: string | null;
}): Promise<void> {
  const sharesQuery = query(
    collection(db, "fileShares"),
    where("ownerUid", "==", options.ownerUid),
    where("fileId", "==", options.fileId),
    where("status", "==", "active"),
  );
  const snapshot = await getDocs(sharesQuery);
  if (snapshot.empty) {
    return;
  }

  const batch = writeBatch(db);
  snapshot.docs.forEach((shareDoc) => {
    batch.set(
      shareDoc.ref,
      {
        fileName: options.fileName,
        rosterName: options.rosterName,
        gradeLabel: options.gradeLabel,
        academicTerm: options.academicTerm,
        rosterCount: options.rosterCount,
        recordCount: options.recordCount,
        ownerUsername: options.ownerUsername,
        ownerDisplayName: options.ownerDisplayName,
        fileStatus: options.status ?? "active",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
  await batch.commit();
}

async function mapSharedFileSummary(share: FileShareRecord): Promise<CloudFileSummary | null> {
  if (!share.ownerUid || !share.fileId || share.status !== "active") {
    return null;
  }

  const snapshot = await getDoc(doc(db, "users", share.ownerUid, "files", share.fileId));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  if (data.status === "archived") {
    return null;
  }

  return {
    id: share.fileId,
    fileName:
      typeof data.fileName === "string" && data.fileName.trim()
        ? data.fileName
        : share.ownerFileName,
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
    status: "active",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    ownerUid: share.ownerUid,
    ownerUsername:
      typeof data.ownerUsername === "string" ? data.ownerUsername : share.ownerUsername,
    ownerDisplayName:
      typeof data.ownerDisplayName === "string" && data.ownerDisplayName.trim()
        ? data.ownerDisplayName.trim()
        : share.ownerDisplayName,
    accessRole: "editor",
  };
}

function dedupeFileSummaries(files: CloudFileSummary[]): CloudFileSummary[] {
  const next = new Map<string, CloudFileSummary>();
  files.forEach((file) => {
    next.set(`${file.ownerUid}:${file.id}`, file);
  });
  return [...next.values()];
}

export function subscribeToCloudFiles(
  uid: string,
  callback: (files: CloudFileSummary[]) => void,
): () => void {
  let ownedFiles: CloudFileSummary[] = [];
  let sharedFiles: CloudFileSummary[] = [];

  const emit = () => {
    callback(dedupeFileSummaries([...ownedFiles, ...sharedFiles]));
  };

  const ownedQuery = query(collection(db, "users", uid, "files"));
  const unsubscribeOwned = onSnapshot(ownedQuery, (snapshot) => {
    ownedFiles = snapshot.docs
      .map((entry) => mapOwnedFileSummary(entry.id, entry.data()))
      .filter((file) => file.status !== "archived");
    emit();
  });

  const sharesQuery = query(
    collection(db, "fileShares"),
    where("recipientUid", "==", uid),
    where("status", "==", "active"),
  );
  const unsubscribeShared = onSnapshot(sharesQuery, async (snapshot) => {
    const shareRecords = snapshot.docs.map((entry) =>
      mapShareRecord(entry.id, entry.data()),
    );
    const resolved = await Promise.all(shareRecords.map(mapSharedFileSummary));
    sharedFiles = resolved.filter((file): file is CloudFileSummary => Boolean(file));
    emit();
  });

  return () => {
    unsubscribeOwned();
    unsubscribeShared();
  };
}

export async function createCloudFile(options: {
  uid: string;
  username: string;
  displayName?: string | null;
  data: AppData;
}): Promise<string> {
  const fileRef = doc(collection(db, "users", options.uid, "files"));
  await setDoc(fileRef, {
    createdAt: serverTimestamp(),
    ...buildStoredFileData(
      options.uid,
      options.username,
      options.displayName?.trim() || null,
      options.data,
    ),
  });
  return fileRef.id;
}

export async function saveCloudFile(options: {
  ownerUid: string;
  fileId: string;
  username: string;
  displayName?: string | null;
  data: AppData;
}): Promise<void> {
  const fileRef = doc(db, "users", options.ownerUid, "files", options.fileId);
  await setDoc(
    fileRef,
    {
      ...buildStoredFileData(
        options.ownerUid,
        options.username,
        options.displayName?.trim() || null,
        options.data,
      ),
    },
    { merge: true },
  );

  await syncShareMetadata({
    ownerUid: options.ownerUid,
    fileId: options.fileId,
    fileName: buildFileName(options.data),
    rosterName: options.data.rosterName,
    gradeLabel: options.data.gradeLabel,
    academicTerm: options.data.academicTerm,
    rosterCount: options.data.rosterEntries.length,
    recordCount: options.data.records.length,
    ownerUsername: options.username,
    ownerDisplayName: options.displayName?.trim() || null,
  });
}

export async function updateCloudFileInfo(options: {
  ownerUid: string;
  fileId: string;
  rosterName: string;
  gradeLabel: string;
  academicTerm: string;
}): Promise<void> {
  const fileRef = doc(db, "users", options.ownerUid, "files", options.fileId);
  const rosterName = options.rosterName.trim() || "未命名班級";
  const academicTerm = options.academicTerm.trim();
  const fileName = academicTerm ? `${academicTerm} / ${rosterName}` : rosterName;

  await setDoc(
    fileRef,
    {
      rosterName,
      gradeLabel: options.gradeLabel,
      academicTerm,
      fileName,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const snapshot = await getDoc(fileRef);
  const data = snapshot.data();
  await syncShareMetadata({
    ownerUid: options.ownerUid,
    fileId: options.fileId,
    fileName,
    rosterName,
    gradeLabel: options.gradeLabel,
    academicTerm,
    rosterCount: typeof data?.rosterCount === "number" ? data.rosterCount : 0,
    recordCount: typeof data?.recordCount === "number" ? data.recordCount : 0,
    ownerUsername: typeof data?.ownerUsername === "string" ? data.ownerUsername : "",
    ownerDisplayName:
      typeof data?.ownerDisplayName === "string" && data.ownerDisplayName.trim()
        ? data.ownerDisplayName.trim()
        : null,
  });
}

export async function archiveCloudFile(options: {
  ownerUid: string;
  fileId: string;
}): Promise<void> {
  const fileRef = doc(db, "users", options.ownerUid, "files", options.fileId);
  await setDoc(
    fileRef,
    {
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const sharesQuery = query(
    collection(db, "fileShares"),
    where("ownerUid", "==", options.ownerUid),
    where("fileId", "==", options.fileId),
    where("status", "==", "active"),
  );
  const snapshot = await getDocs(sharesQuery);
  if (!snapshot.empty) {
    const batch = writeBatch(db);
    snapshot.docs.forEach((shareDoc) => {
      batch.set(
        shareDoc.ref,
        {
          status: "revoked",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
}

export async function loadCloudFile(
  ownerUid: string,
  fileId: string,
): Promise<AppData> {
  const snapshot = await getDoc(doc(db, "users", ownerUid, "files", fileId));
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

export async function setCloudFileEditors(options: {
  ownerUid: string;
  ownerUsername: string;
  ownerDisplayName?: string | null;
  file: CloudFileSummary;
  editorTargets: Array<{
    uid: string;
    username: string;
    displayName: string | null;
  }>;
}): Promise<void> {
  const fileRef = doc(db, "users", options.ownerUid, "files", options.file.id);
  const editorUids = options.editorTargets.map((target) => target.uid);
  await updateDoc(fileRef, {
    editorUids,
    ownerUsername: options.ownerUsername,
    ownerDisplayName: options.ownerDisplayName?.trim() || null,
    updatedAt: serverTimestamp(),
  });

  const existingSharesQuery = query(
    collection(db, "fileShares"),
    where("ownerUid", "==", options.ownerUid),
    where("fileId", "==", options.file.id),
  );
  const existingSharesSnapshot = await getDocs(existingSharesQuery);
  const existingByRecipient = new Map(
    existingSharesSnapshot.docs.map((shareDoc) => [
      shareDoc.data().recipientUid as string,
      shareDoc,
    ]),
  );

  const batch = writeBatch(db);
  options.editorTargets.forEach((target) => {
    const existing = existingByRecipient.get(target.uid);
    const shareRef = existing?.ref ?? doc(collection(db, "fileShares"));
    batch.set(
      shareRef,
      {
        fileId: options.file.id,
        ownerUid: options.ownerUid,
        ownerUsername: options.ownerUsername,
        ownerDisplayName: options.ownerDisplayName?.trim() || null,
        fileName: options.file.fileName,
        rosterName: options.file.rosterName,
        gradeLabel: options.file.gradeLabel,
        academicTerm: options.file.academicTerm,
        rosterCount: options.file.rosterCount,
        recordCount: options.file.recordCount,
        recipientUid: target.uid,
        recipientUsername: target.username,
        recipientDisplayName: target.displayName,
        status: "active",
        createdAt: existing?.data().createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  existingSharesSnapshot.docs.forEach((shareDoc) => {
    const recipientUid = shareDoc.data().recipientUid as string;
    if (!editorUids.includes(recipientUid)) {
      batch.set(
        shareDoc.ref,
        {
          status: "revoked",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
  });

  await batch.commit();
}

export async function getCloudFileEditorUids(
  ownerUid: string,
  fileId: string,
): Promise<string[]> {
  const snapshot = await getDoc(doc(db, "users", ownerUid, "files", fileId));
  if (!snapshot.exists()) {
    return [];
  }

  const data = snapshot.data();
  return Array.isArray(data.editorUids)
    ? data.editorUids.filter((value): value is string => typeof value === "string")
    : [];
}
