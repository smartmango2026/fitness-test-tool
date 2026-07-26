import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT_ALIAS = "e2e";
const DEFAULT_PREFIXES = ["e2e_", "prod_smoke_", "test_cleanup_"];
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
const FAST_CHECK_ROOT_COLLECTIONS = [
  "auditLogs",
  "diagnosticReports",
  "diagnosticReportStatuses",
  "friendInvites",
  "friendRequests",
  "loginLogs",
  "loginPasses",
  "passwordResetLinks",
  "systemLogs",
  "users",
];

function parseArgs(argv) {
  const options = {
    project: DEFAULT_PROJECT_ALIAS,
    prefixes: DEFAULT_PREFIXES,
    testRunId: "",
    maxDocuments: 5000,
    deepScan: false,
    skipAuth: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      options.project = argv[index + 1] ?? options.project;
      index += 1;
      continue;
    }
    if (arg === "--prefix") {
      options.prefixes = (argv[index + 1] ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--test-run-id") {
      options.testRunId = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--max-documents") {
      const nextValue = Number(argv[index + 1]);
      if (Number.isInteger(nextValue) && nextValue > 0) {
        options.maxDocuments = nextValue;
      }
      index += 1;
      continue;
    }
    if (arg === "--deep-scan") {
      options.deepScan = true;
      continue;
    }
    if (arg === "--skip-auth") {
      options.skipAuth = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (options.prefixes.length === 0) {
    throw new Error("至少需要一個 --prefix。");
  }

  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/check-test-cleanup.mjs [options]

Options:
  --project <alias-or-id>       Firebase project alias/id. Default: e2e
  --prefix <a,b,c>              Test data prefixes. Default: ${DEFAULT_PREFIXES.join(",")}
  --test-run-id <id>            Optional exact testRunId to query
  --deep-scan                   Search all Firestore documents for prefix text
  --max-documents <number>      Maximum Firestore documents to scan in deep mode. Default: 5000
  --skip-auth                   Skip Firebase Auth export check
  --json                        Print machine-readable JSON

Exit codes:
  0  No matching test data remains
  1  Script error
  2  Matching test data remains
`);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveProjectId(projectOrAlias) {
  const rc = readJsonIfExists(path.join(process.cwd(), ".firebaserc"));
  return rc?.projects?.[projectOrAlias] ?? projectOrAlias;
}

function readFirebaseCliConfig() {
  if (!fs.existsSync(FIREBASE_CONFIG_PATH)) {
    throw new Error(`找不到 Firebase CLI 登入設定：${FIREBASE_CONFIG_PATH}`);
  }

  const config = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf8"));
  if (!config.tokens?.access_token) {
    throw new Error("Firebase CLI 尚未登入，請先執行 pnpm dlx firebase-tools login。");
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
    throw new Error("Firebase CLI 設定中沒有 refresh token，請重新登入 Firebase CLI。");
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
    throw new Error(`刷新 Firebase access token 失敗：HTTP ${response.status} ${await response.text()}`);
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

function firestoreBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function fetchFirestore(url, token, options = {}) {
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
  if (!response.ok) {
    throw new Error(`Firestore API 失敗：HTTP ${response.status} ${text}`);
  }
  return json;
}

async function runFirestoreQuery(projectId, token, structuredQuery) {
  const url = `${firestoreBase(projectId)}:runQuery`;
  const result = await fetchFirestore(url, token, {
    method: "POST",
    body: JSON.stringify({ structuredQuery }),
  });
  return result
    .map((entry) => entry.document)
    .filter((document) => document && typeof document.name === "string");
}

function fieldEqualsFilter(fieldPath, value) {
  const firestoreValue =
    typeof value === "boolean" ? { booleanValue: value } : { stringValue: value };
  return {
    fieldFilter: {
      field: { fieldPath },
      op: "EQUAL",
      value: firestoreValue,
    },
  };
}

async function listCollectionIds(projectId, token, documentPath = "") {
  const target = documentPath
    ? `${firestoreBase(projectId)}/${documentPath}:listCollectionIds`
    : `${firestoreBase(projectId)}:listCollectionIds`;
  const result = await fetchFirestore(target, token, {
    method: "POST",
    body: JSON.stringify({ pageSize: 100 }),
  });
  return result.collectionIds ?? [];
}

async function listDocuments(projectId, token, collectionPath) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(`${firestoreBase(projectId)}/${collectionPath}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const result = await fetchFirestore(url, token);
    documents.push(...(result.documents ?? []));
    pageToken = result.nextPageToken ?? "";
  } while (pageToken);

  return documents;
}

function relativeDocumentPath(documentName, projectId) {
  const prefix = `projects/${projectId}/databases/(default)/documents/`;
  if (!documentName.startsWith(prefix)) {
    throw new Error(`Unexpected Firestore document name: ${documentName}`);
  }
  return documentName.slice(prefix.length);
}

function firestoreValue(field) {
  if (!field) {
    return null;
  }
  if ("stringValue" in field) {
    return field.stringValue;
  }
  if ("integerValue" in field) {
    return Number(field.integerValue);
  }
  if ("doubleValue" in field) {
    return Number(field.doubleValue);
  }
  if ("booleanValue" in field) {
    return field.booleanValue;
  }
  if ("timestampValue" in field) {
    return field.timestampValue;
  }
  if ("nullValue" in field) {
    return null;
  }
  if ("mapValue" in field) {
    return Object.fromEntries(
      Object.entries(field.mapValue.fields ?? {}).map(([key, value]) => [
        key,
        firestoreValue(value),
      ]),
    );
  }
  if ("arrayValue" in field) {
    return (field.arrayValue.values ?? []).map(firestoreValue);
  }
  return field;
}

function fieldsToPlainObject(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, value]) => [key, firestoreValue(value)]),
  );
}

