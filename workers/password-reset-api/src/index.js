const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SERVICE_ACCOUNT_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const GOOGLE_IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";
const GOOGLE_FIRESTORE_URL = "https://firestore.googleapis.com/v1";
const RESET_TICKET_TTL_MS = 15 * 60 * 1000;

let cachedAccessToken = null;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
    status,
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== env.ALLOWED_ORIGIN) {
    throw new ApiError(403, "不允許此網站來源呼叫密碼重設服務。");
  }
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    Vary: "Origin",
  };
}

function requiredString(value, fieldName, maxLength = 512) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new ApiError(400, `${fieldName} 格式不正確。`);
  }
  return value.trim();
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
  } catch {
    throw new ApiError(401, "登入憑證格式無效。請重新登入。");
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeStringEquals(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verifyFirebaseIdToken(idToken, projectId) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new ApiError(401, "登入憑證格式無效。請重新登入。");
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const claims = decodeJwtPart(encodedClaims);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new ApiError(401, "登入憑證格式無效。請重新登入。");
  }

  const jwksResponse = await fetch(GOOGLE_SERVICE_ACCOUNT_JWKS_URL, {
    cf: { cacheEverything: true, cacheTtl: 60 * 60 },
  });
  if (!jwksResponse.ok) throw new ApiError(503, "目前無法驗證登入身分，請稍後再試。");
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new ApiError(401, "登入憑證已過期。請重新登入。");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"],
  );
  const signatureIsValid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
  );
  const now = Math.floor(Date.now() / 1000);
  if (
    !signatureIsValid ||
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.exp !== "number" ||
    claims.exp <= now
  ) {
    throw new ApiError(401, "登入憑證無效或已過期。請重新登入。");
  }
  return { uid: claims.sub };
}

function pemToBytes(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getGoogleAccessToken(env) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  let credentials;
  try {
    credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new ApiError(500, "密碼重設服務的受信任憑證尚未正確設定。");
  }
  if (
    typeof credentials.client_email !== "string" ||
    typeof credentials.private_key !== "string"
  ) {
    throw new ApiError(500, "密碼重設服務的受信任憑證格式不正確。");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      aud: GOOGLE_OAUTH_TOKEN_URL,
      exp: now + 3600,
      iat: now,
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit",
    }),
  );
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(credentials.private_key),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const assertionInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(assertionInput),
  );
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    body: new URLSearchParams({
      assertion: `${assertionInput}.${base64UrlEncode(new Uint8Array(signature))}`,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new ApiError(503, "目前無法取得密碼重設服務授權，請稍後再試。");
  }
  cachedAccessToken = {
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000,
    value: payload.access_token,
  };
  return cachedAccessToken.value;
}

