import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { defaultAppData } from "./sample-data";
import type { AppData, FitnessRecord, RosterEntry, StudentGradeLabel } from "./types";

export type CloudFileSummary = {
  id: string;
  fileName: string;
  rosterName: string;
  gradeLabel: string;
  academicTerm: string;
  testDate: string;
  rosterCount: number;
  recordCount: number;
  status: "active" | "archived";
  createdAt: string | null;
  updatedAt: string | null;
  ownerUid: string;
  ownerUsername: string;
  ownerDisplayName: string | null;
  accessRole: "owner" | "editor";
  sharedEditorUids: string[];
};

type SharedWithEntry = {
  username: string;
  displayName: string | null;
  sharedAt: string | null;
  status: "active" | "revoked";
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

function buildFileShareDocumentId(
  ownerUid: string,
  fileId: string,
  recipientUid: string,
): string {
  return `${ownerUid}__${fileId}__${recipientUid}`;
}

function normalizeDisplayName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function isStudentGradeLabel(value: unknown): value is StudentGradeLabel {
  return value === "幼幼班" || value === "小班" || value === "中班" || value === "大班";
}

function inferStudentGradeLabel(fileGradeLabel: string, value: unknown): StudentGradeLabel {
  if (isStudentGradeLabel(value)) {
    return value;
  }

  if (isStudentGradeLabel(fileGradeLabel)) {
    return fileGradeLabel;
  }

  return "中班";
}

function normalizeRosterEntries(raw: unknown, fileGradeLabel: string): RosterEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const data = entry && typeof entry === "object" ? (entry as Partial<RosterEntry>) : {};
    return {
      id: typeof data.id === "string" && data.id ? data.id : `roster_${index + 1}`,
      studentName: typeof data.studentName === "string" ? data.studentName : "",
      height: typeof data.height === "string" ? data.height : "",
      weight: typeof data.weight === "string" ? data.weight : "",
      studentGradeLabel: inferStudentGradeLabel(fileGradeLabel, data.studentGradeLabel),
    };
  });
}

function normalizeRecords(raw: unknown, fileGradeLabel: string, testDate: string): FitnessRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((record, index) => {
    const data = record && typeof record === "object" ? (record as Partial<FitnessRecord>) : {};
    return {
      id: typeof data.id === "string" && data.id ? data.id : `rec_${index + 1}`,
      studentName: typeof data.studentName === "string" ? data.studentName : "",
      height: typeof data.height === "string" ? data.height : "",
      weight: typeof data.weight === "string" ? data.weight : "",
      studentGradeLabel: inferStudentGradeLabel(fileGradeLabel, data.studentGradeLabel),
      testDate: typeof data.testDate === "string" && data.testDate ? data.testDate : testDate,
      item1: typeof data.item1 === "number" ? data.item1 : 0,
      item2: typeof data.item2 === "number" ? data.item2 : 0,
      item3: typeof data.item3 === "number" ? data.item3 : 0,
      item4: typeof data.item4 === "number" ? data.item4 : 0,
      item5: typeof data.item5 === "number" ? data.item5 : 0,
      item6: typeof data.item6 === "number" ? data.item6 : 0,
      comment: typeof data.comment === "string" ? data.comment : "",
    };
  });
}

function mapOwnedFileSummary(id: string, data: DocumentData): CloudFileSummary {
  const editorUids = Array.isArray(data.editorUids)
    ? data.editorUids.filter((value): value is string => typeof value === "string")
    : [];
  const sharedWith = readSharedWith(data);
  const sharedEditorUids =
    editorUids.length > 0
      ? editorUids
      : Object.entries(sharedWith)
          .filter(([, entry]) => entry.status !== "revoked")
          .map(([uid]) => uid);
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
    testDate:
      typeof data.testDate === "string" && data.testDate
        ? data.testDate
        : defaultAppData.testDate,
    rosterCount: typeof data.rosterCount === "number" ? data.rosterCount : 0,
    recordCount: typeof data.recordCount === "number" ? data.recordCount : 0,
    status: data.status === "archived" ? "archived" : "active",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerUsername:
      typeof data.ownerUsername === "string" ? data.ownerUsername : "未命名使用者",
    ownerDisplayName: normalizeDisplayName(data.ownerDisplayName),
    accessRole: "owner",
    sharedEditorUids,
  };
}