function collectMatchingStrings(value, prefixes, pathParts = []) {
  const matches = [];

  if (typeof value === "string") {
    const matchedPrefix = prefixes.find((prefix) =>
      value.toLowerCase().includes(prefix.toLowerCase()),
    );
    if (matchedPrefix) {
      matches.push({
        fieldPath: pathParts.join(".") || "(value)",
        prefix: matchedPrefix,
        value,
      });
    }
    return matches;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      matches.push(...collectMatchingStrings(entry, prefixes, [...pathParts, String(index)]));
    });
    return matches;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      matches.push(...collectMatchingStrings(entry, prefixes, [...pathParts, key]));
    }
  }

  return matches;
}

function documentMatches(document, projectId, prefixes) {
  const pathName = relativeDocumentPath(document.name, projectId);
  const pathMatches = collectMatchingStrings(pathName, prefixes, ["__path"]);
  const fieldMatches = collectMatchingStrings(
    fieldsToPlainObject(document.fields ?? {}),
    prefixes,
  );
  return [...pathMatches, ...fieldMatches];
}

async function scanFirestore(projectId, token, options) {
  const pendingCollections = (await listCollectionIds(projectId, token)).map((collectionId) => ({
    collectionPath: collectionId,
  }));
  const findings = [];
  let scannedDocuments = 0;
  let truncated = false;

  while (pendingCollections.length > 0) {
    const { collectionPath } = pendingCollections.shift();
    const documents = await listDocuments(projectId, token, collectionPath);

    for (const document of documents) {
      scannedDocuments += 1;
      const documentPath = relativeDocumentPath(document.name, projectId);
      const matches = documentMatches(document, projectId, options.prefixes);
      if (matches.length > 0) {
        findings.push({
          source: "firestore",
          documentPath,
          matches: matches.slice(0, 5),
        });
      }

      if (scannedDocuments >= options.maxDocuments) {
        truncated = true;
        break;
      }

      const childCollections = await listCollectionIds(projectId, token, documentPath);
      for (const collectionId of childCollections) {
        pendingCollections.push({
          collectionPath: `${documentPath}/${collectionId}`,
        });
      }
    }

    if (truncated) {
      break;
    }
  }

  return { findings, scannedDocuments, truncated };
}

