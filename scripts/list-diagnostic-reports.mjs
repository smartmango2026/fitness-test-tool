import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "fitness-test-tool-42789";
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

function parseArgs(argv) {
  const options = {
    limit: 10,
    details: false,
    id: "",
    refresh: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--details") {
      options.details = true;
      continue;
    }
    if (arg === "--refresh") {
      options.refresh = true;
      continue;
    }
    if (arg === "--id") {
      options.id = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const nextLimit = Number(argv[index + 1]);
      if (Number.isInteger(nextLimit) && nextLimit > 0) {
        options.limit = nextLimit;
      }
      index += 1;
    }
  }

  return options;
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

async function getAccessToken(options) {
  const config = readFirebaseCliConfig();
  const expiresAt = Number(config.tokens?.expires_at ?? 0);
  const existingToken = config.tokens?.access_token;

  if (!options.refresh && existingToken && expiresAt > Date.now() + 60_000) {
    return existingToken;
  }

  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error("Firebase CLI 設定中沒有 refresh token，請重新登入 Firebase CLI。");
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: FIREBASE_CLIENT_ID,
      client_secret: FIREBASE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: FIREBASE_CLI_SCOPES.join(" "),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`刷新 Firebase access token 失敗：HTTP ${response.status} ${text}`);
  }

  const refreshed = await response.json();
  if (typeof refreshed.access_token !== "string") {
    throw new Error("刷新 Firebase access token 失敗：回應中沒有 access_token。");
  }

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

function reportFromDocument(document) {
  const fields = document.fields ?? {};
  const userMessage = firestoreValue(fields.userMessage) ?? {};
  const currentFile = firestoreValue(fields.currentFileSnapshot) ?? {};
  const userActions = firestoreValue(fields.userActions) ?? [];
  const diagnostics = firestoreValue(fields.diagnostics) ?? [];

  return {
    id: document.name.split("/").pop(),
    createdAt: firestoreValue(fields.createdAt),
    status: firestoreValue(fields.status),
    statusLabel: firestoreValue(fields.statusLabel),
    reporterUid: firestoreValue(fields.reporterUid),
    reporterUsername: firestoreValue(fields.reporterUsername),
    reporterDisplayName: firestoreValue(fields.reporterDisplayName),
    browserId: firestoreValue(fields.browserId),
    title: userMessage.title ?? "",
    description: userMessage.description ?? "",
    expected: userMessage.expected ?? "",
    actual: userMessage.actual ?? "",
    currentFile,
    userActions,
    diagnostics,
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Firestore API 失敗：HTTP ${response.status} ${text}`);
  }
  return JSON.parse(text);
}

async function listReports(options, token) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/diagnosticReports`,
  );
  url.searchParams.set("pageSize", String(options.limit));
  url.searchParams.set("orderBy", "createdAt desc");
  const data = await fetchJson(url, token);
  return (data.documents ?? []).map(reportFromDocument);
}

async function getReport(reportId, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/diagnosticReports/${reportId}`;
  return reportFromDocument(await fetchJson(url, token));
}

function printReportSummary(report) {
  console.log(`- ${report.id}`);
  console.log(`  狀態：${report.statusLabel ?? report.status ?? "未標示"}`);
  console.log(`  時間：${report.createdAt ?? "未知"}`);
  console.log(`  回報者：${report.reporterUsername ?? "匿名"}${report.reporterUid ? ` (${report.reporterUid})` : ""}`);
  console.log(`  瀏覽器：${report.browserId ?? "未知"}`);
  console.log(`  標題：${report.title || "(無標題)"}`);
  console.log(`  描述：${report.description || "(無描述)"}`);
  console.log(`  目前檔案：${report.currentFile.fileName ?? report.currentFile.rosterName ?? "未開啟檔案"}`);
  console.log(`  操作紀錄：${report.userActions.length} 筆，技術紀錄：${report.diagnostics.length} 筆`);
}

function printReportDetails(report) {
  printReportSummary(report);
  console.log("  最近使用者操作：");
  for (const action of report.userActions.slice(0, 20)) {
    console.log(`    ${action.timestamp ?? ""} ${action.label ?? action.message ?? action.type}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = await getAccessToken(options);

  if (options.id) {
    const report = await getReport(options.id, token);
    options.details ? printReportDetails(report) : printReportSummary(report);
    return;
  }

  const reports = await listReports(options, token);
  if (reports.length === 0) {
    console.log("目前沒有問題回報。");
    return;
  }

  for (const report of reports) {
    options.details ? printReportDetails(report) : printReportSummary(report);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
