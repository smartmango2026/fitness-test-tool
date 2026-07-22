import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QuerySnapshot,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../../services/firebase";
import { emailToUsername, normalizeUsername } from "../auth/firebase-auth";
import { getSchoolName, normalizeSchoolId } from "../../domain/schools";
import type { SchoolId } from "../../domain/schools";

export type FriendRecord = {
  friendUid: string;
  username: string;
  profileNickname: string | null;
  customNickname: string | null;
  displayName: string;
  addedAt: string | null;
};

export type UserProfileRecord = {
  uid: string;
  username: string;
  displayNickname: string | null;
  globalRoles?: string[];
  schoolId: SchoolId | "";
  schoolName: string;
  schoolBranchName: string;
};

export type FriendRequestRecord = {
  id: string;
  fromUid: string;
  fromUsername: string;
  fromDisplayName: string | null;
  toUid: string;
  toUsername: string;
  toDisplayName: string | null;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  createdAt: string | null;
  updatedAt: string | null;
};

export type FriendInviteRecord = {
  id: string;
  issuedByUid: string;
  issuedByUsername: string;
  issuedByDisplayName: string | null;
  status: "active" | "expired" | "revoked";
  createdAt: string | null;
  expiresAt: string | null;
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

function mapFriendSnapshot(snapshot: QuerySnapshot<DocumentData>): FriendRecord[] {
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    const username =
      typeof data.friendUsername === "string" ? data.friendUsername : entry.id;
    const profileNickname =
      typeof data.friendDisplayName === "string" && data.friendDisplayName.trim()
        ? data.friendDisplayName.trim()
        : null;
    const customNickname =
      typeof data.customNickname === "string" && data.customNickname.trim()
        ? data.customNickname.trim()
        : null;
    return {
      friendUid: entry.id,
      username,
      profileNickname,
      customNickname,
      displayName: customNickname || profileNickname || username,
      addedAt: timestampToIso(data.addedAt),
    };
  });
}

function mapUserProfileDocument(
  uid: string,
  data: DocumentData,
): UserProfileRecord {
  const schoolId = normalizeSchoolId(data.schoolId);
  return {
    uid,
    username:
      typeof data.username === "string" ? normalizeUsername(data.username) : uid,
    displayNickname:
      typeof data.displayNickname === "string" && data.displayNickname.trim()
        ? data.displayNickname.trim()
        : null,
    globalRoles: Array.isArray(data.globalRoles)
      ? data.globalRoles.filter((entry): entry is string => typeof entry === "string")
      : [],
    schoolId,
    schoolName:
      typeof data.schoolName === "string" && data.schoolName.trim()
        ? data.schoolName.trim()
        : getSchoolName(schoolId),
    schoolBranchName:
      typeof data.schoolBranchName === "string" && data.schoolBranchName.trim()
        ? data.schoolBranchName.trim()
        : "",
  };
}

function mapRequestSnapshot(snapshot: QuerySnapshot<DocumentData>): FriendRequestRecord[] {
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      fromUid: typeof data.fromUid === "string" ? data.fromUid : "",
      fromUsername:
        typeof data.fromUsername === "string" ? data.fromUsername : "",
      fromDisplayName:
        typeof data.fromDisplayName === "string" && data.fromDisplayName.trim()
          ? data.fromDisplayName.trim()
          : null,
      toUid: typeof data.toUid === "string" ? data.toUid : "",
      toUsername: typeof data.toUsername === "string" ? data.toUsername : "",
      toDisplayName:
        typeof data.toDisplayName === "string" && data.toDisplayName.trim()
          ? data.toDisplayName.trim()
          : null,
      status:
        data.status === "accepted" ||
        data.status === "rejected" ||
        data.status === "cancelled"
          ? data.status
          : "pending",
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
    };
  });
}

function mapInviteDocument(
  id: string,
  data: DocumentData,
): FriendInviteRecord {
  return {
    id,
    issuedByUid: typeof data.issuedByUid === "string" ? data.issuedByUid : "",
    issuedByUsername:
      typeof data.issuedByUsername === "string" ? data.issuedByUsername : "",
    issuedByDisplayName:
      typeof data.issuedByDisplayName === "string" && data.issuedByDisplayName.trim()
        ? data.issuedByDisplayName.trim()
        : null,
    status:
      data.status === "expired" || data.status === "revoked"
        ? data.status
        : "active",
    createdAt: timestampToIso(data.createdAt),
    expiresAt: timestampToIso(data.expiresAt),
  };
}

export async function ensureUserProfile(user: User): Promise<void> {
  const username =
    user.displayName || emailToUsername(user.email) || normalizeUsername(user.uid);
  const profileRef = doc(db, "users", user.uid);
  const profileSnapshot = await getDoc(profileRef);

  if (!profileSnapshot.exists()) {
    await setDoc(profileRef, {
      username: normalizeUsername(username),
      displayNickname: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: "active",
    });
    return;
  }

  await updateDoc(profileRef, {
    username: normalizeUsername(username),
    updatedAt: serverTimestamp(),
    status: "active",
  });
}

