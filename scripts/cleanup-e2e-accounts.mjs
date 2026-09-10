import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_ID = "fitness-test-tool-e2e";
const E2E_PREFIX = "e2e_";
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

function parseArgs(argv) {
  const options = { apply: false, json: false };
  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/cleanup-e2e-accounts.mjs [--apply] [--json]

Lists Firebase Auth accounts whose usernames start with ${E2E_PREFIX} and all
Firestore documents that reference those accounts. The default is read-only.
Pass --apply to delete the listed Firestore documents first and then the Auth
accounts. Manual validation accounts do not use this prefix and are excluded.`);
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

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${json?.error?.message ?? text}`);
  return json;
}

function firestoreBase() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
}

async function firestoreRequest(token, url, options = {}) {
  return requestJson(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function identityRequest(token, action, options = {}) {
  return requestJson(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:${action}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    },
  );
}

function usernameFromAccount(account) {
  const email = typeof account.email === "string" ? account.email : "";
  const suffix = "@fitness-test.local";
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : account.displayName ?? "";
}

async function listAuthUsers(token) {
  const users = [];
  let nextPageToken = "";
  do {
    const url = new URL(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`,
    );
    url.searchParams.set("maxResults", "1000");
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);
    const result = await requestJson(url, { headers: { Authorization: `Bearer ${token}` } });
    users.push(...(result.users ?? []));
    nextPageToken = result.nextPageToken ?? "";
  } while (nextPageToken);
  return users;
}

function relativePath(documentName) {
  const prefix = `projects/${PROJECT_ID}/databases/(default)/documents/`;
  return documentName.startsWith(prefix) ? documentName.slice(prefix.length) : documentName;
}

async function listCollectionIds(token, documentPath = "") {
  const url = documentPath
    ? `${firestoreBase()}/${documentPath}:listCollectionIds`
    : `${firestoreBase()}:listCollectionIds`;
  const result = await firestoreRequest(token, url, {
    method: "POST",
    body: JSON.stringify({ pageSize: 100 }),
  });
  return result.collectionIds ?? [];
}

async function listDocuments(token, collectionPath) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(`${firestoreBase()}/${collectionPath}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await firestoreRequest(token, url);
    documents.push(...(result.documents ?? []));
    pageToken = result.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

function firestoreValueToText(value) {
  if (!value) return "";
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(firestoreValueToText).join("\n");
  if ("mapValue" in value) return Object.values(value.mapValue.fields ?? {}).map(firestoreValueToText).join("\n");
  return "";
}

function documentReferencesTokens(document, tokens) {
  const text = [
    relativePath(document.name),
    ...Object.values(document.fields ?? {}).map(firestoreValueToText),
  ].join("\n");
  return tokens.some((token) => text.includes(token));
}

async function collectDocumentTree(token, documentPath, paths) {
  const childCollections = await listCollectionIds(token, documentPath);
  for (const collectionId of childCollections) {
    const documents = await listDocuments(token, `${documentPath}/${collectionId}`);
    for (const document of documents) {
      const childPath = relativePath(document.name);
      await collectDocumentTree(token, childPath, paths);
    }
  }
  paths.add(documentPath);
}

async function mapWithConcurrency(items, limit, callback) {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await callback(items[index], index);
      }
    }),
  );
}

async function collectFirestorePaths(token, candidates) {
  const paths = new Set();
  const tokens = candidates.flatMap((candidate) => [candidate.localId, candidate.username]);

  await mapWithConcurrency(candidates, 20, async (candidate, index) => {
    await collectDocumentTree(token, `users/${candidate.localId}`, paths);
    if ((index + 1) % 25 === 0 || index + 1 === candidates.length) {
      console.log(`Scanned ${index + 1}/${candidates.length} E2E user document trees.`);
    }
  });

  for (const collectionId of await listCollectionIds(token)) {
    if (collectionId === "users") continue;
    console.log(`Scanning top-level collection: ${collectionId}`);
    const documents = await listDocuments(token, collectionId);
    for (const document of documents) {
      if (documentReferencesTokens(document, tokens)) {
        await collectDocumentTree(token, relativePath(document.name), paths);
      }
    }
  }
  return [...paths];
}

async function deleteFirestorePaths(token, paths) {
  const sorted = [...paths].sort(
    (left, right) => right.split("/").length - left.split("/").length,
  );
  for (let index = 0; index < sorted.length; index += 400) {
    const writes = sorted.slice(index, index + 400).map((documentPath) => ({
      delete: `projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`,
    }));
    await firestoreRequest(token, `${firestoreBase()}:commit`, {
      method: "POST",
      body: JSON.stringify({ writes }),
    });
  }
}

function report(options, candidates, firestorePaths) {
  const result = {
    projectId: PROJECT_ID,
    mode: options.apply ? "apply" : "dry-run",
    authAccounts: candidates.map((candidate) => ({
      username: candidate.username,
      uid: candidate.localId,
      createdAt: candidate.createdAt,
      lastLoginAt: candidate.lastLoginAt,
    })),
    firestoreDocumentCount: firestorePaths.length,
  };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`E2E Auth accounts: ${candidates.length}`);
  console.log(`Associated Firestore documents: ${firestorePaths.length}`);
  for (const candidate of result.authAccounts.slice(0, 30)) {
    console.log(`- ${candidate.username}`);
  }
  if (candidates.length > 30) console.log(`... ${candidates.length - 30} more accounts omitted.`);
  if (!options.apply) console.log("Dry run only. Add --apply to delete these accounts and documents.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = await getAccessToken();
  const candidates = (await listAuthUsers(token))
    .map((account) => ({ ...account, username: usernameFromAccount(account) }))
    .filter((account) => account.username.startsWith(E2E_PREFIX));
  const firestorePaths = await collectFirestorePaths(token, candidates);
  report(options, candidates, firestorePaths);
  if (!options.apply || candidates.length === 0) return;

  await deleteFirestorePaths(token, firestorePaths);
  await identityRequest(token, "batchDelete", {
    method: "POST",
    body: JSON.stringify({
      localIds: candidates.map((candidate) => candidate.localId),
      force: true,
    }),
  });
  console.log(`Deleted ${candidates.length} Auth accounts and ${firestorePaths.length} Firestore documents.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
