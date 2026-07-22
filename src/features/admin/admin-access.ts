import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../services/firebase";

export const ROLE = {
  SCHOOL_ACCOUNT_ADMIN: "schoolAccountAdmin",
  SYSTEM_ADMIN: "systemAdmin",
  TEACHER: "teacher",
} as const;

export type GlobalRole = typeof ROLE.SYSTEM_ADMIN;
export type SchoolMemberRole =
  | typeof ROLE.SCHOOL_ACCOUNT_ADMIN
  | typeof ROLE.TEACHER;

export type AdminUserRecord = {
  uid: string;
  username: string;
  displayName: string;
  schoolName: string;
  schoolBranchName: string;
  roles: string[];
  status: string;
  lastLoginAt: string;
};

export type AdminUserFilters = {
  keyword: string;
  schoolName: string;
  status: string;
};

function timestampToText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  if ("toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString("zh-TW");
  }

  return "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function hasSystemAdminRole(profile: {
  globalRoles?: string[];
} | null): boolean {
  return profile?.globalRoles?.includes(ROLE.SYSTEM_ADMIN) ?? false;
}

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs
    .map((entry) => {
      const data = entry.data();
      const username =
        typeof data.username === "string" && data.username.trim()
          ? data.username.trim()
          : entry.id;
      const displayName =
        typeof data.displayNickname === "string" && data.displayNickname.trim()
          ? data.displayNickname.trim()
          : username;
      const schoolName =
        typeof data.schoolName === "string" && data.schoolName.trim()
          ? data.schoolName.trim()
          : "";
      const schoolBranchName =
        typeof data.schoolBranchName === "string" && data.schoolBranchName.trim()
          ? data.schoolBranchName.trim()
          : "";
      const globalRoles = stringList(data.globalRoles);
      return {
        uid: entry.id,
        username,
        displayName,
        schoolName,
        schoolBranchName,
        roles: globalRoles.length > 0 ? globalRoles : [ROLE.TEACHER],
        status:
          typeof data.status === "string" && data.status.trim()
            ? data.status.trim()
            : data.disabled
              ? "inactive"
              : "active",
        lastLoginAt: timestampToText(data.lastLoginAt),
      };
    })
    .sort((left, right) => left.username.localeCompare(right.username));
}

export function filterAdminUsers(
  users: AdminUserRecord[],
  filters: AdminUserFilters,
): AdminUserRecord[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const schoolName = filters.schoolName.trim().toLowerCase();
  const status = filters.status;

  return users.filter((user) => {
    const matchesKeyword =
      !keyword ||
      user.username.toLowerCase().includes(keyword) ||
      user.displayName.toLowerCase().includes(keyword) ||
      user.schoolName.toLowerCase().includes(keyword);
    const matchesSchool =
      !schoolName || user.schoolName.toLowerCase().includes(schoolName);
    const matchesStatus = status === "all" || user.status === status;
    return matchesKeyword && matchesSchool && matchesStatus;
  });
}

export async function createPasswordResetRecord(options: {
  actorUid: string;
  actorUsername: string;
  target: AdminUserRecord;
}): Promise<string> {
  const token = crypto.randomUUID();
  const resetUrl = `${window.location.origin}${window.location.pathname}?resetToken=${encodeURIComponent(token)}`;

  await setDoc(doc(db, "passwordResetLinks", token), {
    actorUid: options.actorUid,
    actorUsername: options.actorUsername,
    createdAt: serverTimestamp(),
    status: "created",
    targetUid: options.target.uid,
    targetUsername: options.target.username,
  });
  await writeAdminAuditLog({
    actorUid: options.actorUid,
    actorUsername: options.actorUsername,
    targetUid: options.target.uid,
    targetUsername: options.target.username,
    type: "passwordResetLinkCreated",
  });

  return resetUrl;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createLoginPassRecord(options: {
  actorUid: string;
  actorUsername: string;
  target: AdminUserRecord;
}): Promise<{ passId: string; url: string }> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const passId = crypto.randomUUID();
  const tokenHash = await sha256Hex(token);
  const url = `${window.location.origin}${window.location.pathname}?loginPassId=${encodeURIComponent(passId)}&loginPass=${encodeURIComponent(token)}`;

  await setDoc(doc(db, "loginPasses", passId), {
    actorUid: options.actorUid,
    actorUsername: options.actorUsername,
    createdAt: serverTimestamp(),
    label: `${options.target.username} 永久登入 QR`,
    lastUsedAt: null,
    passId,
    status: "active",
    targetUid: options.target.uid,
    targetUsername: options.target.username,
    tokenHash,
  });
  await writeAdminAuditLog({
    actorUid: options.actorUid,
    actorUsername: options.actorUsername,
    targetUid: options.target.uid,
    targetUsername: options.target.username,
    type: "loginPassCreated",
  });

  return { passId, url };
}

export async function revokeLoginPass(passId: string, options: {
  actorUid: string;
  actorUsername: string;
  target: AdminUserRecord;
}): Promise<void> {
  await updateDoc(doc(db, "loginPasses", passId), {
    revokedAt: serverTimestamp(),
    revokedByUid: options.actorUid,
    status: "revoked",
  });
  await writeAdminAuditLog({
    actorUid: options.actorUid,
    actorUsername: options.actorUsername,
    targetUid: options.target.uid,
    targetUsername: options.target.username,
    type: "loginPassRevoked",
  });
}

export async function createSchoolAliasRecord(options: {
  actorUid: string;
  actorUsername: string;
  aliasName: string;
  canonicalSchoolName: string;
}): Promise<void> {
  await addDoc(collection(db, "schoolAliases"), {
    actorUid: options.actorUid,
    actorUsername: options.actorUsername,
    aliasName: options.aliasName.trim(),
    canonicalSchoolName: options.canonicalSchoolName.trim(),
    createdAt: serverTimestamp(),
    normalizedAliasName: options.aliasName.trim().replace(/\s+/g, ""),
    status: "active",
  });
  await writeAdminAuditLog({
    actorUid: options.actorUid,
    actorUsername: options.actorUsername,
    targetUsername: options.aliasName.trim(),
    type: "schoolAliasCreated",
  });
}

export async function resolveLoginPassToken(passId: string, token: string): Promise<{
  status: "active" | "revoked" | "missing";
  targetUsername: string;
}> {
  const tokenHash = await sha256Hex(token);
  const snapshot = await getDoc(doc(db, "loginPasses", passId));
  if (!snapshot.exists()) {
    return { status: "missing", targetUsername: "" };
  }

  const data = snapshot.data();
  if (data.tokenHash !== tokenHash) {
    return { status: "missing", targetUsername: "" };
  }

  if (data.status === "revoked") {
    return { status: "revoked", targetUsername: String(data.targetUsername ?? "") };
  }

  await updateDoc(snapshot.ref, {
    lastUsedAt: serverTimestamp(),
  });
  return { status: "active", targetUsername: String(data.targetUsername ?? "") };
}

export async function writeAdminAuditLog(options: {
  actorUid: string;
  actorUsername: string;
  targetUid?: string;
  targetUsername?: string;
  type: string;
}): Promise<void> {
  await addDoc(collection(db, "auditLogs"), {
    ...options,
    createdAt: serverTimestamp(),
  });
}