function readSharedWith(data: DocumentData | undefined): Record<string, SharedWithEntry> {
  const raw = data?.sharedWith;
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const next: Record<string, SharedWithEntry> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([uid, value]) => {
    if (!value || typeof value !== "object") {
      return;
    }
    const entry = value as Record<string, unknown>;
    next[uid] = {
      username: typeof entry.username === "string" ? entry.username : "",
      displayName: normalizeDisplayName(entry.displayName),
      sharedAt: timestampToIso(entry.sharedAt) ?? null,
      status: entry.status === "revoked" ? "revoked" : "active",
    };
  });
  return next;
}

function mapRecipientSharedFileSummary(id: string, data: DocumentData): CloudFileSummary {
  return {
    id: typeof data.fileId === "string" && data.fileId ? data.fileId : id,
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
    testDate:
      typeof data.testDate === "string" && data.testDate
        ? data.testDate
        : defaultAppData.testDate,
    rosterCount: typeof data.rosterCount === "number" ? data.rosterCount : 0,
    recordCount: typeof data.recordCount === "number" ? data.recordCount : 0,
    status: data.status === "archived" ? "archived" : "active",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerUsername:
      typeof data.ownerUsername === "string" ? data.ownerUsername : "未命名使用者",
    ownerDisplayName: normalizeDisplayName(data.ownerDisplayName),
    accessRole: "editor",
    sharedEditorUids: [],
  };
}

