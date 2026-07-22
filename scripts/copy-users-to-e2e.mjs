import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PRODUCTION_PROJECT_ID = "fitness-test-tool-42789";
const E2E_PROJECT_ID = "fitness-test-tool-e2e";
const USERNAME_EMAIL_DOMAIN = "fitness-test.local";
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

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function readProductionApiKey() {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src", "services", "firebase-config.ts"),
    "utf8",
  );
  const match = source.match(/productionFirebaseConfig[\s\S]*?apiKey:\s*"([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("Cannot find production Firebase API key in firebase-config.ts.");
  }
  return match[1];
}

function readE2eApiKey() {
  const env = { ...readEnvFile(path.join(process.cwd(), ".env.local")), ...process.env };
  const apiKey = env.VITE_E2E_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_E2E_FIREBASE_API_KEY in .env.local or environment.");
  }
  return apiKey;
}

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

function readUsersFromEnv() {
  const raw = process.env.COPY_E2E_USERS_JSON;
  if (!raw) {
    throw new Error(
      "Missing COPY_E2E_USERS_JSON. Example: " +
        'COPY_E2E_USERS_JSON=\'[{"username":"teacher01","password":"..."}]\'',
    );
  }

  const users = JSON.parse(raw);
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error("COPY_E2E_USERS_JSON must be a non-empty array.");
  }

  return users.map((entry) => {
    if (typeof entry?.username !== "string" || typeof entry?.password !== "string") {
      throw new Error("Each user must include username and password strings.");
    }
    return {
      username: entry.username.trim().toLowerCase(),
      password: entry.password,
    };
  });
}

function readFirebaseCliConfig() {
  if (!fs.existsSync(FIREBASE_CONFIG_PATH)) {
    throw new Error(`Cannot find Firebase CLI config: ${FIREBASE_CONFIG_PATH}`);
  }

  const config = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf8"));
  if (!config.tokens?.access_token) {
    throw new Error("Firebase CLI is not logged in. Run pnpm dlx firebase-tools login.");
  }

  return config;
}

function writeFirebaseCliConfig(config) {
  fs.writeFileSync(FIREBASE_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

async function getAccessToken() {
  const config = readFirebaseCliConfig();
  const expiresAt = Number(config.tokens?.expires_at ?? 0);
  const existingToken = config.tokens?.access_token;

  if (existingToken && expiresAt > Date.now() + 60_000) {
    return existingToken;
  }

  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error("Firebase CLI config has no refresh token. Re-login is required.");
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: FIREBASE_CLIENT_ID,
      client_secret: FIREBASE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: FIREBASE_CLI_SCOPES.join(" "),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Firebase access token: ${response.status} ${await response.text()}`);
  }

  const refreshed = await response.json();
  config.tokens = {
    ...config.tokens,
    ...refreshed,
    refresh_token: refreshToken,
    expires_at: Date.now() + Number(refreshed.expires_in ?? 3600) * 1000,
    scopes: FIREBASE_CLI_SCOPES,
  };
  writeFirebaseCliConfig(config);
  return refreshed.access_token;
}

async function authRequest(apiKey, pathName, body) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${pathName}?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = json?.error?.message || text;
    const error = new Error(message);
    error.code = message;
    throw error;
  }
  return json;
}

async function signIn(apiKey, username, password) {
  return authRequest(apiKey, "accounts:signInWithPassword", {
    email: usernameToEmail(username),
    password,
    returnSecureToken: true,
  });
}

async function ensureE2eUser(apiKey, username, password) {
  try {
    const result = await authRequest(apiKey, "accounts:signUp", {
      email: usernameToEmail(username),
      password,
      displayName: username,
      returnSecureToken: true,
    });
    return { uid: result.localId, created: true };
  } catch (error) {
    if (error.code !== "EMAIL_EXISTS") {
      throw error;
    }
  }

  const result = await signIn(apiKey, username, password);
  return { uid: result.localId, created: false };
}

function firestoreBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function firestoreRequest(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Firestore request failed: ${response.status} ${text}`);
  }
  return json;
}

function transformFirestoreValue(value, uidMap) {
  if (!value || typeof value !== "object") {
    return value;
  }

  if ("stringValue" in value) {
    return { ...value, stringValue: uidMap.get(value.stringValue) ?? value.stringValue };
  }

  if ("arrayValue" in value) {
    return {
      arrayValue: {
        values: (value.arrayValue.values ?? []).map((entry) =>
          transformFirestoreValue(entry, uidMap),
        ),
      },
    };
  }

  if ("mapValue" in value) {
    return {
      mapValue: {
        fields: transformFirestoreFields(value.mapValue.fields ?? {}, uidMap),
      },
    };
  }

  return value;
}