export function subscribeToUserProfile(
  uid: string,
  callback: (profile: UserProfileRecord | null) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "users", uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(mapUserProfileDocument(snapshot.id, snapshot.data()));
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function updateOwnDisplayNickname(options: {
  uid: string;
  username: string;
  displayNickname: string | null;
}): Promise<void> {
  const nextDisplayNickname =
    options.displayNickname && options.displayNickname.trim()
      ? options.displayNickname.trim()
      : null;
  const profileRef = doc(db, "users", options.uid);

  await updateDoc(profileRef, {
    username: normalizeUsername(options.username),
    displayNickname: nextDisplayNickname,
    updatedAt: serverTimestamp(),
  });

  const friendsSnapshot = await getDocs(collection(db, "users", options.uid, "friends"));
  if (friendsSnapshot.empty) {
    return;
  }

  const batch = writeBatch(db);
  friendsSnapshot.docs.forEach((friendDoc) => {
    const reciprocalRef = doc(db, "users", friendDoc.id, "friends", options.uid);
    batch.set(
      reciprocalRef,
      {
        friendDisplayName: nextDisplayNickname,
      },
      { merge: true },
    );
  });
  await batch.commit();
}

export async function updateOwnSchool(options: {
  uid: string;
  username: string;
  schoolId: SchoolId | "";
  schoolName: string;
  schoolBranchName: string;
}): Promise<void> {
  const schoolId = normalizeSchoolId(options.schoolId);
  const schoolName = options.schoolName.trim() || getSchoolName(schoolId);
  const schoolBranchName = options.schoolBranchName.trim();
  const profileRef = doc(db, "users", options.uid);

  await updateDoc(profileRef, {
    username: normalizeUsername(options.username),
    schoolId,
    schoolName,
    schoolBranchName,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToFriends(
  uid: string,
  callback: (friends: FriendRecord[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const friendsQuery = query(collection(db, "users", uid, "friends"));
  return onSnapshot(
    friendsQuery,
    (snapshot) => {
      callback(
        mapFriendSnapshot(snapshot).sort((a, b) =>
          a.displayName.localeCompare(b.displayName, "zh-Hant"),
        ),
      );
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function subscribeToIncomingFriendRequests(
  uid: string,
  callback: (requests: FriendRequestRecord[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const requestQuery = query(
    collection(db, "friendRequests"),
    where("toUid", "==", uid),
    where("status", "==", "pending"),
  );
  return onSnapshot(
    requestQuery,
    (snapshot) => {
      callback(mapRequestSnapshot(snapshot));
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function subscribeToOutgoingFriendRequests(
  uid: string,
  callback: (requests: FriendRequestRecord[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const requestQuery = query(
    collection(db, "friendRequests"),
    where("fromUid", "==", uid),
    where("status", "==", "pending"),
  );
  return onSnapshot(
    requestQuery,
    (snapshot) => {
      callback(mapRequestSnapshot(snapshot));
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function sendFriendRequest(options: {
  fromUid: string;
  fromUsername: string;
  fromDisplayName?: string | null;
  targetUsername: string;
}): Promise<void> {
  const normalizedTarget = normalizeUsername(options.targetUsername);
  const usersQuery = query(
    collection(db, "users"),
    where("username", "==", normalizedTarget),
    limit(1),
  );
  const userSnapshots = await getDocs(usersQuery);

  if (userSnapshots.empty) {
    throw new Error("找不到這個帳號。");
  }

  const targetDoc = userSnapshots.docs[0];
  const targetUid = targetDoc.id;
  const targetUsername =
    typeof targetDoc.data().username === "string"
      ? targetDoc.data().username
      : normalizedTarget;

  if (targetUid === options.fromUid) {
    throw new Error("不能把自己加入好友列表。");
  }

  const reverseRequestRef = doc(
    db,
    "friendRequests",
    `${targetUid}__${options.fromUid}`,
  );
  const reverseRequest = await getDoc(reverseRequestRef);
  if (reverseRequest.exists() && reverseRequest.data().status === "pending") {
    throw new Error("對方已經送出好友邀請，請等待你這邊確認。");
  }

  const requestRef = doc(
    db,
    "friendRequests",
    `${options.fromUid}__${targetUid}`,
  );
  const requestSnapshot = await getDoc(requestRef);
  if (requestSnapshot.exists() && requestSnapshot.data().status === "pending") {
    throw new Error("好友邀請已送出，請等待對方確認。");
  }

  await setDoc(
    requestRef,
    {
      fromUid: options.fromUid,
      fromUsername: normalizeUsername(options.fromUsername),
      fromDisplayName: null,
      toUid: targetUid,
      toUsername: normalizeUsername(targetUsername),
      toDisplayName:
        typeof targetDoc.data().displayNickname === "string" &&
        targetDoc.data().displayNickname.trim()
          ? targetDoc.data().displayNickname.trim()
          : null,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function createFriendInvite(options: {
  issuedByUid: string;
  issuedByUsername: string;
  issuedByDisplayName?: string | null;
}): Promise<FriendInviteRecord> {
  const inviteRef = doc(collection(db, "friendInvites"));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  await setDoc(inviteRef, {
    issuedByUid: options.issuedByUid,
    issuedByUsername: normalizeUsername(options.issuedByUsername),
    issuedByDisplayName:
      options.issuedByDisplayName && options.issuedByDisplayName.trim()
        ? options.issuedByDisplayName.trim()
        : null,
    status: "active",
    createdAt: now,
    expiresAt,
  });

  return {
    id: inviteRef.id,
    issuedByUid: options.issuedByUid,
    issuedByUsername: normalizeUsername(options.issuedByUsername),
    issuedByDisplayName:
      options.issuedByDisplayName && options.issuedByDisplayName.trim()
        ? options.issuedByDisplayName.trim()
        : null,
    status: "active",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getFriendInvite(
  inviteId: string,
): Promise<FriendInviteRecord | null> {
  const inviteSnapshot = await getDoc(doc(db, "friendInvites", inviteId));
  if (!inviteSnapshot.exists()) {
    return null;
  }

  return mapInviteDocument(inviteSnapshot.id, inviteSnapshot.data());
}

export async function sendFriendRequestFromInvite(options: {
  inviteId: string;
  fromUid: string;
  fromUsername: string;
  fromDisplayName?: string | null;
}): Promise<void> {
  const invite = await getFriendInvite(options.inviteId);
  if (!invite) {
    throw new Error("找不到這張好友邀請 QR Code。");
  }

  if (invite.status !== "active") {
    throw new Error("這張好友邀請已失效。");
  }

  if (invite.expiresAt) {
    const expiresAt = new Date(invite.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      throw new Error("這張好友邀請已過期，請對方重新產生。");
    }
  }

  if (invite.issuedByUid === options.fromUid) {
    throw new Error("不能把自己加入好友列表。");
  }

  const reverseRequestRef = doc(
    db,
    "friendRequests",
    `${invite.issuedByUid}__${options.fromUid}`,
  );
  const reverseRequest = await getDoc(reverseRequestRef);
  if (reverseRequest.exists() && reverseRequest.data().status === "pending") {
    throw new Error("對方已經送出好友邀請，請等待你這邊確認。");
  }

  const requestRef = doc(
    db,
    "friendRequests",
    `${options.fromUid}__${invite.issuedByUid}`,
  );
  const requestSnapshot = await getDoc(requestRef);
  if (requestSnapshot.exists() && requestSnapshot.data().status === "pending") {
    throw new Error("好友邀請已送出，請等待對方確認。");
  }

  await setDoc(
    requestRef,
    {
      fromUid: options.fromUid,
      fromUsername: normalizeUsername(options.fromUsername),
      fromDisplayName:
        options.fromDisplayName && options.fromDisplayName.trim()
          ? options.fromDisplayName.trim()
          : null,
      toUid: invite.issuedByUid,
      toUsername: normalizeUsername(invite.issuedByUsername),
      toDisplayName: invite.issuedByDisplayName,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function acceptFriendRequest(
  request: FriendRequestRecord,
): Promise<void> {
  const batch = writeBatch(db);
  const requestRef = doc(db, "friendRequests", request.id);
  const fromFriendRef = doc(db, "users", request.fromUid, "friends", request.toUid);
  const toFriendRef = doc(db, "users", request.toUid, "friends", request.fromUid);

  batch.set(
    fromFriendRef,
    {
      friendUid: request.toUid,
      friendUsername: request.toUsername,
      friendDisplayName:
        "toDisplayName" in request && typeof request.toDisplayName === "string"
          ? request.toDisplayName
          : null,
      addedAt: serverTimestamp(),
      source: "friend-request",
    },
    { merge: true },
  );
  batch.set(
    toFriendRef,
    {
      friendUid: request.fromUid,
      friendUsername: request.fromUsername,
      friendDisplayName:
        "fromDisplayName" in request && typeof request.fromDisplayName === "string"
          ? request.fromDisplayName
          : null,
      addedAt: serverTimestamp(),
      source: "friend-request",
    },
    { merge: true },
  );
  batch.update(requestRef, {
    status: "accepted",
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function rejectFriendRequest(
  requestId: string,
): Promise<void> {
  await updateDoc(doc(db, "friendRequests", requestId), {
    status: "rejected",
    updatedAt: serverTimestamp(),
  });
}

export async function cancelFriendRequest(
  requestId: string,
): Promise<void> {
  await updateDoc(doc(db, "friendRequests", requestId), {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });
}

export async function removeFriend(options: {
  currentUid: string;
  friendUid: string;
}): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", options.currentUid, "friends", options.friendUid));
  batch.delete(doc(db, "users", options.friendUid, "friends", options.currentUid));
  await batch.commit();
}

export async function updateFriendCustomNickname(options: {
  currentUid: string;
  friendUid: string;
  customNickname: string | null;
}): Promise<void> {
  const friendRef = doc(db, "users", options.currentUid, "friends", options.friendUid);
  await updateDoc(friendRef, {
    customNickname:
      options.customNickname && options.customNickname.trim()
        ? options.customNickname.trim()
        : null,
  });
}
