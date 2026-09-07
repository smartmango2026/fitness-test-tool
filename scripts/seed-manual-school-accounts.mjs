import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_ID = "fitness-test-tool-e2e";
const USERNAME_EMAIL_DOMAIN = "fitness-test.local";
const DEFAULT_PASSWORD = "test1234";
const FIREBASE_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID ||
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLIENT_SECRET =
  process.env.FIREBASE_CLIENT_SECRET || "j9iVZfS8kkCEFUPaAeJV0sAi";
const FIREBASE_CLI_SCOPES = [
  "email",
  "openid",
  "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
  "https://www.googleapis.com/auth/firebase",
  "https://www.googleapis.com/auth/cloud-platform",
];
const FIREBASE_CONFIG_PATH = path.join(
  os.homedir(),
  ".config",
  "configstore",
  "firebase-tools.json",
);

const SCHOOLS = [
  { schoolName: "臺北市立文山幼兒園", code: "wenshan", legacyUsername: "e2e_tpe_wenshan" },
  { schoolName: "臺北市立信義幼兒園", code: "xinyi", legacyUsername: "e2e_tpe_xinyi" },
  { schoolName: "臺北市立士林幼兒園", code: "shilin", legacyUsername: "e2e_tpe_shilin" },
  { schoolName: "臺北市立內湖幼兒園", code: "neihu", legacyUsername: "e2e_tpe_neihu" },
  { schoolName: "臺北市立大安幼兒園", code: "daan", legacyUsername: "e2e_tpe_daan" },
  { schoolName: "臺北市立松山幼兒園", code: "songshan", legacyUsername: "e2e_tpe_songshan" },
];

function parseArgs(argv) {
  const options = { apply: false, password: DEFAULT_PASSWORD };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--password") {
      options.password = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/seed-manual-school-accounts.mjs [--apply] [--password <password>]

Without --apply, prints the planned migration and account creation only.
With --apply, renames the six earlier school accounts and creates two more teachers per school.
All accounts are created in the E2E Firebase project only.`);
      process.exit(0);
    }
  }
  if (options.password.length < 6) {
    throw new Error("密碼至少需要 6 個字元。");
  }
  return options;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function readE2eApiKey() {
  const env = { ...readEnvFile(path.join(process.cwd(), ".env.local")), ...process.env };
  if (!env.VITE_E2E_FIREBASE_API_KEY) {
    throw new Error("缺少 .env.local 裡的 VITE_E2E_FIREBASE_API_KEY。");
  }
  return env.VITE_E2E_FIREBASE_API_KEY;
}

function readFirebaseCliConfig() {
  if (!fs.existsSync(FIREBASE_CONFIG_PATH)) {
    throw new Error(`找不到 Firebase CLI 登入設定：${FIREBASE_CONFIG_PATH}`);
  }
  const config = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf8"));
  if (!config.tokens?.access_token) throw new Error("Firebase CLI 尚未登入。");
  return config;
}

function writeFirebaseCliConfig(config) {
  fs.writeFileSync(FIREBASE_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

async function getAccessToken() {
  const config = readFirebaseCliConfig();
  if (config.tokens.access_token && Number(config.tokens.expires_at) > Date.now() + 60_000) {
    return config.tokens.access_token;
  }
  if (!config.tokens.refresh_token) throw new Error("Firebase CLI 沒有 refresh token，請重新登入。");
  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: FIREBASE_CLIENT_ID,
      client_secret: FIREBASE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: config.tokens.refresh_token,
      scope: FIREBASE_CLI_SCOPES.join(" "),
    }),
  });
  if (!response.ok) throw new Error(`刷新 Firebase token 失敗：${response.status} ${await response.text()}`);
  const refreshed = await response.json();
  config.tokens = {
    ...config.tokens,
    ...refreshed,
    refresh_token: config.tokens.refresh_token,
    expires_at: Date.now() + Number(refreshed.expires_in ?? 3600) * 1000,
    scopes: FIREBASE_CLI_SCOPES,
  };
  writeFirebaseCliConfig(config);
  return refreshed.access_token;
}

function usernameToEmail(username) {
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${json?.error?.message ?? text}`);
  return json;
}

async function identityAdminRequest(accessToken, action, body) {
  return requestJson(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:${action}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function authSignUp(apiKey, username, password) {
  return requestJson(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: usernameToEmail(username),
      password,
      displayName: username,
      returnSecureToken: true,
    }),
  });
}