function firestoreDocumentUrl(projectId, path) {
  return `${GOOGLE_FIRESTORE_URL}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
}

function timestampValue(date) {
  return { timestampValue: date.toISOString() };
}

function stringValue(value) {
  return { stringValue: value };
}

function readString(document, fieldName) {
  const value = document?.fields?.[fieldName]?.stringValue;
  return typeof value === "string" ? value : "";
}

function readStringArray(document, fieldName) {
  const values = document?.fields?.[fieldName]?.arrayValue?.values;
  return Array.isArray(values)
    ? values.map((item) => item?.stringValue).filter((item) => typeof item === "string")
    : [];
}

function readTimestamp(document, fieldName) {
  const value = document?.fields?.[fieldName]?.timestampValue;
  const date = typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

async function getFirestoreDocument(projectId, token, path) {
  const response = await fetch(firestoreDocumentUrl(projectId, path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(503, "目前無法讀取帳號資料，請稍後再試。");
  return response.json();
}

async function commitFirestore(projectId, token, writes) {
  const response = await fetch(
    `${GOOGLE_FIRESTORE_URL}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
    {
      body: JSON.stringify({ writes }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw new ApiError(503, "目前無法保存重設資料，請稍後再試。");
}

function updateWrite(name, fields, updateTime) {
  const write = {
    update: { fields, name },
    updateMask: { fieldPaths: Object.keys(fields) },
  };
  if (updateTime) write.currentDocument = { updateTime };
  return write;
}

function createWrite(name, fields) {
  return { currentDocument: { exists: false }, update: { fields, name } };
}

function ticketFields({ actorUid, actorUsername, expiresAt, now, targetUid, targetUsername, tokenHash }) {
  return {
    actorUid: stringValue(actorUid),
    actorUsername: stringValue(actorUsername),
    createdAt: timestampValue(now),
    expiresAt: timestampValue(expiresAt),
    status: stringValue("active"),
    targetUid: stringValue(targetUid),
    targetUsername: stringValue(targetUsername),
    tokenHash: stringValue(tokenHash),
  };
}

async function createResetTicket(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new ApiError(401, "請先登入系統管理員帳號。");
  const { targetUid } = await request.json().catch(() => ({}));
  const target = requiredString(targetUid, "目標帳號");
  const actor = await verifyFirebaseIdToken(authHeader.slice(7), env.FIREBASE_PROJECT_ID);
  const googleToken = await getGoogleAccessToken(env);
  const [actorProfile, targetProfile] = await Promise.all([
    getFirestoreDocument(env.FIREBASE_PROJECT_ID, googleToken, `users/${actor.uid}`),
    getFirestoreDocument(env.FIREBASE_PROJECT_ID, googleToken, `users/${target}`),
  ]);
  if (!actorProfile || !readStringArray(actorProfile, "globalRoles").includes("systemAdmin")) {
    throw new ApiError(403, "只有系統管理員可建立密碼重設流程。");
  }
  if (!targetProfile) throw new ApiError(404, "找不到目標帳號。");
  if (readStringArray(targetProfile, "globalRoles").includes("systemAdmin")) {
    throw new ApiError(409, "系統管理員不可由後台重設密碼，請使用已登入的自行修改密碼功能。");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TICKET_TTL_MS);
  const resetId = crypto.randomUUID();
  const resetToken = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(resetToken);
  const actorUsername = readString(actorProfile, "username") || actor.uid;
  const targetUsername = readString(targetProfile, "username") || target;
  const ticketName = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/passwordResetTickets/${resetId}`;
  const indexPath = `passwordResetIndexes/${target}`;
  const indexName = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${indexPath}`;
  const indexDocument = await getFirestoreDocument(env.FIREBASE_PROJECT_ID, googleToken, indexPath);
  const writes = [];
  const priorTicketId = readString(indexDocument, "activeTicketId");
  if (priorTicketId) {
    const priorTicket = await getFirestoreDocument(
      env.FIREBASE_PROJECT_ID,
      googleToken,
      `passwordResetTickets/${priorTicketId}`,
    );
    if (priorTicket && readString(priorTicket, "status") === "active") {
      writes.push(
        updateWrite(
          priorTicket.name,
          { status: stringValue("superseded"), supersededAt: timestampValue(now) },
          priorTicket.updateTime,
        ),
      );
    }
  }
  writes.push(
    createWrite(ticketName, ticketFields({
      actorUid: actor.uid,
      actorUsername,
      expiresAt,
      now,
      targetUid: target,
      targetUsername,
      tokenHash,
    })),
    updateWrite(
      indexName,
      {
        activeTicketId: stringValue(resetId),
        updatedAt: timestampValue(now),
      },
      indexDocument?.updateTime,
    ),
    createWrite(
      `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/auditLogs/${crypto.randomUUID()}`,
      {
        actorUid: stringValue(actor.uid),
        actorUsername: stringValue(actorUsername),
        createdAt: timestampValue(now),
        targetUid: stringValue(target),
        targetUsername: stringValue(targetUsername),
        ticketId: stringValue(resetId),
        type: stringValue("passwordResetTicketCreated"),
      },
    ),
  );
  await commitFirestore(env.FIREBASE_PROJECT_ID, googleToken, writes);
  return { expiresAt: expiresAt.toISOString(), resetId, resetToken };
}

async function completeResetTicket(request, env) {
  const body = await request.json().catch(() => ({}));
  const resetId = requiredString(body.resetId, "重設識別碼", 128);
  const resetToken = requiredString(body.resetToken, "重設權杖", 256);
  if (typeof body.nextPassword !== "string" || body.nextPassword.length > 256) {
    throw new ApiError(400, "新密碼格式不正確。");
  }
  const nextPassword = body.nextPassword;
  if (nextPassword.length < 8) throw new ApiError(400, "新密碼至少需要 8 個字元。");
  const googleToken = await getGoogleAccessToken(env);
  const ticket = await getFirestoreDocument(
    env.FIREBASE_PROJECT_ID,
    googleToken,
    `passwordResetTickets/${encodeURIComponent(resetId)}`,
  );
  const now = new Date();
  if (
    !ticket ||
    readString(ticket, "status") !== "active" ||
    !readTimestamp(ticket, "expiresAt") ||
    readTimestamp(ticket, "expiresAt") <= now ||
    !timingSafeStringEquals(readString(ticket, "tokenHash"), await sha256Hex(resetToken))
  ) {
    throw new ApiError(409, "此重設連結無效、已使用或已過期。");
  }
  const targetUid = readString(ticket, "targetUid");
  const targetUsername = readString(ticket, "targetUsername") || targetUid;
  if (!targetUid) throw new ApiError(409, "此重設連結資料不完整，請請管理員重新建立。 ");
  await commitFirestore(env.FIREBASE_PROJECT_ID, googleToken, [
    updateWrite(
      ticket.name,
      { processingAt: timestampValue(now), status: stringValue("processing") },
      ticket.updateTime,
    ),
  ]);
  const updateResponse = await fetch(
    `${GOOGLE_IDENTITY_TOOLKIT_URL}/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/accounts:update`,
    {
      body: JSON.stringify({
        localId: targetUid,
        password: nextPassword,
        validSince: Math.floor(Date.now() / 1000),
      }),
      headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!updateResponse.ok) {
    await commitFirestore(env.FIREBASE_PROJECT_ID, googleToken, [
      updateWrite(ticket.name, { failedAt: timestampValue(new Date()), status: stringValue("failed") }),
    ]);
    throw new ApiError(503, "目前無法更新密碼，請請管理員重新建立一組重設連結。 ");
  }
  const completedAt = new Date();
  await commitFirestore(env.FIREBASE_PROJECT_ID, googleToken, [
    updateWrite(ticket.name, { completedAt: timestampValue(completedAt), status: stringValue("used") }),
    createWrite(
      `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/auditLogs/${crypto.randomUUID()}`,
      {
        completedAt: timestampValue(completedAt),
        targetUid: stringValue(targetUid),
        targetUsername: stringValue(targetUsername),
        ticketId: stringValue(resetId),
        type: stringValue("passwordResetCompleted"),
      },
    ),
  ]);
  return { status: "completed" };
}

export default {
  async fetch(request, env) {
    let headers = {};
    try {
      headers = corsHeaders(request, env);
      if (request.method === "OPTIONS") return new Response(null, { headers });
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ status: "ok" }, 200, headers);
      }
      if (request.method !== "POST") throw new ApiError(405, "找不到此服務路徑。");
      if (url.pathname === "/v1/password-reset-tickets") {
        return jsonResponse(await createResetTicket(request, env), 200, headers);
      }
      if (url.pathname === "/v1/password-reset/complete") {
        return jsonResponse(await completeResetTicket(request, env), 200, headers);
      }
      throw new ApiError(404, "找不到此服務路徑。");
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const message = error instanceof Error ? error.message : "密碼重設服務發生未預期錯誤。";
      return jsonResponse({ error: message }, status, headers);
    }
  },
};