async function syncShareMetadata(options: {
  ownerUid: string;
  fileId: string;
  fileName: string;
  rosterName: string;
  gradeLabel: string;
  academicTerm: string;
  testDate: string;
  rosterCount: number;
  recordCount: number;
  status?: "active" | "archived";
  ownerUsername?: string;
  ownerDisplayName?: string | null;
}): Promise<void> {
  const fileSnapshot = await getDoc(doc(db, "users", options.ownerUid, "files", options.fileId));
  const fileData = fileSnapshot.data();
  const editorUids = Array.isArray(fileData?.editorUids)
    ? fileData.editorUids.filter((value): value is string => typeof value === "string")
    : [];
  const sharedWith = readSharedWith(fileData);

  const recipientBatch = writeBatch(db);
  editorUids.forEach((recipientUid) => {
    const sharedEntry = sharedWith[recipientUid];
    const sharedFileRef = doc(
      db,
      "users",
      recipientUid,
      "sharedFiles",
      buildFileShareDocumentId(options.ownerUid, options.fileId, recipientUid),
    );
    recipientBatch.set(
      sharedFileRef,
      {
        ownerUid: options.ownerUid,
        fileId: options.fileId,
        ownerUsername: options.ownerUsername,
        ownerDisplayName: options.ownerDisplayName,
        fileName: options.fileName,
        rosterName: options.rosterName,
        gradeLabel: options.gradeLabel,
        academicTerm: options.academicTerm,
        testDate: options.testDate,
        rosterCount: options.rosterCount,
        recordCount: options.recordCount,
        recipientUid,
        recipientUsername: sharedEntry?.username ?? "",
        recipientDisplayName: sharedEntry?.displayName ?? null,
        fileStatus: options.status ?? "active",
        status: "active",
        sharedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
  await recipientBatch.commit();
}

function dedupeFileSummaries(files: CloudFileSummary[]): CloudFileSummary[] {
  const next = new Map<string, CloudFileSummary>();
  files.forEach((file) => {
    const key = `${file.ownerUid}:${file.id}`;
    const existing = next.get(key);
    if (!existing || (existing.accessRole === "editor" && file.accessRole === "owner")) {
      next.set(key, file);
    }
  });
  return [...next.values()];
}

export function subscribeToCloudFiles(
  uid: string,
  callback: (files: CloudFileSummary[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  let ownedFiles: CloudFileSummary[] = [];
  let sharedFiles: CloudFileSummary[] = [];

  const emit = () => {
    callback(dedupeFileSummaries([...ownedFiles, ...sharedFiles]));
  };

  const ownedQuery = query(collection(db, "users", uid, "files"));
  const unsubscribeOwned = onSnapshot(
    ownedQuery,
    (snapshot) => {
      ownedFiles = snapshot.docs
        .map((entry) => mapOwnedFileSummary(entry.id, entry.data()))
        .filter((file) => file.status !== "archived");
      emit();
    },
    (error) => {
      onError?.(error);
    },
  );

  const recipientSharedQuery = query(
    collection(db, "users", uid, "sharedFiles"),
    where("status", "==", "active"),
  );
  const unsubscribeRecipientShared = onSnapshot(
    recipientSharedQuery,
    (snapshot) => {
      sharedFiles = snapshot.docs
        .map((entry) => mapRecipientSharedFileSummary(entry.id, entry.data()))
        .filter((file) => file.status !== "archived");
      emit();
    },
    (error) => {
      onError?.(error);
    },
  );

  return () => {
    unsubscribeOwned();
    unsubscribeRecipientShared();
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
    editorUids: [],
    sharedWith: {},
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
    testDate: options.data.testDate,
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
  testDate: string;
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
      testDate: options.testDate,
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
    testDate: options.testDate,
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

  const snapshot = await getDoc(fileRef);
  const data = snapshot.data();
  const editorUids = Array.isArray(data?.editorUids)
    ? data.editorUids.filter((value): value is string => typeof value === "string")
    : [];
  if (editorUids.length === 0) {
    return;
  }

  const batch = writeBatch(db);
  editorUids.forEach((recipientUid) => {
    batch.set(
      doc(
        db,
        "users",
        recipientUid,
        "sharedFiles",
        buildFileShareDocumentId(options.ownerUid, options.fileId, recipientUid),
      ),
      {
        status: "revoked",
        fileStatus: "archived",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
  await batch.commit();
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
  const gradeLabel = typeof data.gradeLabel === "string" ? data.gradeLabel : "";
  const testDate =
    typeof data.testDate === "string" && data.testDate
      ? data.testDate
      : defaultAppData.testDate;
  return {
    schemaVersion:
      typeof data.schemaVersion === "number"
        ? data.schemaVersion
        : defaultAppData.schemaVersion,
    testDate,
    academicTerm:
      typeof data.academicTerm === "string" && data.academicTerm
        ? data.academicTerm
        : defaultAppData.academicTerm,
    itemLabels:
      Array.isArray(data.itemLabels) && data.itemLabels.length
        ? data.itemLabels
        : defaultAppData.itemLabels,
    rosterName: typeof data.rosterName === "string" ? data.rosterName : "",
    gradeLabel,
    rosterEntries: normalizeRosterEntries(data.rosterEntries, gradeLabel),
    records: normalizeRecords(data.records, gradeLabel, testDate),
  };
}

export async function setCloudFileEditors(options: {
  ownerUid: string;
  ownerUsername: string;
  ownerDisplayName?: string | null;
  file: CloudFileSummary;
  previousEditorUids?: string[];
  editorTargets: Array<{
    uid: string;
    username: string;
    displayName: string | null;
  }>;
}): Promise<void> {
  const fileRef = doc(db, "users", options.ownerUid, "files", options.file.id);
  const editorUids = options.editorTargets.map((target) => target.uid);
  const batch = writeBatch(db);
  const sharedWith = Object.fromEntries(
    options.editorTargets.map((target) => [
      target.uid,
      {
        username: target.username,
        displayName: target.displayName,
        sharedAt: serverTimestamp(),
        status: "active",
      },
    ]),
  );
  batch.set(
    fileRef,
    {
      editorUids,
      sharedWith,
      ownerUsername: options.ownerUsername,
      ownerDisplayName: options.ownerDisplayName?.trim() || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  options.editorTargets.forEach((target) => {
    const sharedFileRef = doc(
      db,
      "users",
      target.uid,
      "sharedFiles",
      buildFileShareDocumentId(options.ownerUid, options.file.id, target.uid),
    );
    batch.set(
      sharedFileRef,
      {
        ownerUid: options.ownerUid,
        fileId: options.file.id,
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
        fileStatus: "active",
        sharedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

  });

  const previousEditorUids = options.previousEditorUids ?? [];
  previousEditorUids.forEach((recipientUid) => {
    if (!editorUids.includes(recipientUid)) {
      const recipientSharedFileRef = doc(
        db,
        "users",
        recipientUid,
        "sharedFiles",
        buildFileShareDocumentId(options.ownerUid, options.file.id, recipientUid),
      );
      batch.set(
        recipientSharedFileRef,
        {
          ownerUid: options.ownerUid,
          fileId: options.file.id,
          recipientUid,
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
  const fileRef = doc(db, "users", ownerUid, "files", fileId);
  let snapshot;
  try {
    snapshot = await getDocFromServer(fileRef);
  } catch {
    snapshot = await getDoc(fileRef);
  }
  if (!snapshot.exists()) {
    return [];
  }

  const data = snapshot.data();
  const editorUids = Array.isArray(data.editorUids)
    ? data.editorUids.filter((value): value is string => typeof value === "string")
    : [];
  if (editorUids.length > 0) {
    return editorUids;
  }

  const sharedWith = readSharedWith(data);
  return Object.entries(sharedWith)
    .filter(([, entry]) => entry.status !== "revoked")
    .map(([uid]) => uid);
}