function firestoreBase() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
}

async function firestoreRequest(accessToken, url, options = {}) {
  return requestJson(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

function profileFields({ username, schoolName, displayNickname, now }) {
  return {
    username: { stringValue: username },
    displayNickname: { stringValue: displayNickname },
    schoolName: { stringValue: schoolName },
    status: { stringValue: "active" },
    isTestData: { booleanValue: false },
    isManualValidationAccount: { booleanValue: true },
    accountPurpose: { stringValue: "manual-feature-validation" },
    updatedAt: { timestampValue: now },
  };
}

async function upsertProfile(accessToken, uid, values, create) {
  const updateFields = create ? [...Object.keys(values), "createdAt"] : Object.keys(values);
  const url = new URL(`${firestoreBase()}/users/${uid}`);
  for (const field of updateFields) url.searchParams.append("updateMask.fieldPaths", field);
  if (!create) url.searchParams.set("currentDocument.exists", "true");
  const fields = create
    ? { ...values, createdAt: { timestampValue: new Date().toISOString() } }
    : values;
  await firestoreRequest(accessToken, url, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

async function clearLegacyE2eMarkers(accessToken, uid) {
  const url = new URL(`${firestoreBase()}/users/${uid}`);
  for (const field of ["testDataPrefix", "testRunId", "createdByTest"]) {
    url.searchParams.append("updateMask.fieldPaths", field);
  }
  await firestoreRequest(accessToken, url, {
    method: "PATCH",
    body: JSON.stringify({ fields: {} }),
  });
}

async function findProfileUid(accessToken, username) {
  const result = await firestoreRequest(
    accessToken,
    `${firestoreBase()}:runQuery`,
    {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "users" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "username" },
              op: "EQUAL",
              value: { stringValue: username },
            },
          },
          limit: 2,
        },
      }),
    },
  );
  const document = result.find((entry) => entry.document)?.document;
  if (!document?.name) return "";
  return document.name.split("/").at(-1) ?? "";
}

async function renameLegacyAccount(accessToken, school) {
  const nextUsername = `${school.code}_teacher_01`;
  const uid =
    (await findProfileUid(accessToken, school.legacyUsername)) ||
    (await findProfileUid(accessToken, nextUsername));
  if (!uid) {
    throw new Error(`找不到既有帳號 ${school.legacyUsername}，請先確認 E2E 專案資料。`);
  }
  await identityAdminRequest(accessToken, "update", {
    localId: uid,
    email: usernameToEmail(nextUsername),
    displayName: nextUsername,
    returnSecureToken: false,
  });
  await upsertProfile(accessToken, uid, profileFields({
    username: nextUsername,
    schoolName: school.schoolName,
    displayNickname: `${school.schoolName.replace("臺北市立", "").replace("幼兒園", "")}老師 1`,
    now: new Date().toISOString(),
  }), false);
  await clearLegacyE2eMarkers(accessToken, uid);
  return { uid, username: nextUsername };
}

async function createTeacher(accessToken, apiKey, password, school, number) {
  const username = `${school.code}_teacher_0${number}`;
  const existingUid = await findProfileUid(accessToken, username);
  if (existingUid) {
    return { uid: existingUid, username, created: false };
  }
  const result = await authSignUp(apiKey, username, password);
  await upsertProfile(accessToken, result.localId, profileFields({
    username,
    schoolName: school.schoolName,
    displayNickname: `${school.schoolName.replace("臺北市立", "").replace("幼兒園", "")}老師 ${number}`,
    now: new Date().toISOString(),
  }), true);
  return { uid: result.localId, username, created: true };
}

function printPlan() {
  for (const school of SCHOOLS) {
    console.log(`${school.schoolName}: ${school.legacyUsername} → ${school.code}_teacher_01; add ${school.code}_teacher_02, ${school.code}_teacher_03`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  printPlan();
  if (!options.apply) {
    console.log("Dry run only. Add --apply to make changes.");
    return;
  }
  const [accessToken, apiKey] = await Promise.all([getAccessToken(), readE2eApiKey()]);
  for (const school of SCHOOLS) {
    const renamed = await renameLegacyAccount(accessToken, school);
    const created = [];
    for (const number of [2, 3]) created.push(await createTeacher(accessToken, apiKey, options.password, school, number));
    console.log(`${school.schoolName}: renamed ${renamed.username}; ${created.map((entry) => `${entry.created ? "created" : "existing"} ${entry.username}`).join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