function transformFirestoreFields(fields, uidMap) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, value]) => [
      key,
      transformFirestoreValue(value, uidMap),
    ]),
  );
}

function addSystemAdminRole(fields) {
  return {
    ...fields,
    globalRoles: {
      arrayValue: {
        values: [{ stringValue: "systemAdmin" }],
      },
    },
    status: fields.status ?? { stringValue: "active" },
  };
}

function relativeDocumentPath(documentName, projectId) {
  const prefix = `projects/${projectId}/databases/(default)/documents/`;
  if (!documentName.startsWith(prefix)) {
    throw new Error(`Unexpected Firestore document name: ${documentName}`);
  }
  return documentName.slice(prefix.length);
}

async function listCollectionIds(accessToken, projectId, documentPath) {
  const result = await firestoreRequest(
    accessToken,
    `${firestoreBase(projectId)}/${documentPath}:listCollectionIds`,
    { method: "POST", body: JSON.stringify({ pageSize: 100 }) },
  );
  return result.collectionIds ?? [];
}

async function listDocuments(accessToken, projectId, collectionPath) {
  const result = await firestoreRequest(
    accessToken,
    `${firestoreBase(projectId)}/${collectionPath}?pageSize=300`,
  );
  return result.documents ?? [];
}

async function copyDocumentTree({
  accessToken,
  sourceProjectId,
  targetProjectId,
  sourceDocumentPath,
  targetDocumentPath,
  uidMap,
  isUserRoot,
}) {
  const source = await firestoreRequest(
    accessToken,
    `${firestoreBase(sourceProjectId)}/${sourceDocumentPath}`,
  );

  const sourceFields = transformFirestoreFields(source.fields ?? {}, uidMap);
  const targetFields = isUserRoot ? addSystemAdminRole(sourceFields) : sourceFields;

  await firestoreRequest(accessToken, `${firestoreBase(targetProjectId)}/${targetDocumentPath}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: targetFields }),
  });

  const collectionIds = await listCollectionIds(accessToken, sourceProjectId, sourceDocumentPath);
  for (const collectionId of collectionIds) {
    const documents = await listDocuments(
      accessToken,
      sourceProjectId,
      `${sourceDocumentPath}/${collectionId}`,
    );

    for (const document of documents) {
      const sourceChildPath = relativeDocumentPath(document.name, sourceProjectId);
      const documentId = sourceChildPath.split("/").at(-1);
      const targetChildPath = `${targetDocumentPath}/${collectionId}/${documentId}`;
      await copyDocumentTree({
        accessToken,
        sourceProjectId,
        targetProjectId,
        sourceDocumentPath: sourceChildPath,
        targetDocumentPath: targetChildPath,
        uidMap,
        isUserRoot: false,
      });
    }
  }
}

async function main() {
  const users = readUsersFromEnv();
  const productionApiKey = readProductionApiKey();
  const e2eApiKey = readE2eApiKey();
  const accessToken = await getAccessToken();

  const resolvedUsers = [];
  for (const user of users) {
    const productionAuth = await signIn(productionApiKey, user.username, user.password);
    const e2eAuth = await ensureE2eUser(e2eApiKey, user.username, user.password);
    resolvedUsers.push({
      username: user.username,
      productionUid: productionAuth.localId,
      e2eUid: e2eAuth.uid,
      e2eCreated: e2eAuth.created,
    });
  }

  const uidMap = new Map(
    resolvedUsers.flatMap((user) => [
      [user.productionUid, user.e2eUid],
      [user.e2eUid, user.e2eUid],
    ]),
  );

  for (const user of resolvedUsers) {
    await copyDocumentTree({
      accessToken,
      sourceProjectId: PRODUCTION_PROJECT_ID,
      targetProjectId: E2E_PROJECT_ID,
      sourceDocumentPath: `users/${user.productionUid}`,
      targetDocumentPath: `users/${user.e2eUid}`,
      uidMap,
      isUserRoot: true,
    });

    console.log(
      `${user.username}: copied production user ${user.productionUid} to e2e user ${user.e2eUid}` +
        (user.e2eCreated ? " (created auth user)" : " (existing auth user)"),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