async function queryFirestoreTestMarkers(projectId, token, options) {
  const findings = [];
  const seenDocumentPaths = new Set();
  const markerQueries = [
    {
      label: "isTestData",
      filter: fieldEqualsFilter("isTestData", true),
    },
    ...options.prefixes.map((prefix) => ({
      label: `testDataPrefix=${prefix}`,
      filter: fieldEqualsFilter("testDataPrefix", prefix),
    })),
  ];

  if (options.testRunId) {
    markerQueries.push({
      label: `testRunId=${options.testRunId}`,
      filter: fieldEqualsFilter("testRunId", options.testRunId),
    });
  }

  let queryCount = 0;
  for (const collectionId of FAST_CHECK_ROOT_COLLECTIONS) {
    for (const markerQuery of markerQueries) {
      queryCount += 1;
      const documents = await runFirestoreQuery(projectId, token, {
        from: [{ collectionId }],
        where: markerQuery.filter,
        limit: 100,
      });

      for (const document of documents) {
        const documentPath = relativeDocumentPath(document.name, projectId);
        const key = `${documentPath}:${markerQuery.label}`;
        if (seenDocumentPaths.has(key)) {
          continue;
        }
        seenDocumentPaths.add(key);
        findings.push({
          source: "firestore",
          mode: "query",
          documentPath,
          matches: [
            {
              fieldPath: markerQuery.label,
              prefix: options.prefixes[0] ?? "",
              value: markerQuery.label,
            },
          ],
        });
      }
    }
  }

  return {
    findings,
    mode: "query",
    queryCount,
    scannedDocuments: 0,
    truncated: false,
  };
}

async function scanAuthUsers(projectId, options) {
  if (options.skipAuth) {
    return { findings: [], skipped: true };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitness-cleanup-check-"));
  const exportPath = path.join(tempDir, "auth-users.json");

  try {
    const firebaseArgs = [
      "dlx",
      "firebase-tools",
      "auth:export",
      exportPath,
      "--format=json",
      "--project",
      projectId,
    ];
    const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", ["pnpm", ...firebaseArgs].map(quoteShellArg).join(" ")]
        : firebaseArgs;

    await execFileAsync(command, args, {
      cwd: process.cwd(),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 20,
    });

    const exported = JSON.parse(fs.readFileSync(exportPath, "utf8"));
    const users = Array.isArray(exported.users)
      ? exported.users
      : Array.isArray(exported)
        ? exported
        : [];
    const findings = users
      .map((user) => {
        const searchable = {
          localId: user.localId,
          email: user.email,
          displayName: user.displayName,
        };
        const matches = collectMatchingStrings(searchable, options.prefixes);
        return matches.length > 0
          ? {
              source: "auth",
              uid: user.localId ?? "",
              email: user.email ?? "",
              displayName: user.displayName ?? "",
              matches,
            }
          : null;
      })
      .filter(Boolean);

    return { findings, skipped: false, scannedUsers: users.length };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function quoteShellArg(value) {
  if (!/[ \t"&|<>^]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function printTextReport(result) {
  console.log(`Firebase project: ${result.projectId}`);
  console.log(`Prefixes: ${result.prefixes.join(", ")}`);
  console.log(`Firestore mode: ${result.firestore.mode}`);
  if (result.firestore.mode === "deep-scan") {
    console.log(`Firestore scanned: ${result.firestore.scannedDocuments} documents`);
    if (result.firestore.truncated) {
      console.log("Firestore scan: truncated; increase --max-documents for full coverage.");
    }
  } else {
    console.log(`Firestore marker queries: ${result.firestore.queryCount}`);
  }
  if (result.auth.skipped) {
    console.log("Auth scanned: skipped");
  } else {
    console.log(`Auth scanned: ${result.auth.scannedUsers} users`);
  }

  const findingCount = result.findings.length;
  if (findingCount === 0) {
    console.log("Result: CLEAN. No matching test data found.");
    return;
  }

  console.log(`Result: DIRTY. ${findingCount} matching item(s) found.`);
  for (const finding of result.findings.slice(0, 50)) {
    if (finding.source === "auth") {
      console.log(`- [auth] ${finding.email || finding.uid || finding.displayName}`);
    } else {
      console.log(`- [firestore] ${finding.documentPath}`);
    }
    for (const match of finding.matches.slice(0, 3)) {
      console.log(`  ${match.fieldPath}: ${match.value}`);
    }
  }

  if (findingCount > 50) {
    console.log(`... ${findingCount - 50} more finding(s) omitted.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(options.project);
  const token = await getAccessToken();
  const firestore = options.deepScan
    ? { ...(await scanFirestore(projectId, token, options)), mode: "deep-scan" }
    : await queryFirestoreTestMarkers(projectId, token, options);
  const auth = await scanAuthUsers(projectId, options);
  const findings = [...firestore.findings, ...auth.findings];
  const result = {
    projectId,
    prefixes: options.prefixes,
    firestore,
    auth,
    findings,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextReport(result);
  }

  if (findings.length > 0 || firestore.truncated) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
