const crypto = require("node:crypto");
const { setGlobalOptions } = require("firebase-functions/v2");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");

initializeApp();
setGlobalOptions({ region: "asia-east1", maxInstances: 10 });

const db = getFirestore();
const auth = getAuth();
const RESET_TICKET_TTL_MS = 15 * 60 * 1000;
const TOKEN_BYTES = 32;

function requiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  return value.trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function tokensMatch(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function requireSystemAdmin(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "請先登入。");
  }

  const profile = await db.doc(`users/${request.auth.uid}`).get();
  const roles = profile.data()?.globalRoles;
  if (!Array.isArray(roles) || !roles.includes("systemAdmin")) {
    throw new HttpsError("permission-denied", "只有系統管理員可建立密碼重設流程。");
  }

  return {
    uid: request.auth.uid,
    username: typeof profile.data()?.username === "string" ? profile.data().username : request.auth.uid,
  };
}

async function writeAuditLog(data) {
  await db.collection("auditLogs").add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
  });
}

exports.createPasswordResetTicket = onCall(async (request) => {
  const actor = await requireSystemAdmin(request);
  const targetUid = requiredString(request.data?.targetUid, "targetUid");
  const targetProfile = await db.doc(`users/${targetUid}`).get();
  if (!targetProfile.exists) {
    throw new HttpsError("not-found", "找不到目標帳號。");
  }

  const target = targetProfile.data();
  const targetRoles = target?.globalRoles;
  if (Array.isArray(targetRoles) && targetRoles.includes("systemAdmin")) {
    throw new HttpsError("failed-precondition", "系統管理員不可由後台重設密碼，請使用已登入的自行修改密碼功能。");
  }

  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const ticketRef = db.collection("passwordResetTickets").doc();
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + RESET_TICKET_TTL_MS);
  const activeTickets = await db
    .collection("passwordResetTickets")
    .where("targetUid", "==", targetUid)
    .where("status", "==", "active")
    .get();
  const batch = db.batch();
  for (const ticket of activeTickets.docs) {
    batch.update(ticket.ref, {
      revokedAt: FieldValue.serverTimestamp(),
      revokedByUid: actor.uid,
      status: "superseded",
    });
  }
  batch.set(ticketRef, {
    actorUid: actor.uid,
    actorUsername: actor.username,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    status: "active",
    targetUid,
    targetUsername: typeof target?.username === "string" ? target.username : targetUid,
    tokenHash: sha256(token),
  });
  await batch.commit();
  await writeAuditLog({
    actorUid: actor.uid,
    actorUsername: actor.username,
    targetUid,
    targetUsername: typeof target?.username === "string" ? target.username : targetUid,
    ticketId: ticketRef.id,
    type: "passwordResetTicketCreated",
  });

  return {
    expiresAt: expiresAt.toDate().toISOString(),
    resetId: ticketRef.id,
    resetToken: token,
    targetUsername: typeof target?.username === "string" ? target.username : targetUid,
  };
});

exports.completePasswordReset = onCall(async (request) => {
  const resetId = requiredString(request.data?.resetId, "resetId");
  const resetToken = requiredString(request.data?.resetToken, "resetToken");
  const nextPassword = requiredString(request.data?.nextPassword, "nextPassword");
  if (nextPassword.length < 8) {
    throw new HttpsError("invalid-argument", "新密碼至少需要 8 個字元。");
  }

  const ticketRef = db.doc(`passwordResetTickets/${resetId}`);
  let targetUid = "";
  let targetUsername = "";
  await db.runTransaction(async (transaction) => {
    const ticket = await transaction.get(ticketRef);
    const data = ticket.data();
    const isValid =
      ticket.exists &&
      data?.status === "active" &&
      data.expiresAt instanceof Timestamp &&
      data.expiresAt.toMillis() > Date.now() &&
      typeof data.tokenHash === "string" &&
      tokensMatch(data.tokenHash, sha256(resetToken));
    if (!isValid) {
      throw new HttpsError("failed-precondition", "此重設連結無效、已使用或已過期。");
    }
    targetUid = data.targetUid;
    targetUsername = data.targetUsername;
    transaction.update(ticketRef, {
      consumedAt: FieldValue.serverTimestamp(),
      status: "processing",
    });
  });

  try {
    await auth.updateUser(targetUid, { password: nextPassword });
    await auth.revokeRefreshTokens(targetUid);
    await ticketRef.update({
      completedAt: FieldValue.serverTimestamp(),
      status: "used",
    });
    await writeAuditLog({
      targetUid,
      targetUsername,
      ticketId: resetId,
      type: "passwordResetCompleted",
    });
  } catch (error) {
    await ticketRef.update({
      failedAt: FieldValue.serverTimestamp(),
      status: "failed",
    });
    throw new HttpsError("internal", "無法更新密碼，請請管理員重新建立一組重設連結。");
  }

  return { status: "completed" };
});
