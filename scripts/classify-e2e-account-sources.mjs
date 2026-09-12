import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_ID = "fitness-test-tool-e2e";
const FIREBASE_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID ||
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLIENT_SECRET =
  process.env.FIREBASE_CLIENT_SECRET || "j9iVZfS8kkCEFUPaAeJV0sAi";
const FIREBASE_CONFIG_PATH = path.join(
  os.homedir(),
  ".config",
  "configstore",
  "firebase-tools.json",
);
const FIREBASE_CLI_SCOPES = [
  "email",
  "openid",
  "https://www.googleapis.com/auth/firebase",
  "https://www.googleapis.com/auth/cloud-platform",
];

const ACCOUNT_SOURCE = {
  E2E_AUTOMATION: "e2e-automation",
  E2E_SIMULATION: "e2e-simulation",
  PRODUCTION_COPY: "production-copy",
  MANUAL_VALIDATION: "manual-validation",
  UNCLASSIFIED: "unclassified",
};

function parseArgs(argv) {
  const options = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/classify-e2e-account-sources.mjs [--apply]

Classifies E2E user profiles using the accountSource field. The default is a
read-only preview; --apply only patches accountSource on E2E Firestore user
profiles and does not change passwords, roles, or Authentication accounts.`);
      process.exit(0);
    }
  }
  return options;
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
  const text = await response.text();
  if (!response.ok) throw new Error(`刷新 Firebase token 失敗：${response.status} ${text}`);
  const refreshed = JSON.parse(text);
  config.tokens = {
    ...config.tokens,
    ...refreshed,
    refresh_token: config.tokens.refresh_token,
    expires_at: Date.now() + Number(refreshed.expires_in ?? 3600) * 1000,
  };
  writeFirebaseCliConfig(config);
  return refreshed.access_token;
}

function firestoreBase() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
}

async function firestoreRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${json?.error?.message ?? text}`);
  return json;
}

async function listUserProfiles(token) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(`${firestoreBase()}/users`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await firestoreRequest(token, url);
    documents.push(...(result.documents ?? []));
    pageToken = result.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

function stringField(fields, name) {
  return typeof fields?.[name]?.stringValue === "string" ? fields[name].stringValue : "";
}

function booleanField(fields, name) {
  return fields?.[name]?.booleanValue === true;
}

function stringListField(fields, name) {
  return (fields?.[name]?.arrayValue?.values ?? [])
    .map((value) => value.stringValue)
    .filter((value) => typeof value === "string");
}

function accountSourceFor(fields) {
  const current = stringField(fields, "accountSource");
  if (Object.values(ACCOUNT_SOURCE).includes(current)) return current;

  const username = stringField(fields, "username").toLowerCase();
  const purpose = stringField(fields, "accountPurpose").toLowerCase();
  if (purpose === "production-copy") return ACCOUNT_SOURCE.PRODUCTION_COPY;
  if (
    purpose.includes("simulation") ||
    purpose.includes("scenario") ||
    purpose.includes("mobile-guide") ||
    stringListField(fields, "globalRoles").includes("systemAdmin")
  ) {
    return ACCOUNT_SOURCE.E2E_SIMULATION;
  }
  if (purpose === "manual-feature-validation" || booleanField(fields, "isManualValidationAccount")) {
    return ACCOUNT_SOURCE.MANUAL_VALIDATION;
  }
  if (username.startsWith("e2e_") || booleanField(fields, "isTestData")) {
    return ACCOUNT_SOURCE.E2E_AUTOMATION;
  }
  return ACCOUNT_SOURCE.UNCLASSIFIED;
}

async function updateAccountSource(token, documentName, accountSource) {
  const url = new URL(`https://firestore.googleapis.com/v1/${documentName}`);
  url.searchParams.append("updateMask.fieldPaths", "accountSource");
  await firestoreRequest(token, url, {
    method: "PATCH",
    body: JSON.stringify({ fields: { accountSource: { stringValue: accountSource } } }),
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = await getAccessToken();
  const profiles = await listUserProfiles(token);
  const pending = profiles.map((profile) => ({
    name: profile.name,
    username: stringField(profile.fields, "username") || profile.name.split("/").at(-1),
    current: stringField(profile.fields, "accountSource"),
    next: accountSourceFor(profile.fields),
  })).filter((profile) => profile.current !== profile.next);

  const counts = Object.fromEntries(
    Object.values(ACCOUNT_SOURCE).map((source) => [source, 0]),
  );
  for (const profile of profiles) counts[accountSourceFor(profile.fields)] += 1;

  console.log(`E2E user profiles: ${profiles.length}`);
  for (const [source, count] of Object.entries(counts)) console.log(`- ${source}: ${count}`);
  console.log(`Profiles needing accountSource update: ${pending.length}`);
  for (const profile of pending.slice(0, 30)) console.log(`- ${profile.username} → ${profile.next}`);
  if (pending.length > 30) console.log(`... ${pending.length - 30} more profiles omitted.`);
  if (!options.apply) {
    console.log("Dry run only. Add --apply to write the accountSource field.");
    return;
  }

  for (const profile of pending) {
    await updateAccountSource(token, profile.name, profile.next);
  }
  console.log(`Updated accountSource on ${pending.length} E2E user profiles.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
