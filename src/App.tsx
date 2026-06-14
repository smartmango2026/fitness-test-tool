import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ClipboardEvent,
  KeyboardEvent,
} from "react";
import A4CanvasBoard, {
  exportAllReportsPdf,
  type A4CanvasBoardHandle,
} from "./A4CanvasBoard";
import {
  ensureAbilityRulesConfig,
  subscribeToAbilityRulesConfig,
} from "./ability-cloud";
import {
  findAbilityGradeProfile,
  getAbilityBandLabel,
  getAbilityRuleForField,
  getAbilityScores,
  getDisplayValueForField,
  getRubricOptions,
} from "./ability-scoring";
import {
  defaultAbilityRulesConfig,
  type AbilityRulesConfig,
} from "./ability-settings";
import { abilityRulesByGradeGroup, schoolGradeOptions } from "./ability-rules";
import {
  loadDebugSettings,
  type DebugSettings,
} from "./debug-settings";
import {
  readFirebaseConnectionTest,
  writeFirebaseConnectionTest,
} from "./firebase-test";
import { db } from "./firebase";
import {
  getDiagnosticEnvironment,
  getDiagnosticBrowserId,
  getDiagnosticEvents,
  installDiagnosticErrorListeners,
  recordDiagnosticEvent,
  submitDiagnosticReport,
} from "./diagnostics";
import {
  emailToUsername,
  isValidUsername,
  normalizeUsername,
  registerWithUsername,
  signInWithUsername,
  signOutCurrentUser,
  subscribeToAuthState,
} from "./firebase-auth";
import {
  archiveCloudFile,
  createCloudFile,
  getCloudFileEditorUids,
  loadCloudFile,
  saveCloudFile as saveCloudFileData,
  setCloudFileEditors,
  subscribeToCloudFiles,
  type CloudFileSummary,
  updateCloudFileInfo,
} from "./cloud-files";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  createFriendInvite,
  ensureUserProfile,
  getFriendInvite,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
  sendFriendRequestFromInvite,
  subscribeToUserProfile,
  subscribeToFriends,
  subscribeToIncomingFriendRequests,
  subscribeToOutgoingFriendRequests,
  type FriendRecord,
  type FriendInviteRecord,
  type FriendRequestRecord,
  type UserProfileRecord,
  updateFriendCustomNickname,
  updateOwnDisplayNickname,
} from "./friendships";
import RadarChart from "./RadarChart";
import { defaultAppData } from "./sample-data";
import type { AppData, FitnessField, FitnessRecord, RosterEntry, StudentGradeLabel } from "./types";
import type { User } from "firebase/auth";
import QRCode from "qrcode";
import associationLogo from "./assets/sgpea-logo.png";
import {
  createSystemLogOperationId,
  writeSystemLog,
  type SystemLogEntry,
} from "./system-logs";

type TabKey =
  | "files"
  | "account"
  | "table"
  | "metric"
  | "editor"
  | "roster"
  | "analysis"
  | "pdf"
  | "tablab";

type EditableField = keyof FitnessRecord;
type FriendInviteActionState = {
  status: "idle" | "loading" | "success" | "error";
  detail: string;
};

type FriendInviteTraceEntry = {
  timestamp: string;
  status: "loading" | "success" | "error";
  detail: string;
};

type NewCloudFileDraft = {
  academicYear: string;
  semester: string;
  rosterName: string;
  gradeLabel: string;
  testDate: string;
  rosterCount: string;
};

type FileOpenTraceEntry = {
  timestamp: string;
  status: "info" | "success" | "error";
  detail: string;
};

const FRIEND_INVITE_TRACE_STORAGE_KEY = "fitness-test-tool:friend-invite-trace";
const FILE_OPEN_TRACE_STORAGE_KEY = "fitness-test-tool:file-open-trace";

function formatAuthError(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "這個帳號已經註冊過了。";
      case "auth/invalid-email":
        return "帳號格式不正確。";
      case "auth/missing-password":
        return "請輸入密碼。";
      case "auth/weak-password":
        return "密碼強度不足，請至少使用 6 個字元。";
      case "auth/operation-not-allowed":
        return "目前 Firebase 尚未開啟帳號密碼登入。";
      case "auth/user-not-found":
      case "auth/invalid-credential":
        return "找不到這組帳號密碼，請確認後再試一次。";
      case "auth/wrong-password":
        return "密碼不正確。";
      case "auth/too-many-requests":
        return "嘗試次數過多，請稍後再試。";
      default:
        break;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function readFriendInviteIdFromUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("friendInvite") ?? params.get("invite") ?? "";
}

function loadFriendInviteTrace(): FriendInviteTraceEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(FRIEND_INVITE_TRACE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is FriendInviteTraceEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.timestamp === "string" &&
        typeof entry.detail === "string" &&
        (entry.status === "loading" || entry.status === "success" || entry.status === "error"),
    );
  } catch {
    return [];
  }
}

function loadFileOpenTrace(): FileOpenTraceEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(FILE_OPEN_TRACE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is FileOpenTraceEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.timestamp === "string" &&
        (entry.status === "info" ||
          entry.status === "success" ||
          entry.status === "error") &&
        typeof entry.detail === "string",
    );
  } catch {
    return [];
  }
}

function saveFileOpenTrace(entries: FileOpenTraceEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(FILE_OPEN_TRACE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore sessionStorage errors
  }
}

function saveFriendInviteTrace(entries: FriendInviteTraceEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    FRIEND_INVITE_TRACE_STORAGE_KEY,
    JSON.stringify(entries.slice(0, 5)),
  );
}

type ActiveCell = {
  recordId: string;
  field: EditableField;
} | null;

type SheetZoomMode = "fit" | 0.8 | 0.9 | 1 | 1.1;
type FileSortKey = "created-desc" | "updated-desc" | "name-asc" | "roster-asc" | "grade-asc";
type MobileTabVariant = "wrap" | "scroll" | "compact";
type TableSortKey = "seat" | "grade-desc" | "grade-asc";

function readRequestedTabFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get("tab");
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "account", label: "帳號管理" },
  { key: "files", label: "編輯檔案" },
  { key: "roster", label: "學員名單" },
  { key: "metric", label: "測驗項目" },
  { key: "table", label: "測驗總表" },
  { key: "pdf", label: "測驗報告" },
];

const experimentalTabs: Array<{ key: TabKey; label: string }> = [
  ...tabs,
  { key: "tablab", label: "Tab 元件展示" },
];

const tabShowcaseSamples = [
  {
    id: "soft",
    title: "柔和膠囊",
    description: "偏正式產品頁風格，適合主要功能導覽。",
    items: ["總覽", "學生", "報表", "設定"],
    tone: "soft",
  },
  {
    id: "underline",
    title: "底線切換",
    description: "像文件或設定頁，資訊密度高但不搶畫面。",
    items: ["基本資料", "權限", "歷程", "備註"],
    tone: "underline",
  },
  {
    id: "segmented",
    title: "分段切換",
    description: "像 iOS segmented control，適合 2 到 4 個互斥視圖。",
    items: ["今日", "本週", "本月"],
    tone: "segmented",
  },
  {
    id: "card",
    title: "卡片導覽",
    description: "每個 tab 都像功能捷徑，適合實驗性首頁。",
    items: ["檔案", "好友", "分享", "匯出"],
    tone: "card",
  },
  {
    id: "scroll",
    title: "橫向捲動",
    description: "手機版保留單列高度，能容納更多功能項目。",
    items: ["帳號管理", "編輯檔案", "學員名單", "測驗項目", "測驗報告", "檢視報表", "設定"],
    tone: "scroll",
  },
] as const;

const scoreFields: FitnessField[] = [
  "item1",
  "item2",
  "item3",
  "item4",
  "item5",
  "item6",
];

const tableEditableFields: EditableField[] = [
  "studentName",
  "height",
  "weight",
  "studentGradeLabel",
  ...scoreFields,
];

const SHEET_ZOOM_OPTIONS: Array<{ label: string; value: SheetZoomMode }> = [
  { label: "符合頁寬", value: "fit" },
  { label: "80%", value: 0.8 },
  { label: "90%", value: 0.9 },
  { label: "100%", value: 1 },
  { label: "110%", value: 1.1 },
];

const TABLE_SHEET_ZOOM_OPTIONS: Array<{ label: string; value: SheetZoomMode }> = [
  { label: "符合頁寬", value: "fit" },
  { label: "100%", value: 1 },
];

const GRADE_OPTIONS = schoolGradeOptions;
const STUDENT_GRADE_OPTIONS: StudentGradeLabel[] = ["幼幼班", "小班", "中班", "大班"];
const TERM_OPTIONS = ["上學期", "下學期"] as const;
const CURRENT_ROC_YEAR = new Date().getFullYear() - 1911;
const ACADEMIC_YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) =>
  String(CURRENT_ROC_YEAR - 2 + index),
);
const LAST_CLOUD_FILE_STORAGE_PREFIX = "fitness-test-tool:last-cloud-file:";
const TABLE_SORT_OPTIONS: Array<{ value: TableSortKey; label: string }> = [
  { value: "seat", label: "依號碼排序" },
  { value: "grade-desc", label: "依年級排序（大到小）" },
  { value: "grade-asc", label: "依年級排序（小到大）" },
];
const TABLE_GRADE_CHECKBOX_OPTIONS: StudentGradeLabel[] = ["幼幼班", "小班", "中班", "大班"];

function hasIncompleteScore(record: FitnessRecord): boolean {
  return scoreFields.some(
    (field) => !Number.isFinite(record[field]) || record[field] <= 0,
  );
}

function makeEmptyRecord(testDate: string): FitnessRecord {
  return {
    id: crypto.randomUUID(),
    studentName: "",
    height: "",
    weight: "",
    studentGradeLabel: "大班",
    testDate,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0,
    comment: "",
  };
}

function makeEmptyRosterEntry(): RosterEntry {
  return {
    id: crypto.randomUUID(),
    studentName: "",
    height: "",
    weight: "",
    studentGradeLabel: "大班",
  };
}

function normalizeRosterEntriesForFile(
  entries: RosterEntry[],
  fileGradeLabel: string,
): RosterEntry[] {
  return entries.map((entry) => ({
    ...entry,
    studentName: entry.studentName.trim(),
    height: entry.height.trim(),
    weight: entry.weight.trim(),
    studentGradeLabel: resolveStudentGradeLabel(
      fileGradeLabel,
      entry.studentGradeLabel,
    ),
  }));
}

function makeNewCloudFileDraft(source: AppData): NewCloudFileDraft {
  const parts = parseAcademicTermParts(source.academicTerm);
  return {
    academicYear: parts.academicYear || String(CURRENT_ROC_YEAR),
    semester: parts.semester || TERM_OPTIONS[1],
    rosterName: "",
    gradeLabel: source.gradeLabel || GRADE_OPTIONS[0] || "",
    testDate: source.testDate || new Date().toISOString().slice(0, 10),
    rosterCount: "1",
  };
}

function isStudentGradeLabel(value: string): value is StudentGradeLabel {
  return value === "幼幼班" || value === "小班" || value === "中班" || value === "大班";
}

function resolveStudentGradeLabel(
  fileGradeLabel: string,
  studentGradeLabel: string,
): StudentGradeLabel {
  if (isStudentGradeLabel(studentGradeLabel)) {
    return studentGradeLabel;
  }

  if (isStudentGradeLabel(fileGradeLabel)) {
    return fileGradeLabel;
  }

  return "中班";
}

function isMixedAgeClass(gradeLabel: string): boolean {
  return gradeLabel === "混齡班";
}

function getStudentGradeRank(gradeLabel: StudentGradeLabel): number {
  switch (gradeLabel) {
    case "大班":
      return 4;
    case "中班":
      return 3;
    case "小班":
      return 2;
    case "幼幼班":
      return 1;
    default:
      return 0;
  }
}

function inferStudentGradeFromText(
  value: string | undefined,
  fallback: StudentGradeLabel,
): StudentGradeLabel {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  return isStudentGradeLabel(trimmed) ? trimmed : fallback;
}

function upsertRecord(records: FitnessRecord[], nextRecord: FitnessRecord) {
  const foundIndex = records.findIndex((record) => record.id === nextRecord.id);
  if (foundIndex === -1) {
    return [nextRecord, ...records];
  }

  return records.map((record) =>
    record.id === nextRecord.id ? nextRecord : record,
  );
}

function normalizeNumber(value: string): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((row) => row.split("\t"));
}

function formatAcademicTerm(dateString: string): string {
  if (!dateString) {
    return "尚未設定";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  const year = date.getFullYear() - 1911;
  const month = date.getMonth() + 1;
  const term = month >= 8 || month === 1 ? "上學期" : "下學期";
  const academicYear = month === 1 ? year - 1 : year;
  return `${academicYear}學年度${term}`;
}

function parseAcademicTermParts(termValue: string): {
  academicYear: string;
  semester: string;
} {
  const matched = termValue.match(/^(\d+)學年度(上學期|下學期)$/);
  if (!matched) {
    return {
      academicYear: String(CURRENT_ROC_YEAR),
      semester: "上學期",
    };
  }

  return {
    academicYear: matched[1] ?? String(CURRENT_ROC_YEAR),
    semester: matched[2] ?? "上學期",
  };
}

function buildAcademicTermValue(
  academicYear: string,
  semester: string,
): string {
  if (!academicYear || !semester) {
    return "";
  }

  return `${academicYear}學年度${semester}`;
}

function getLastCloudFileStorageKey(uid: string): string {
  return `${LAST_CLOUD_FILE_STORAGE_PREFIX}${uid}`;
}

function readLastCloudFileSelection(uid: string): { fileId: string; ownerUid: string } | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(getLastCloudFileStorageKey(uid));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { fileId?: string; ownerUid?: string };
    if (
      typeof parsed.fileId === "string" &&
      parsed.fileId &&
      typeof parsed.ownerUid === "string" &&
      parsed.ownerUid
    ) {
      return {
        fileId: parsed.fileId,
        ownerUid: parsed.ownerUid,
      };
    }
  } catch {
    // ignore malformed legacy value
  }

  return null;
}

function writeLastCloudFileSelection(
  uid: string,
  selection: { fileId: string; ownerUid: string } | null,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getLastCloudFileStorageKey(uid);
  if (!selection) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(selection));
}

type ReportDebugParams = {
  enabled: boolean;
  fileId: string | null;
  recordId: string | null;
  seat: number | null;
};

type LoadCheckpointKey =
  | "frontend"
  | "auth"
  | "profile"
  | "friends"
  | "friendRequests"
  | "cloudFiles"
  | "abilityRules"
  | "restoreFile";

type LoadCheckpointState = {
  label: string;
  status: "waiting" | "loading" | "success" | "error";
  detail: string;
};

const DEFAULT_LOAD_CHECKPOINTS: Record<LoadCheckpointKey, LoadCheckpointState> = {
  frontend: {
    label: "前端啟動",
    status: "success",
    detail: "React 畫面已啟動，正在確認 Firebase 登入狀態。",
  },
  auth: {
    label: "登入狀態",
    status: "loading",
    detail: "正在確認目前是否已登入。",
  },
  profile: {
    label: "基本資料",
    status: "waiting",
    detail: "登入後才會載入使用者基本資料。",
  },
  friends: {
    label: "好友列表",
    status: "waiting",
    detail: "登入後才會載入好友資料。",
  },
  friendRequests: {
    label: "好友邀請",
    status: "waiting",
    detail: "登入後才會載入收到與送出的好友邀請。",
  },
  cloudFiles: {
    label: "雲端檔案",
    status: "waiting",
    detail: "登入後才會載入你的檔案與共享檔案。",
  },
  abilityRules: {
    label: "能力值設定",
    status: "waiting",
    detail: "登入後才會載入能力值對應表。",
  },
  restoreFile: {
    label: "上次檔案",
    status: "waiting",
    detail: "登入後會嘗試恢復上次使用的檔案。",
  },
};

function makeDefaultLoadCheckpoints(): Record<LoadCheckpointKey, LoadCheckpointState> {
  return JSON.parse(JSON.stringify(DEFAULT_LOAD_CHECKPOINTS)) as Record<
    LoadCheckpointKey,
    LoadCheckpointState
  >;
}

function summarizeFrontendStatus(
  checkpoints: Record<LoadCheckpointKey, LoadCheckpointState>,
): string {
  const errorCheckpoint = Object.values(checkpoints).find((checkpoint) => checkpoint.status === "error");
  if (errorCheckpoint) {
    return `${errorCheckpoint.label}失敗：${errorCheckpoint.detail}`;
  }

  const loadingCheckpoint = Object.values(checkpoints).find(
    (checkpoint) => checkpoint.status === "loading",
  );
  if (loadingCheckpoint) {
    return `${loadingCheckpoint.label}中：${loadingCheckpoint.detail}`;
  }

  return "前端已完成目前可執行的載入檢查。";
}

function readReportDebugParamsFromUrl(): ReportDebugParams {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      fileId: null,
      recordId: null,
      seat: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const debugMode = params.get("debug");
  const fileId = params.get("file");
  const recordId = params.get("record");
  const seatValue = params.get("seat") ?? params.get("id");
  const parsedSeat = seatValue ? Number(seatValue) : NaN;
  const seat = Number.isInteger(parsedSeat) && parsedSeat > 0 ? parsedSeat : null;
  const enabled =
    debugMode === "report" ||
    params.has("file") ||
    params.has("record") ||
    params.has("seat") ||
    params.has("id");

  return {
    enabled,
    fileId: fileId?.trim() || null,
    recordId: recordId?.trim() || null,
    seat,
  };
}

function readMobileTabVariantFromUrl(): MobileTabVariant {
  if (typeof window === "undefined") {
    return "wrap";
  }

  const variant = new URLSearchParams(window.location.search).get("mobileTabs");
  if (variant === "scroll" || variant === "compact") {
    return variant;
  }

  return "wrap";
}

type AppProps = {
  experimentalMode?: boolean;
};

export default function App({ experimentalMode = false }: AppProps) {
  const visibleTabs = experimentalMode ? experimentalTabs : tabs;
  const [data, setData] = useState<AppData>(defaultAppData);
  const reportDebugParams = useMemo(() => readReportDebugParamsFromUrl(), []);
  const mobileTabVariant = useMemo(() => readMobileTabVariantFromUrl(), []);
  const isReportDebugMode = reportDebugParams.enabled;
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const requestedTab = readRequestedTabFromUrl();
    if (requestedTab === "tablab" && experimentalMode) {
      return "tablab";
    }

    if (readReportDebugParamsFromUrl().enabled) {
      return "pdf";
    }

    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("invite")
    ) {
      return "account";
    }

    if (experimentalMode) {
      return "tablab";
    }

    return "account";
  });
  const [selectedId, setSelectedId] = useState<string>(data.records[0]?.id ?? "");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<UserProfileRecord | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showDiagnosticPanel, setShowDiagnosticPanel] = useState(false);
  const [diagnosticTitle, setDiagnosticTitle] = useState("");
  const [diagnosticDescription, setDiagnosticDescription] = useState("");
  const [diagnosticExpected, setDiagnosticExpected] = useState("");
  const [diagnosticActual, setDiagnosticActual] = useState("");
  const [diagnosticSubmitting, setDiagnosticSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [friendDraft, setFriendDraft] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [friendNicknameDrafts, setFriendNicknameDrafts] = useState<Record<string, string>>({});
  const [expandedFriendUids, setExpandedFriendUids] = useState<string[]>([]);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<
    FriendRequestRecord[]
  >([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<
    FriendRequestRecord[]
  >([]);
  const [activeFriendInvite, setActiveFriendInvite] =
    useState<FriendInviteRecord | null>(null);
  const [friendInviteQrDataUrl, setFriendInviteQrDataUrl] = useState("");
  const [activeFriendInviteUrl, setActiveFriendInviteUrl] = useState("");
  const [scannedFriendInvite, setScannedFriendInvite] =
    useState<FriendInviteRecord | null>(null);
  const [friendInviteActionState, setFriendInviteActionState] = useState<FriendInviteActionState>({
    status: "idle",
    detail: "",
  });
  const [friendInviteTraceEntries, setFriendInviteTraceEntries] = useState<
    FriendInviteTraceEntry[]
  >(() => loadFriendInviteTrace());
  const [fileOpenTraceEntries, setFileOpenTraceEntries] = useState<FileOpenTraceEntry[]>(
    () => loadFileOpenTrace(),
  );
  const [cloudFiles, setCloudFiles] = useState<CloudFileSummary[]>([]);
  const [inviteIdFromUrl, setInviteIdFromUrl] = useState(() => readFriendInviteIdFromUrl());
  const [fileSortKey] = useState<FileSortKey>("created-desc");
  const [abilityRulesConfig, setAbilityRulesConfig] = useState<AbilityRulesConfig>(
    defaultAbilityRulesConfig,
  );
  const [currentCloudFileId, setCurrentCloudFileId] = useState<string | null>(null);
  const [currentCloudFileOwnerUid, setCurrentCloudFileOwnerUid] = useState<string | null>(null);
  const [isCloudDirty, setIsCloudDirty] = useState(false);
  const [expandedCloudFileId, setExpandedCloudFileId] = useState<string | null>(null);
  const [showFileSwitcher, setShowFileSwitcher] = useState(false);
  const [pendingSwitchFileKey, setPendingSwitchFileKey] = useState("");
  const [showCreateFilePage, setShowCreateFilePage] = useState(false);
  const [newCloudFileDraft, setNewCloudFileDraft] = useState<NewCloudFileDraft>(() =>
    makeNewCloudFileDraft(defaultAppData),
  );
  const [shareEditorUids, setShareEditorUids] = useState<string[]>([]);
  const [selectedShareFriendUid, setSelectedShareFriendUid] = useState("");
  const [tabShowcaseSelections, setTabShowcaseSelections] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        tabShowcaseSamples.map((sample) => [sample.id, sample.items[0] ?? ""]),
      ),
  );
  const [cloudFileDrafts, setCloudFileDrafts] = useState<
    Record<
      string,
      { rosterName: string; gradeLabel: string; academicTerm: string; testDate: string }
    >
  >({});
  const [draftRecord, setDraftRecord] = useState<FitnessRecord>(
    data.records[0] ?? makeEmptyRecord(data.testDate),
  );
  const [message, setMessage] = useState("前端已啟動。");
  const [loadCheckpoints, setLoadCheckpoints] = useState<Record<
    LoadCheckpointKey,
    LoadCheckpointState
  >>(() => makeDefaultLoadCheckpoints());
  const [frontendIssues, setFrontendIssues] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [activeMetric, setActiveMetric] = useState<FitnessField>("item1");
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [tableSortKey, setTableSortKey] = useState<TableSortKey>("seat");
  const [showTableFilters, setShowTableFilters] = useState(false);
  const [selectedTableGrades, setSelectedTableGrades] = useState<StudentGradeLabel[]>(
    TABLE_GRADE_CHECKBOX_OPTIONS,
  );
  const [firebaseStatus, setFirebaseStatus] = useState("尚未測試 Firebase 連線。");
  const [rosterDraft, setRosterDraft] = useState<RosterEntry[]>(() =>
    data.rosterEntries.length ? data.rosterEntries : [makeEmptyRosterEntry()],
  );
  const [rosterActiveCell, setRosterActiveCell] = useState<{
    rowIndex: number;
    columnIndex: number;
  } | null>(null);
  const [rosterSizeInput, setRosterSizeInput] = useState(() =>
    String(data.rosterEntries.length || 1),
  );
  const [tableZoomMode, setTableZoomMode] = useState<SheetZoomMode>("fit");
  const rosterZoomMode: SheetZoomMode = 1;
  const metricZoomMode: SheetZoomMode = 1.1;
  const [rosterViewportWidth, setRosterViewportWidth] = useState(0);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const [metricViewportWidth, setMetricViewportWidth] = useState(0);
  const [rosterNaturalWidth, setRosterNaturalWidth] = useState(640);
  const [tableNaturalWidth, setTableNaturalWidth] = useState(1120);
  const [metricNaturalWidth, setMetricNaturalWidth] = useState(520);
  const [debugSettings, setDebugSettings] = useState<DebugSettings>(() =>
    loadDebugSettings(),
  );
  const reportDebugFileLoadedRef = useRef<string | null>(null);
  const autoOpenedLastCloudFileRef = useRef<string | null>(null);
  const activeAuthUidRef = useRef<string | null>(null);
  const shareRepairSignatureRef = useRef<string | null>(null);
  const rosterViewportRef = useRef<HTMLDivElement | null>(null);
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const metricViewportRef = useRef<HTMLDivElement | null>(null);
  const rosterTableRef = useRef<HTMLTableElement | null>(null);
  const tableTableRef = useRef<HTMLTableElement | null>(null);
  const metricTableRef = useRef<HTMLTableElement | null>(null);
  const previousRosterScaleRef = useRef(1);
  const previousTableScaleRef = useRef(1);
  const previousMetricScaleRef = useRef(1);
  const skipNextCloudDirtyRef = useRef(false);

  const updateLoadCheckpoint = (
    key: LoadCheckpointKey,
    status: LoadCheckpointState["status"],
    detail: string,
  ) => {
    setLoadCheckpoints((current) => ({
      ...current,
      [key]: {
        ...current[key],
        status,
        detail,
      },
    }));
  };

  const pushFrontendIssue = (issue: string) => {
    setFrontendIssues((current) => (current.includes(issue) ? current : [...current, issue]));
  };

  const pushFriendInviteTrace = (
    status: FriendInviteTraceEntry["status"],
    detail: string,
  ) => {
    const nextEntry: FriendInviteTraceEntry = {
      timestamp: new Date().toISOString(),
      status,
      detail,
    };
    setFriendInviteTraceEntries((current) => {
      const nextEntries = [nextEntry, ...current].slice(0, 5);
      saveFriendInviteTrace(nextEntries);
      return nextEntries;
    });
  };

  function resetCloudSessionState(nextData: AppData = defaultAppData): void {
    recordDiagnosticEvent("cloud.session-reset", "已重置目前雲端檔案 session 狀態。", {
      recordCount: nextData.records.length,
      rosterCount: nextData.rosterEntries.length,
      rosterName: nextData.rosterName,
    });
    reportDebugFileLoadedRef.current = null;
    autoOpenedLastCloudFileRef.current = null;
    shareRepairSignatureRef.current = null;
    skipNextCloudDirtyRef.current = true;
    setData(nextData);
    setCloudFiles([]);
    setCloudFileDrafts({});
    setCurrentCloudFileId(null);
    setCurrentCloudFileOwnerUid(null);
    setExpandedCloudFileId(null);
    setShowFileSwitcher(false);
    setPendingSwitchFileKey("");
    setShowCreateFilePage(false);
    setIsCloudDirty(false);
    setShareEditorUids([]);
    setSelectedShareFriendUid("");
    setSelectedId(nextData.records[0]?.id ?? "");
    setDraftRecord(nextData.records[0] ?? makeEmptyRecord(nextData.testDate));
    setRosterDraft(
      nextData.rosterEntries.length ? nextData.rosterEntries : [makeEmptyRosterEntry()],
    );
    setRosterSizeInput(String(nextData.rosterEntries.length || 1));
  }

  async function writeAppSystemLog(
    entry: Omit<SystemLogEntry, "actorUid" | "actorUsername" | "actorDisplayName"> & {
      actorUid?: string | null;
      actorUsername?: string | null;
      actorDisplayName?: string | null;
    },
  ): Promise<void> {
    await writeSystemLog({
      actorUid: entry.actorUid ?? currentUser?.uid ?? null,
      actorUsername: entry.actorUsername ?? currentUsername ?? null,
      actorDisplayName: entry.actorDisplayName ?? currentProfile?.displayNickname ?? null,
      ...entry,
    });
  }

  useEffect(() => {
    recordDiagnosticEvent("app.start", "前端 App 已啟動。", {
      environment: getDiagnosticEnvironment(),
    });
    return installDiagnosticErrorListeners();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let lastLoggedAt = 0;
    const handleResize = () => {
      const now = Date.now();
      if (now - lastLoggedAt < 1000) {
        return;
      }

      lastLoggedAt = now;
      recordDiagnosticEvent("environment.resize", "瀏覽器版面大小改變。", {
        environment: getDiagnosticEnvironment(),
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  useEffect(() => {
    updateLoadCheckpoint("auth", "loading", "正在確認目前是否已登入。");

    const unsubscribe = subscribeToAuthState((user) => {
      const nextUid = user?.uid ?? null;
      if (activeAuthUidRef.current !== nextUid) {
        recordDiagnosticEvent("auth.uid-changed", "登入使用者 uid 已改變，重置目前檔案狀態。", {
          previousUid: activeAuthUidRef.current,
          nextUid,
          nextUsername: user ? emailToUsername(user.email) || user.displayName || null : null,
        });
        activeAuthUidRef.current = nextUid;
        resetCloudSessionState();
      }

      if (user) {
        recordDiagnosticEvent("auth.signed-in", "Firebase 回報目前已登入。", {
          uid: user.uid,
          email: user.email,
          username: emailToUsername(user.email),
          displayName: user.displayName,
        });
        void ensureUserProfile(user);
        setActiveTab((current) =>
          isReportDebugMode ? "pdf" : current === "account" ? "files" : current,
        );
        updateLoadCheckpoint(
          "auth",
          "success",
          `已登入 ${emailToUsername(user.email) || user.displayName || "使用者"}，正在載入雲端資料。`,
        );
        updateLoadCheckpoint("profile", "loading", "正在載入使用者基本資料。");
        updateLoadCheckpoint("friends", "loading", "正在載入好友列表。");
        updateLoadCheckpoint("friendRequests", "loading", "正在載入好友邀請。");
        updateLoadCheckpoint("cloudFiles", "loading", "正在載入雲端檔案與共享檔案。");
        updateLoadCheckpoint("abilityRules", "loading", "正在載入能力值對應表。");
        updateLoadCheckpoint("restoreFile", "loading", "正在判斷要恢復哪一份檔案。");
      } else {
        setLoadCheckpoints((current) => ({
          ...current,
          auth: {
            ...current.auth,
            status: "success",
            detail: "目前尚未登入，可以先進入帳號管理。",
          },
          profile: {
            ...current.profile,
            status: "waiting",
            detail: "登入後才會載入使用者基本資料。",
          },
          friends: {
            ...current.friends,
            status: "waiting",
            detail: "登入後才會載入好友列表。",
          },
          friendRequests: {
            ...current.friendRequests,
            status: "waiting",
            detail: "登入後才會載入好友邀請。",
          },
          cloudFiles: {
            ...current.cloudFiles,
            status: "waiting",
            detail: "登入後才會載入你的檔案與共享檔案。",
          },
          abilityRules: {
            ...current.abilityRules,
            status: "waiting",
            detail: "登入後才會載入能力值對應表。",
          },
          restoreFile: {
            ...current.restoreFile,
            status: "waiting",
            detail: "登入後才會嘗試恢復上次使用的檔案。",
          },
        }));
        recordDiagnosticEvent("auth.signed-out", "Firebase 回報目前未登入。");
      }
      setCurrentUser(user);
      setAuthReady(true);
      setShowAccountMenu(false);
    });

    return unsubscribe;
  }, [isReportDebugMode]);

  useEffect(() => {
    if (!currentUser) {
      setCurrentProfile(null);
      setNicknameDraft("");
      setFriendNicknameDrafts({});
      setFriendDraft("");
      setFriends([]);
      setIncomingFriendRequests([]);
      setOutgoingFriendRequests([]);
      setAbilityRulesConfig(defaultAbilityRulesConfig);
      setFrontendIssues([]);
      return;
    }

    let incomingLoaded = false;
    let outgoingLoaded = false;
    let filesLoaded = false;

    const markFriendRequestsLoaded = () => {
      if (incomingLoaded && outgoingLoaded) {
        updateLoadCheckpoint("friendRequests", "success", "好友邀請資料已載入。");
      }
    };

    const unsubscribeFriends = subscribeToFriends(currentUser.uid, (nextFriends) => {
      setFriends(nextFriends);
      updateLoadCheckpoint("friends", "success", `好友列表已載入，共 ${nextFriends.length} 位好友。`);
    });
    const unsubscribeProfile = subscribeToUserProfile(currentUser.uid, (profile) => {
      setCurrentProfile(profile);
      setNicknameDraft(profile?.displayNickname ?? "");
      updateLoadCheckpoint("profile", "success", "使用者基本資料已載入。");
    });
    const unsubscribeIncoming = subscribeToIncomingFriendRequests(
      currentUser.uid,
      (requests) => {
        setIncomingFriendRequests(requests);
        incomingLoaded = true;
        markFriendRequestsLoaded();
      },
    );
    const unsubscribeOutgoing = subscribeToOutgoingFriendRequests(
      currentUser.uid,
      (requests) => {
        setOutgoingFriendRequests(requests);
        outgoingLoaded = true;
        markFriendRequestsLoaded();
      },
    );
    const unsubscribeCloudFiles = subscribeToCloudFiles(
      currentUser.uid,
      (files) => {
        setCloudFiles(files);
        if (!filesLoaded) {
          filesLoaded = true;
          updateLoadCheckpoint("cloudFiles", "success", `雲端檔案列表已載入，共 ${files.length} 份檔案。`);
        } else {
          updateLoadCheckpoint("cloudFiles", "success", `雲端檔案列表已更新，共 ${files.length} 份檔案。`);
        }
      },
      (error) => {
        const nextMessage =
          error instanceof Error ? error.message : "無法載入雲端檔案列表。";
        setMessage(`雲端檔案列表載入失敗：${nextMessage}`);
        updateLoadCheckpoint("cloudFiles", "error", nextMessage);
        pushFrontendIssue(`雲端檔案列表載入失敗：${nextMessage}`);
      },
    );
    const unsubscribeAbilityRules = subscribeToAbilityRulesConfig(
      currentUser.uid,
      (config) => {
        setAbilityRulesConfig(config);
        updateLoadCheckpoint("abilityRules", "success", "能力值對應表已載入。");
      },
      (error) => {
        const nextMessage =
          error instanceof Error ? error.message : "無法訂閱能力值對應表。";
        setMessage(`能力值對應表載入失敗：${nextMessage}`);
        updateLoadCheckpoint("abilityRules", "error", nextMessage);
        pushFrontendIssue(`能力值對應表載入失敗：${nextMessage}`);
      },
    );

    void ensureAbilityRulesConfig(currentUser.uid).catch((error) => {
      const nextMessage =
        error instanceof Error ? error.message : "無法載入能力值對應表。";
      setMessage(`能力值對應表載入失敗：${nextMessage}`);
      updateLoadCheckpoint("abilityRules", "error", nextMessage);
      pushFrontendIssue(`能力值對應表載入失敗：${nextMessage}`);
    });

    return () => {
      unsubscribeFriends();
      unsubscribeProfile();
      unsubscribeIncoming();
      unsubscribeOutgoing();
      unsubscribeCloudFiles();
      unsubscribeAbilityRules();
    };
  }, [currentUser]);

  useEffect(() => {
    setFriendNicknameDrafts((current) => {
      const next: Record<string, string> = {};
      friends.forEach((friend) => {
        next[friend.friendUid] = current[friend.friendUid] ?? friend.customNickname ?? "";
      });
      return next;
    });
  }, [friends]);

  useEffect(() => {
    if (
      !isReportDebugMode ||
      !reportDebugParams.fileId ||
      !currentUser ||
      reportDebugFileLoadedRef.current === reportDebugParams.fileId
    ) {
      return;
    }

    void loadCloudFile(currentUser.uid, reportDebugParams.fileId)
      .then((nextData) => {
        reportDebugFileLoadedRef.current = reportDebugParams.fileId;
        skipNextCloudDirtyRef.current = true;
        setData(nextData);
        setCurrentCloudFileId(reportDebugParams.fileId);
        setCurrentCloudFileOwnerUid(currentUser.uid);
        setIsCloudDirty(false);
        setShareEditorUids([]);
        setSelectedId(nextData.records[0]?.id ?? "");
        setDraftRecord(nextData.records[0] ?? makeEmptyRecord(nextData.testDate));
        setRosterDraft(
          nextData.rosterEntries.length
            ? nextData.rosterEntries
            : [makeEmptyRosterEntry()],
        );
        setRosterSizeInput(String(nextData.rosterEntries.length || 1));
        setMessage(`已載入除錯報表檔案：${reportDebugParams.fileId}`);
      })
      .catch((error) => {
        const nextMessage =
          error instanceof Error ? error.message : "無法載入除錯報表檔案。";
        setMessage(`除錯報表載入失敗：${nextMessage}`);
      });
  }, [currentUser, isReportDebugMode, reportDebugParams.fileId]);

  useEffect(() => {
    setCloudFileDrafts((current) => {
      const next = { ...current };

      for (const file of cloudFiles) {
        next[file.id] = {
          rosterName: current[file.id]?.rosterName ?? file.rosterName,
          gradeLabel: current[file.id]?.gradeLabel ?? file.gradeLabel,
          academicTerm: current[file.id]?.academicTerm ?? file.academicTerm,
          testDate: current[file.id]?.testDate ?? file.testDate,
        };
      }

      for (const key of Object.keys(next)) {
        if (!cloudFiles.some((file) => file.id === key)) {
          delete next[key];
        }
      }

      return next;
    });
  }, [cloudFiles]);

  const sortedCloudFiles = useMemo(() => {
    const nextFiles = [...cloudFiles];

    nextFiles.sort((left, right) => {
      switch (fileSortKey) {
        case "created-desc":
          return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
        case "updated-desc":
          return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
        case "name-asc":
          return left.fileName.localeCompare(right.fileName, "zh-Hant");
        case "roster-asc":
          return left.rosterName.localeCompare(right.rosterName, "zh-Hant");
        case "grade-asc":
          return left.gradeLabel.localeCompare(right.gradeLabel, "zh-Hant");
        default:
          return 0;
      }
    });

    return nextFiles;
  }, [cloudFiles, fileSortKey]);

  useEffect(() => {
    if (!currentUser || isReportDebugMode || currentCloudFileId || cloudFiles.length === 0) {
      return;
    }

    const lastSelection = readLastCloudFileSelection(currentUser.uid);
    const lastFileKey = lastSelection
      ? `${lastSelection.ownerUid}:${lastSelection.fileId}`
      : null;
    if (lastFileKey && autoOpenedLastCloudFileRef.current === lastFileKey) {
      return;
    }

    const newestFile = [...cloudFiles].sort((left, right) =>
      (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
    )[0];
    const targetFile = lastSelection
      ? cloudFiles.find(
          (file) =>
            file.id === lastSelection.fileId &&
            file.ownerUid === lastSelection.ownerUid,
        ) ?? newestFile
      : newestFile;

    if (!targetFile) {
      if (lastSelection) {
        writeLastCloudFileSelection(currentUser.uid, null);
        autoOpenedLastCloudFileRef.current = lastFileKey;
        recordDiagnosticEvent("cloud.auto-restore-missing", "找不到上次使用的檔案，已清除本機記憶。", {
          uid: currentUser.uid,
          lastSelection,
        });
      }
      return;
    }

    if (
      lastSelection &&
      !cloudFiles.some(
        (file) =>
          file.id === lastSelection.fileId &&
          file.ownerUid === lastSelection.ownerUid,
      )
    ) {
      writeLastCloudFileSelection(currentUser.uid, null);
    }

    autoOpenedLastCloudFileRef.current = `${targetFile.ownerUid}:${targetFile.id}`;
    updateLoadCheckpoint("restoreFile", "loading", `正在開啟檔案：${targetFile.fileName}`);
    recordDiagnosticEvent("cloud.auto-restore-started", "開始自動開啟檔案。", {
      uid: currentUser.uid,
      targetFileId: targetFile.id,
      targetOwnerUid: targetFile.ownerUid,
      targetFileName: targetFile.fileName,
      lastSelection,
      cloudFileCount: cloudFiles.length,
    });
    void loadCloudFile(targetFile.ownerUid, targetFile.id)
      .then((nextData) => {
        skipNextCloudDirtyRef.current = true;
        setData(nextData);
        setCurrentCloudFileId(targetFile.id);
        setCurrentCloudFileOwnerUid(targetFile.ownerUid);
        setIsCloudDirty(false);
        setSelectedId(nextData.records[0]?.id ?? "");
        setDraftRecord(nextData.records[0] ?? makeEmptyRecord(nextData.testDate));
        setRosterDraft(
          nextData.rosterEntries.length
            ? nextData.rosterEntries
            : [makeEmptyRosterEntry()],
        );
        setRosterSizeInput(String(nextData.rosterEntries.length || 1));
        setExpandedCloudFileId(targetFile.id);
        void getCloudFileEditorUids(targetFile.ownerUid, targetFile.id).then(
          setShareEditorUids,
        );
        setMessage(
          lastSelection &&
          targetFile.id === lastSelection.fileId &&
          targetFile.ownerUid === lastSelection.ownerUid
            ? `已自動開啟上次使用的檔案：${targetFile.fileName}`
            : `已自動開啟最新建立的檔案：${targetFile.fileName}`,
        );
        updateLoadCheckpoint("restoreFile", "success", `已開啟檔案：${targetFile.fileName}`);
        recordDiagnosticEvent("cloud.auto-restore-completed", "自動開啟檔案完成。", {
          uid: currentUser.uid,
          targetFileId: targetFile.id,
          targetOwnerUid: targetFile.ownerUid,
          targetFileName: targetFile.fileName,
          recordCount: nextData.records.length,
          rosterCount: nextData.rosterEntries.length,
          rosterName: nextData.rosterName,
        });
      })
      .catch((error) => {
        const nextMessage =
          error instanceof Error ? error.message : "無法開啟上次使用的檔案。";
        setMessage(`自動開啟檔案失敗：${nextMessage}`);
        updateLoadCheckpoint("restoreFile", "error", nextMessage);
        pushFrontendIssue(`自動開啟檔案失敗：${nextMessage}`);
        recordDiagnosticEvent("cloud.auto-restore-failed", "自動開啟檔案失敗。", {
          uid: currentUser.uid,
          targetFileId: targetFile.id,
          targetOwnerUid: targetFile.ownerUid,
          targetFileName: targetFile.fileName,
          error: nextMessage,
        });
      });
  }, [cloudFiles, currentCloudFileId, currentUser, isReportDebugMode]);

  useEffect(() => {
    if (!currentUser && authReady) {
      updateLoadCheckpoint("restoreFile", "waiting", "登入後才會嘗試恢復上次使用的檔案。");
      return;
    }

    if (currentUser && authReady && cloudFiles.length === 0 && !currentCloudFileId) {
      updateLoadCheckpoint("restoreFile", "success", "目前沒有可自動開啟的檔案。");
    }
  }, [authReady, cloudFiles.length, currentCloudFileId, currentUser]);

  useEffect(() => {
    if (!currentCloudFileId) {
      return;
    }

    if (skipNextCloudDirtyRef.current) {
      skipNextCloudDirtyRef.current = false;
      return;
    }

    setIsCloudDirty(true);
  }, [currentCloudFileId, data]);

  useEffect(() => {
    const shareTarget = cloudFiles.find(
      (file) =>
        file.id === currentCloudFileId &&
        file.ownerUid === currentCloudFileOwnerUid &&
        file.ownerUid === currentUser?.uid &&
        file.accessRole === "owner",
    );

    if (!currentUser || !shareTarget) {
      setShareEditorUids([]);
      return;
    }

    if (shareTarget.sharedEditorUids?.length) {
      setShareEditorUids(shareTarget.sharedEditorUids);
      return;
    }

    void getCloudFileEditorUids(shareTarget.ownerUid, shareTarget.id).then(setShareEditorUids);
  }, [cloudFiles, currentCloudFileId, currentCloudFileOwnerUid, currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    if (!currentCloudFileId || !currentCloudFileOwnerUid) {
      return;
    }

    writeLastCloudFileSelection(currentUser.uid, {
      fileId: currentCloudFileId,
      ownerUid: currentCloudFileOwnerUid,
    });
  }, [currentCloudFileId, currentCloudFileOwnerUid, currentUser]);

  useEffect(() => {
    if (!showFileSwitcher) {
      return;
    }

    if (currentCloudFileId && currentCloudFileOwnerUid) {
      setPendingSwitchFileKey(`${currentCloudFileOwnerUid}:${currentCloudFileId}`);
      return;
    }

    if (sortedCloudFiles.length > 0) {
      setPendingSwitchFileKey(`${sortedCloudFiles[0].ownerUid}:${sortedCloudFiles[0].id}`);
    }
  }, [currentCloudFileId, currentCloudFileOwnerUid, showFileSwitcher, sortedCloudFiles]);

  useEffect(() => {
    if (!showCreateFilePage) {
      return;
    }

    setNewCloudFileDraft(makeNewCloudFileDraft(data));
  }, [data, showCreateFilePage]);

  useEffect(() => {
    setRosterDraft(data.rosterEntries.length ? data.rosterEntries : [makeEmptyRosterEntry()]);
  }, [data.rosterEntries]);

  useEffect(() => {
    setRosterSizeInput(String(Math.max(rosterDraft.length, 1)));
  }, [rosterDraft.length]);

  useEffect(() => {
    const reloadDebugSettings = () => {
      setDebugSettings(loadDebugSettings());
    };

    window.addEventListener("focus", reloadDebugSettings);
    window.addEventListener("storage", reloadDebugSettings);

    return () => {
      window.removeEventListener("focus", reloadDebugSettings);
      window.removeEventListener("storage", reloadDebugSettings);
    };
  }, []);

  const selectedRecord = useMemo(
    () => data.records.find((record) => record.id === selectedId) ?? null,
    [data.records, selectedId],
  );
  const normalizedRosterDraft = useMemo(
    () => normalizeRosterEntriesForFile(rosterDraft, data.gradeLabel),
    [data.gradeLabel, rosterDraft],
  );
  const normalizedSavedRosterEntries = useMemo(
    () => normalizeRosterEntriesForFile(data.rosterEntries, data.gradeLabel),
    [data.gradeLabel, data.rosterEntries],
  );
  const hasRosterDraftChanges = useMemo(
    () =>
      JSON.stringify(normalizedRosterDraft) !==
      JSON.stringify(normalizedSavedRosterEntries),
    [normalizedRosterDraft, normalizedSavedRosterEntries],
  );
  function getRecordGradeLabel(record: FitnessRecord | null): string {
    if (!record) {
      return data.gradeLabel;
    }

    return resolveStudentGradeLabel(data.gradeLabel, record.studentGradeLabel);
  }

  function getProfileForGradeLabel(gradeLabel: string) {
    return findAbilityGradeProfile(abilityRulesConfig, gradeLabel);
  }

  function getProfileForRecord(record: FitnessRecord | null) {
    return getProfileForGradeLabel(getRecordGradeLabel(record));
  }

  const currentAbilityProfile = useMemo(
    () => getProfileForRecord(selectedRecord),
    [abilityRulesConfig, data.gradeLabel, selectedRecord],
  );
  const resolvedItemLabels = useMemo(() => {
    if (!isMixedAgeClass(data.gradeLabel)) {
      return scoreFields.map(
        (field, index) =>
          getAbilityRuleForField(currentAbilityProfile, field)?.metricLabel ??
          data.itemLabels[index] ??
          field,
      );
    }

    const juniorRules = abilityRulesByGradeGroup.junior;
    const middleSeniorRules = abilityRulesByGradeGroup.middleSenior;

    return scoreFields.map((field, index) => {
      const juniorLabel = juniorRules[field]?.metricLabel;
      const middleSeniorLabel = middleSeniorRules[field]?.metricLabel;
      if (
        juniorLabel &&
        middleSeniorLabel &&
        juniorLabel !== middleSeniorLabel
      ) {
        return `${middleSeniorLabel} / ${juniorLabel}`;
      }

      return middleSeniorLabel ?? juniorLabel ?? data.itemLabels[index] ?? field;
    });
  }, [currentAbilityProfile, data.gradeLabel, data.itemLabels]);
  const selectedRecordItemLabels = useMemo(
    () =>
      scoreFields.map(
        (field, index) =>
          getAbilityRuleForField(currentAbilityProfile, field)?.metricLabel ??
          data.itemLabels[index] ??
          field,
      ),
    [currentAbilityProfile, data.itemLabels],
  );
  const selectedAbilityScores = useMemo(
    () => getAbilityScores(selectedRecord, currentAbilityProfile),
    [currentAbilityProfile, selectedRecord],
  );
  const selectedAbilityLevelLabels = useMemo(
    () =>
      selectedAbilityScores.map((score) =>
        getAbilityBandLabel(score, abilityRulesConfig),
      ),
    [abilityRulesConfig, selectedAbilityScores],
  );
  const selectedSeatNumber = useMemo(() => {
    const index = data.records.findIndex((record) => record.id === selectedId);
    return index >= 0 ? index + 1 : null;
  }, [data.records, selectedId]);
  const pdfCanvasRef = useRef<A4CanvasBoardHandle | null>(null);

  useEffect(() => {
    if (!isReportDebugMode || data.records.length === 0) {
      return;
    }

    const nextRecord =
      (reportDebugParams.recordId
        ? data.records.find((record) => record.id === reportDebugParams.recordId) ?? null
        : null) ??
      (reportDebugParams.seat
        ? data.records[reportDebugParams.seat - 1] ?? null
        : null) ??
      data.records[0] ??
      null;
    if (!nextRecord || nextRecord.id === selectedId) {
      return;
    }

    setSelectedId(nextRecord.id);
  }, [
    data.records,
    isReportDebugMode,
    reportDebugParams.recordId,
    reportDebugParams.seat,
    selectedId,
  ]);

  useEffect(() => {
    if (selectedRecord) {
      setDraftRecord(selectedRecord);
    }
  }, [selectedRecord]);

  const tableRecords = useMemo(() => {
    let nextRecords = showIncompleteOnly
      ? data.records.filter((record) => hasIncompleteScore(record))
      : data.records;

    if (
      isMixedAgeClass(data.gradeLabel) &&
      selectedTableGrades.length > 0 &&
      selectedTableGrades.length < TABLE_GRADE_CHECKBOX_OPTIONS.length
    ) {
      nextRecords = nextRecords.filter((record) => {
        const gradeLabel = resolveStudentGradeLabel(
          data.gradeLabel,
          record.studentGradeLabel,
        );
        return selectedTableGrades.includes(gradeLabel);
      });
    }

    if (tableSortKey === "seat") {
      return nextRecords;
    }

    const sortedRecords = [...nextRecords].sort((left, right) => {
      const leftGradeRank = getStudentGradeRank(
        resolveStudentGradeLabel(data.gradeLabel, left.studentGradeLabel),
      );
      const rightGradeRank = getStudentGradeRank(
        resolveStudentGradeLabel(data.gradeLabel, right.studentGradeLabel),
      );

      if (leftGradeRank !== rightGradeRank) {
        return tableSortKey === "grade-desc"
          ? rightGradeRank - leftGradeRank
          : leftGradeRank - rightGradeRank;
      }

      return data.records.findIndex((record) => record.id === left.id) -
        data.records.findIndex((record) => record.id === right.id);
    });

    return sortedRecords;
  }, [data.gradeLabel, data.records, selectedTableGrades, showIncompleteOnly, tableSortKey]);

  const activeMetricIndex = scoreFields.indexOf(activeMetric);
  const activeMetricLabel = resolvedItemLabels[activeMetricIndex] ?? activeMetric;
  const currentUsername =
    currentProfile?.username ||
    currentUser?.displayName ||
    emailToUsername(currentUser?.email) ||
    "未登入";
  const currentDisplayName =
    currentProfile?.displayNickname?.trim() || currentUsername;

  function pushFileOpenTrace(status: FileOpenTraceEntry["status"], detail: string) {
    const entry: FileOpenTraceEntry = {
      timestamp: new Date().toISOString(),
      status,
      detail,
    };
    setFileOpenTraceEntries((current) => {
      const next = [entry, ...current].slice(0, 10);
      saveFileOpenTrace(next);
      return next;
    });
  }

  function getFriendDisplayName(friend: FriendRecord) {
    return (
      friend.customNickname?.trim() ||
      friend.profileNickname?.trim() ||
      friend.username
    );
  }

  function getIncomingRequestDisplayName(request: FriendRequestRecord) {
    const matchedFriend = friends.find((friend) => friend.friendUid === request.fromUid);
    if (matchedFriend) {
      return getFriendDisplayName(matchedFriend);
    }
    return request.fromDisplayName || request.fromUsername;
  }
  const currentCloudFileSummary = useMemo(
    () =>
      cloudFiles.find(
        (file) =>
          file.id === currentCloudFileId &&
          file.ownerUid === currentCloudFileOwnerUid,
      ) ?? null,
    [cloudFiles, currentCloudFileId, currentCloudFileOwnerUid],
  );
  const currentCloudFileKey = currentCloudFileSummary
    ? `${currentCloudFileSummary.ownerUid}:${currentCloudFileSummary.id}`
    : "";
  const shareTargetFileSummary = useMemo(
    () =>
      currentCloudFileSummary &&
      currentCloudFileSummary.ownerUid === currentUser?.uid &&
      currentCloudFileSummary.accessRole === "owner"
        ? currentCloudFileSummary
        : null,
    [currentCloudFileSummary, currentUser],
  );
  const effectiveSharedEditorUids = useMemo(() => {
    const summaryEditorUids = shareTargetFileSummary?.sharedEditorUids ?? [];
    if (summaryEditorUids.length > 0) {
      return summaryEditorUids;
    }
    return shareEditorUids;
  }, [shareTargetFileSummary, shareEditorUids]);
  const currentCloudFileIsOwner = Boolean(
    currentUser &&
      currentCloudFileOwnerUid &&
      currentUser.uid === currentCloudFileOwnerUid,
  );
  const currentWorkspaceFileLabel = currentCloudFileSummary
    ? `${currentCloudFileSummary.accessRole === "owner" ? "" : "【共享】"}${currentCloudFileSummary.academicTerm}／${currentCloudFileSummary.rosterName}`
    : "尚未開啟檔案";
  useEffect(() => {
    recordDiagnosticEvent("cloud.current-file-state", "目前開啟檔案狀態已更新。", {
      currentUserUid: currentUser?.uid ?? null,
      currentCloudFileId,
      currentCloudFileOwnerUid,
      currentFileName: currentCloudFileSummary?.fileName ?? null,
      currentFileAccessRole: currentCloudFileSummary?.accessRole ?? null,
      cloudFileCount: cloudFiles.length,
    });
  }, [
    cloudFiles.length,
    currentCloudFileId,
    currentCloudFileOwnerUid,
    currentCloudFileSummary,
    currentUser,
  ]);
  const pendingSwitchFile = useMemo(
    () =>
      sortedCloudFiles.find(
        (file) => `${file.ownerUid}:${file.id}` === pendingSwitchFileKey,
      ) ?? null,
    [pendingSwitchFileKey, sortedCloudFiles],
  );
  const shareableFriends = useMemo(
    () => friends.filter((friend) => friend.friendUid !== currentUser?.uid),
    [friends, currentUser],
  );
  const sharedEditorFriends = useMemo(
    () =>
      shareableFriends.filter((friend) =>
        effectiveSharedEditorUids.includes(friend.friendUid),
      ),
    [effectiveSharedEditorUids, shareableFriends],
  );
  const availableShareFriends = useMemo(
    () =>
      shareableFriends.filter(
        (friend) => !effectiveSharedEditorUids.includes(friend.friendUid),
      ),
    [effectiveSharedEditorUids, shareableFriends],
  );
  useEffect(() => {
    if (
      selectedShareFriendUid &&
      !availableShareFriends.some((friend) => friend.friendUid === selectedShareFriendUid)
    ) {
      setSelectedShareFriendUid("");
    }
  }, [availableShareFriends, selectedShareFriendUid]);

  function renderWorkspaceFileCard() {
    return (
      <div className="workspace-file-card">
        <div>
          <strong>目前使用檔案</strong>
          <span>{currentWorkspaceFileLabel}</span>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            void handleTabChange("files");
          }}
          type="button"
        >
          切換檔案
        </button>
      </div>
    );
  }

  function renderNoStudentsCard(pageLabel: string) {
    return (
      <div className="friend-empty-state no-students-card">
        <strong>目前沒有學員</strong>
        <p>
          {pageLabel}目前沒有內容，因為這份檔案還沒有學員。請先到學員名單輸入並儲存學員資料。
        </p>
        <div className="button-row">
          <button
            className="primary-button"
            onClick={() => {
              void handleTabChange("roster");
            }}
            type="button"
          >
            前往學員名單
          </button>
        </div>
      </div>
    );
  }

  function renderIncomingFriendAlertCard() {
    if (!currentUser || incomingFriendRequests.length === 0) {
      return null;
    }

    return (
      <section className="friend-alert-card">
        <div className="friend-alert-card-head">
          <strong>有人送出好友邀請</strong>
          <span>{incomingFriendRequests.length} 筆待處理</span>
        </div>
        <div className="friend-alert-list">
          {incomingFriendRequests.map((request) => (
            <div className="friend-alert-item" key={request.id}>
              <div className="friend-alert-copy">
                <strong>{getIncomingRequestDisplayName(request)}</strong>
                <small>送出時間 {formatActivityDate(request.createdAt)}</small>
              </div>
              <div className="friend-row-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    void handleAcceptFriendRequest(request);
                  }}
                  type="button"
                >
                  同意
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    void handleRejectFriendRequest(request);
                  }}
                  type="button"
                >
                  拒絕
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function toggleFriendDetails(friendUid: string): void {
    setExpandedFriendUids((current) =>
      current.includes(friendUid)
        ? current.filter((item) => item !== friendUid)
        : [...current, friendUid],
    );
  }

  useEffect(() => {
    if (
      !currentUser ||
      !currentProfile ||
      !shareTargetFileSummary ||
      shareTargetFileSummary.ownerUid !== currentUser.uid
    ) {
      shareRepairSignatureRef.current = null;
      return;
    }

    if (effectiveSharedEditorUids.length === 0) {
      shareRepairSignatureRef.current = null;
      return;
    }

    const activeTargets = shareableFriends
      .filter((friend) => effectiveSharedEditorUids.includes(friend.friendUid))
      .map((friend) => ({
        uid: friend.friendUid,
        username: friend.username,
        displayName: friend.profileNickname,
      }));

    if (
      effectiveSharedEditorUids.length > 0 &&
      activeTargets.length !== effectiveSharedEditorUids.length
    ) {
      return;
    }

    const signature = JSON.stringify({
      fileId: shareTargetFileSummary.id,
      ownerUid: currentUser.uid,
      editorUids: [...effectiveSharedEditorUids].sort(),
      targetUids: activeTargets.map((target) => target.uid).sort(),
    });

    if (shareRepairSignatureRef.current === signature) {
      return;
    }

    shareRepairSignatureRef.current = signature;

    void setCloudFileEditors({
      ownerUid: currentUser.uid,
      ownerUsername: currentUsername,
      ownerDisplayName: currentProfile.displayNickname ?? null,
      file: shareTargetFileSummary,
      previousEditorUids: effectiveSharedEditorUids,
      editorTargets: activeTargets,
    }).catch((error) => {
      const nextMessage =
        error instanceof Error ? error.message : "無法修復共同編輯分享資料。";
      setMessage(`共同編輯分享資料修復失敗：${nextMessage}`);
      shareRepairSignatureRef.current = null;
    });
  }, [
    currentProfile,
    currentUser,
    currentUsername,
    effectiveSharedEditorUids,
    shareableFriends,
    shareTargetFileSummary,
  ]);
  const isFriendInvitePage = Boolean(inviteIdFromUrl);
  const currentEditableRecords = useMemo(() => {
    if (activeTab === "files") {
      return data.records;
    }

    if (activeTab === "table") {
      return tableRecords;
    }

    if (activeTab === "metric") {
      return data.records;
    }

    return data.records;
  }, [activeTab, data.records, tableRecords]);

  useEffect(() => {
    const nextViewport = rosterViewportRef.current;
    const nextTable = rosterTableRef.current;
    if (!nextViewport || !nextTable) {
      return;
    }

    const measureRosterWidth = () => {
      setRosterViewportWidth(nextViewport.clientWidth);
      setRosterNaturalWidth(nextTable.offsetWidth);
    };

    const resizeObserver = new ResizeObserver(() => {
      measureRosterWidth();
    });
    resizeObserver.observe(nextViewport);
    resizeObserver.observe(nextTable);
    measureRosterWidth();

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeTab, rosterDraft, rosterZoomMode]);

  useEffect(() => {
    const nextViewport = tableViewportRef.current;
    const nextTable = tableTableRef.current;
    if (!nextViewport || !nextTable) {
      return;
    }

    const measureTableWidth = () => {
      setTableViewportWidth(nextViewport.clientWidth);
      setTableNaturalWidth(nextTable.offsetWidth);
    };

    const resizeObserver = new ResizeObserver(() => {
      measureTableWidth();
    });
    resizeObserver.observe(nextViewport);
    resizeObserver.observe(nextTable);
    measureTableWidth();

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeTab, tableRecords, tableZoomMode, data.itemLabels]);

  useEffect(() => {
    const nextViewport = metricViewportRef.current;
    const nextTable = metricTableRef.current;
    if (!nextViewport || !nextTable) {
      return;
    }

    const measureMetricWidth = () => {
      setMetricViewportWidth(nextViewport.clientWidth);
      setMetricNaturalWidth(nextTable.offsetWidth);
    };

    const resizeObserver = new ResizeObserver(() => {
      measureMetricWidth();
    });
    resizeObserver.observe(nextViewport);
    resizeObserver.observe(nextTable);
    measureMetricWidth();

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeTab, data.records, activeMetric, metricZoomMode, activeMetricLabel]);

  function selectRecord(record: FitnessRecord): void {
    setSelectedId(record.id);
    setDraftRecord(record);
  }

  function updateDraftField(
    field: keyof FitnessRecord,
    value: string | number,
  ): void {
    setDraftRecord((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function saveDraft(): void {
    if (!draftRecord.studentName.trim()) {
      setMessage("請先輸入學生姓名。");
      return;
    }

    const normalized = {
      ...draftRecord,
      studentName: draftRecord.studentName.trim(),
      testDate: data.testDate,
    };

    const nextRecords = upsertRecord(data.records, normalized);
    setData((current) => ({ ...current, records: nextRecords }));
    setSelectedId(normalized.id);
    setDraftRecord(normalized);
    setActiveTab("table");
    setMessage("資料已儲存。");
  }

  function deleteSelected(): void {
    if (!selectedRecord) {
      setMessage("目前沒有可刪除的資料。");
      return;
    }

    const nextRecords = data.records.filter(
      (record) => record.id !== selectedRecord.id,
    );
    setData((current) => ({ ...current, records: nextRecords }));
    setSelectedId(nextRecords[0]?.id ?? "");
    setDraftRecord(nextRecords[0] ?? makeEmptyRecord(data.testDate));
    setMessage("資料已刪除。");
  }

  function addTableRow(): void {
    const nextRecord = makeEmptyRecord(data.testDate);
    setData((current) => ({
      ...current,
      records: [nextRecord, ...current.records],
    }));
    setSelectedId(nextRecord.id);
    setDraftRecord(nextRecord);
    setMessage("已新增一筆空白資料。");
  }

  function updateTableField(
    recordId: string,
    field: EditableField,
    value: string,
  ): void {
    setData((current) => ({
      ...current,
      records: current.records.map((record) => {
        if (record.id !== recordId) {
          return record;
        }

        if (scoreFields.includes(field as FitnessField)) {
          return {
            ...record,
            [field]: normalizeNumber(value),
          };
        }

        return {
          ...record,
          [field]: value,
        };
      }),
    }));
  }

  function updateSharedTestDate(nextDate: string): void {
    setData((current) => ({
      ...current,
      testDate: nextDate,
      records: current.records.map((record) => ({
        ...record,
        testDate: nextDate,
      })),
    }));
  }

  function updateRosterName(nextName: string): void {
    setData((current) => ({
      ...current,
      rosterName: nextName,
    }));
  }

  function updateGradeLabel(nextGrade: string): void {
    setData((current) => ({
      ...current,
      gradeLabel: nextGrade,
      rosterEntries: current.rosterEntries.map((entry) => ({
        ...entry,
        studentGradeLabel: resolveStudentGradeLabel(nextGrade, entry.studentGradeLabel),
      })),
      records: current.records.map((record) => ({
        ...record,
        studentGradeLabel: resolveStudentGradeLabel(nextGrade, record.studentGradeLabel),
      })),
    }));
    setRosterDraft((current) =>
      current.map((entry) => ({
        ...entry,
        studentGradeLabel: resolveStudentGradeLabel(nextGrade, entry.studentGradeLabel),
      })),
    );
    setDraftRecord((current) => ({
      ...current,
      studentGradeLabel: resolveStudentGradeLabel(nextGrade, current.studentGradeLabel),
    }));
  }

  function updateAcademicTerm(nextTerm: string): void {
    setData((current) => ({
      ...current,
      academicTerm: nextTerm,
    }));
  }

  function updateAcademicTermPart(
    field: "academicYear" | "semester",
    value: string,
  ): void {
    const currentParts = parseAcademicTermParts(data.academicTerm);
    const nextAcademicYear =
      field === "academicYear" ? value : currentParts.academicYear;
    const nextSemester = field === "semester" ? value : currentParts.semester;
    updateAcademicTerm(buildAcademicTermValue(nextAcademicYear, nextSemester));
  }

  function updateRosterDraftCell(
    rowIndex: number,
    columnIndex: number,
    value: string,
  ): void {
    const rosterFields: Array<keyof Omit<RosterEntry, "id">> = [
      "studentName",
      "height",
      "weight",
      "studentGradeLabel",
    ];
    const targetField = rosterFields[columnIndex];
    if (!targetField) {
      return;
    }

    setRosterDraft((current) =>
      current.map((entry, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? {
              ...entry,
              [targetField]: value,
            }
          : entry,
      ),
    );
  }

  function addRosterRow(): void {
    setRosterDraft((current) => [
      ...current,
      {
        ...makeEmptyRosterEntry(),
        studentGradeLabel: resolveStudentGradeLabel(data.gradeLabel, ""),
      },
    ]);
  }

  function applyRosterSize(nextValue: string = rosterSizeInput): void {
    if (!nextValue.trim()) {
      setRosterSizeInput(String(Math.max(rosterDraft.length, 1)));
      return;
    }

    const nextCount = Math.max(1, Math.floor(Number(nextValue) || 0));
    const currentCount = rosterDraft.length;

    if (nextCount === currentCount) {
      setRosterSizeInput(String(nextCount));
      return;
    }

    if (nextCount > currentCount) {
      const appendedRows = Array.from({ length: nextCount - currentCount }, () => ({
        ...makeEmptyRosterEntry(),
        studentGradeLabel: resolveStudentGradeLabel(data.gradeLabel, ""),
      }));
      setRosterDraft((current) => [...current, ...appendedRows]);
      setData((current) => ({
        ...current,
        rosterEntries: [...current.rosterEntries, ...appendedRows],
      }));
      setRosterSizeInput(String(nextCount));
      return;
    }

    const removedRows = rosterDraft.slice(nextCount);
    const removedRowsHaveData = removedRows.some(
      (entry) => entry.studentName.trim() || entry.height.trim() || entry.weight.trim(),
    );
    const recordOverflowRisk = data.records.length > nextCount;

    if (removedRowsHaveData || recordOverflowRisk) {
      const confirmed = window.confirm(
        "縮減班級人數後，超出人數的名冊列將被移除；如果之後按下「儲存」，也可能刪除對應的測驗資料。要繼續嗎？",
      );
      if (!confirmed) {
        setRosterSizeInput(String(currentCount));
        return;
      }
    }

    setRosterDraft((current) => current.slice(0, nextCount));
    setData((current) => ({
      ...current,
      rosterEntries: current.rosterEntries.slice(0, nextCount),
    }));
    setRosterActiveCell((current) => {
      if (!current) {
        return null;
      }

      return current.rowIndex >= nextCount ? null : current;
    });
    setRosterSizeInput(String(nextCount));
  }

  function applyGridPaste(
    current: string[][],
    startRowIndex: number,
    startColumnIndex: number,
    clipboardText: string,
  ): string[][] {
    const pastedGrid = parseClipboardGrid(clipboardText);
    if (!pastedGrid.length) {
      return current;
    }

    return current.map((row, rowIndex) =>
      row.map((cell, columnIndex) => {
        const pastedRow = pastedGrid[rowIndex - startRowIndex];
        if (!pastedRow) {
          return cell;
        }

        const pastedCell = pastedRow[columnIndex - startColumnIndex];
        return pastedCell === undefined ? cell : pastedCell;
      }),
    );
  }

  function applyRosterPaste(
    startRowIndex: number,
    startColumnIndex: number,
    clipboardText: string,
  ): void {
    const rosterRows = rosterDraft.map((entry) => [
      entry.studentName,
      entry.height,
      entry.weight,
      entry.studentGradeLabel,
    ]);
    const nextRows = applyGridPaste(
      rosterRows,
      startRowIndex,
      startColumnIndex,
      clipboardText,
    );

    setRosterDraft((current) =>
      current.map((entry, rowIndex) => ({
        ...entry,
        studentName: nextRows[rowIndex]?.[0] ?? entry.studentName,
        height: nextRows[rowIndex]?.[1] ?? entry.height,
        weight: nextRows[rowIndex]?.[2] ?? entry.weight,
        studentGradeLabel:
          inferStudentGradeFromText(nextRows[rowIndex]?.[3], entry.studentGradeLabel),
      })),
    );
  }

  function handleRosterPaste(
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
  ): void {
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!clipboardText.includes("\t") && !clipboardText.includes("\n")) {
      return;
    }

    event.preventDefault();
    applyRosterPaste(rowIndex, columnIndex, clipboardText);
  }

  function handleRosterKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    columnIndex: number,
  ): void {
    let nextRowIndex = rowIndex;
    let nextColumnIndex = columnIndex;

    if (event.key === "Enter") {
      event.preventDefault();
      nextRowIndex = Math.max(
        0,
        Math.min(rosterDraft.length - 1, rowIndex + (event.shiftKey ? -1 : 1)),
      );
      setRosterActiveCell({ rowIndex: nextRowIndex, columnIndex });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      nextRowIndex = Math.max(0, rowIndex - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nextRowIndex = Math.min(rosterDraft.length - 1, rowIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      nextColumnIndex = Math.max(0, columnIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nextColumnIndex = Math.min(
        isMixedAgeClass(data.gradeLabel) ? 3 : 2,
        columnIndex + 1,
      );
    } else {
      return;
    }

    setRosterActiveCell({ rowIndex: nextRowIndex, columnIndex: nextColumnIndex });
  }

  function applyRosterDraftToCurrentData(showMessage = true): boolean {
    const normalizedRosterEntries = normalizedRosterDraft.filter(
      (entry) => entry.studentName,
    );

    const existingMap = new Map(
      data.records.map((record) => [record.studentName, record] as const),
    );

    const nextRecords = normalizedRosterEntries.map((entry) => {
      const existing = existingMap.get(entry.studentName);
      if (existing) {
        return {
          ...existing,
          studentName: entry.studentName,
          height: entry.height,
          weight: entry.weight,
          studentGradeLabel: entry.studentGradeLabel,
          testDate: data.testDate,
        };
      }

      return {
        ...makeEmptyRecord(data.testDate),
        studentName: entry.studentName,
        height: entry.height,
        weight: entry.weight,
        studentGradeLabel: entry.studentGradeLabel,
      };
    });

    setData((current) => ({
      ...current,
      rosterEntries: normalizedRosterEntries,
      records: nextRecords,
    }));
    setRosterDraft(
      normalizedRosterEntries.length
        ? normalizedRosterEntries
        : [makeEmptyRosterEntry()],
    );
    setSelectedId(nextRecords[0]?.id ?? "");
    setDraftRecord(nextRecords[0] ?? makeEmptyRecord(data.testDate));
    if (showMessage) {
      setMessage(
        normalizedRosterEntries.length
          ? "已將名冊匯入目前資料。"
          : "已儲存學員名單，目前沒有學員。",
      );
    }
    return true;
  }

  function discardRosterDraftChanges(showMessage = true): void {
    setRosterDraft(
      data.rosterEntries.length ? data.rosterEntries : [makeEmptyRosterEntry()],
    );
    setRosterSizeInput(String(Math.max(data.rosterEntries.length, 1)));
    setRosterActiveCell(null);
    if (showMessage) {
      setMessage("已放棄學員名單的未儲存變更。");
    }
  }

  function importRosterToRecords(): void {
    applyRosterDraftToCurrentData(true);
  }

  function beginCellEdit(recordId: string, field: EditableField): void {
    setActiveCell({ recordId, field });
  }

  function stopCellEdit(): void {
    setActiveCell(null);
  }

  function moveTableActiveCell(
    recordId: string,
    field: EditableField,
    rowOffset: number,
    columnOffset = 0,
    navigationFields: EditableField[] = tableEditableFields,
  ): void {
    const currentIndex = currentEditableRecords.findIndex(
      (record) => record.id === recordId,
    );
    if (currentIndex === -1) {
      setActiveCell(null);
      return;
    }

    const nextIndex = Math.max(
      0,
      Math.min(currentEditableRecords.length - 1, currentIndex + rowOffset),
    );
    const nextRecord = currentEditableRecords[nextIndex];
    if (!nextRecord) {
      setActiveCell(null);
      return;
    }

    const currentFieldIndex = navigationFields.indexOf(field);
    const nextFieldIndex =
      currentFieldIndex === -1
        ? 0
        : Math.max(
            0,
            Math.min(navigationFields.length - 1, currentFieldIndex + columnOffset),
          );
    const nextField = navigationFields[nextFieldIndex] ?? field;

    setSelectedId(nextRecord.id);
    setDraftRecord(nextRecord);
    setActiveCell({ recordId: nextRecord.id, field: nextField });
  }

  async function handleDownloadCurrentPdf(): Promise<void> {
    if (!selectedRecord) {
      setMessage("請先選擇一位學生。");
      return;
    }

    await pdfCanvasRef.current?.downloadCurrentPdf();
    setMessage(`已下載 ${selectedRecord.studentName} 的報告。`);
  }

  async function handleDownloadAllPdfs(): Promise<void> {
    await exportAllReportsPdf({
      abilityProfile: currentAbilityProfile,
      abilityRulesConfig,
      fileGradeLabel: data.gradeLabel,
      records: data.records,
      rosterName: data.rosterName,
      testDate: data.testDate,
    });
    setMessage(`已下載 ${data.rosterName || "本班"} 全班報告。`);
  }

  async function handleFirebaseWriteTest(): Promise<void> {
    try {
      await writeFirebaseConnectionTest(data);
      setFirebaseStatus("Firebase 寫入測試成功。");
      setMessage("Firebase 寫入測試成功。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Firebase 寫入測試失敗。";
      setFirebaseStatus(`Firebase 寫入失敗：${nextMessage}`);
      setMessage(`Firebase 寫入失敗：${nextMessage}`);
    }
  }

  async function handleFirebaseReadTest(): Promise<void> {
    try {
      const result = await readFirebaseConnectionTest();
      if (!result.exists) {
        setFirebaseStatus("Firebase 讀取成功，但測試文件尚不存在。");
        setMessage("Firebase 讀取成功，但測試文件尚不存在。");
        return;
      }

      setFirebaseStatus(
        `Firebase 讀取成功：${JSON.stringify(result.data, null, 2)}`,
      );
      setMessage("Firebase 讀取測試成功。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Firebase 讀取測試失敗。";
      setFirebaseStatus(`Firebase 讀取失敗：${nextMessage}`);
      setMessage(`Firebase 讀取失敗：${nextMessage}`);
    }
  }

  async function handleSignIn(): Promise<void> {
    if (!loginUsername.trim() || !loginPassword) {
      setMessage("請輸入帳號與密碼。");
      return;
    }

    if (!isValidUsername(loginUsername)) {
      setMessage("帳號請使用 3 到 32 碼的小寫英數，可包含 .、_、-。");
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      recordDiagnosticEvent("auth.sign-in-clicked", "使用者嘗試登入。", {
        username: normalizeUsername(loginUsername.trim()),
      });
      const user = await signInWithUsername(loginUsername.trim(), loginPassword);
      setShowLoginPanel(false);
      setLoginPassword("");
      setLoginUsername("");
      await writeAppSystemLog({
        operationId,
        actionType: "user_signed_in",
        phase: "completed",
        actorUid: user.uid,
        actorUsername: normalizeUsername(loginUsername.trim()),
        actorDisplayName: user.displayName || normalizeUsername(loginUsername.trim()),
        targetUid: user.uid,
        targetUsername: normalizeUsername(loginUsername.trim()),
        message: "已登入帳號。",
      });
      setMessage(`已登入 ${user.displayName || emailToUsername(user.email) || "使用者"}。`);
    } catch (error) {
      const nextMessage = formatAuthError(error, "帳號登入失敗。");
      recordDiagnosticEvent("auth.sign-in-failed", "使用者登入失敗。", {
        username: normalizeUsername(loginUsername.trim()),
        error: nextMessage,
      });
      setMessage(`帳號登入失敗：${nextMessage}`);
    }
  }

  async function handleRegister(): Promise<void> {
    if (!loginUsername.trim() || !loginPassword) {
      setMessage("請輸入帳號與密碼。");
      return;
    }

    if (!isValidUsername(loginUsername)) {
      setMessage("帳號請使用 3 到 32 碼的小寫英數，可包含 .、_、-。");
      return;
    }

    if (loginPassword.length < 6) {
      setMessage("密碼至少需要 6 個字元。");
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      recordDiagnosticEvent("auth.register-clicked", "使用者嘗試註冊。", {
        username: normalizeUsername(loginUsername.trim()),
      });
      const user = await registerWithUsername(loginUsername.trim(), loginPassword);
      setShowLoginPanel(false);
      setLoginPassword("");
      setLoginUsername("");
      await writeAppSystemLog({
        operationId,
        actionType: "user_registered",
        phase: "completed",
        actorUid: user.uid,
        actorUsername: normalizeUsername(loginUsername.trim()),
        actorDisplayName: normalizeUsername(loginUsername.trim()),
        targetUid: user.uid,
        targetUsername: normalizeUsername(loginUsername.trim()),
        message: "已建立使用者帳號。",
      });
      setMessage(`已建立帳號 ${user.displayName || emailToUsername(user.email) || "使用者"}。`);
    } catch (error) {
      const nextMessage = formatAuthError(error, "註冊失敗。");
      recordDiagnosticEvent("auth.register-failed", "使用者註冊失敗。", {
        username: normalizeUsername(loginUsername.trim()),
        error: nextMessage,
      });
      setMessage(`註冊失敗：${nextMessage}`);
    }
  }

  async function handleSignOut(): Promise<void> {
    try {
      const operationId = createSystemLogOperationId();
      recordDiagnosticEvent("auth.sign-out-clicked", "使用者嘗試登出。", {
        uid: currentUser?.uid ?? null,
        username: currentUsername,
        currentCloudFileId,
        currentCloudFileOwnerUid,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "user_signed_out",
        phase: "started",
        message: "開始登出帳號。",
      });
      await signOutCurrentUser();
      await writeAppSystemLog({
        operationId,
        actionType: "user_signed_out",
        phase: "completed",
        message: "已登出帳號。",
      });
      setShowLoginPanel(false);
      setShowAccountMenu(false);
      setMessage("已登出。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "登出失敗。";
      await writeAppSystemLog({
        actionType: "user_signed_out",
        phase: "failed",
        message: nextMessage,
      });
      setMessage(`登出失敗：${nextMessage}`);
    }
  }

  async function handleSubmitDiagnosticReport(): Promise<void> {
    if (!diagnosticDescription.trim()) {
      setMessage("請先輸入問題描述。");
      return;
    }

    setDiagnosticSubmitting(true);
    recordDiagnosticEvent("diagnostic.submit-started", "使用者送出問題回報。", {
      uid: currentUser?.uid ?? null,
      username: currentUser ? currentUsername : null,
      currentCloudFileId,
      currentCloudFileOwnerUid,
      currentFileName: currentCloudFileSummary?.fileName ?? null,
    });

    try {
      const reportId = await submitDiagnosticReport(db, {
        reporterUid: currentUser?.uid ?? null,
        reporterUsername: currentUser ? currentUsername : null,
        reporterDisplayName: currentUser ? currentDisplayName : null,
        userMessage: {
          title: diagnosticTitle.trim(),
          description: diagnosticDescription.trim(),
          expected: diagnosticExpected.trim(),
          actual: diagnosticActual.trim(),
        },
        authSnapshot: {
          uid: currentUser?.uid ?? null,
          email: currentUser?.email ?? null,
          username: currentUser ? currentUsername : null,
          displayName: currentUser?.displayName ?? null,
          profileNickname: currentProfile?.displayNickname ?? null,
        },
        currentFileSnapshot: {
          fileId: currentCloudFileId,
          ownerUid: currentCloudFileOwnerUid,
          fileName: currentCloudFileSummary?.fileName ?? null,
          rosterName: currentCloudFileSummary?.rosterName ?? data.rosterName,
          academicTerm: currentCloudFileSummary?.academicTerm ?? data.academicTerm,
          accessRole: currentCloudFileSummary?.accessRole ?? null,
          recordCount: data.records.length,
          rosterCount: data.rosterEntries.length,
        },
        frontendIssues,
      });
      recordDiagnosticEvent("diagnostic.submit-completed", "問題回報已送出。", {
        reportId,
      });
      setDiagnosticTitle("");
      setDiagnosticDescription("");
      setDiagnosticExpected("");
      setDiagnosticActual("");
      setShowDiagnosticPanel(false);
      setMessage(`問題回報已送出，編號：${reportId}`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "送出問題回報失敗。";
      recordDiagnosticEvent("diagnostic.submit-failed", "問題回報送出失敗。", {
        error: nextMessage,
      });
      setMessage(`問題回報送出失敗：${nextMessage}`);
    } finally {
      setDiagnosticSubmitting(false);
    }
  }

  function formatActivityDate(dateString: string | null): string {
    if (!dateString) {
      return "剛剛";
    }

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      return "剛剛";
    }

    return parsed.toLocaleString("zh-TW");
  }

  async function handleAddFriend(): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再新增好友。");
      return;
    }

    const nextUsername = normalizeUsername(friendDraft);
    if (!nextUsername) {
      setMessage("請先輸入好友帳號。");
      return;
    }

    if (!isValidUsername(nextUsername)) {
      setMessage("好友帳號格式不正確，請使用 3 到 32 碼的小寫英數，可包含 .、_、-。");
      return;
    }

    if (nextUsername === currentUsername) {
      setMessage("不能把自己加入好友列表。");
      return;
    }

    if (friends.some((friend) => friend.username === nextUsername)) {
      setMessage(`好友 ${nextUsername} 已經在列表中。`);
      return;
    }

    if (
      outgoingFriendRequests.some(
        (request) => request.toUsername === nextUsername,
      )
    ) {
      setMessage(`已送出給 ${nextUsername} 的好友邀請，請等待對方確認。`);
      return;
    }

    if (
      incomingFriendRequests.some(
        (request) => request.fromUsername === nextUsername,
      )
    ) {
      setMessage(`對方已送出好友邀請，請直接在下方按同意。`);
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_created",
        phase: "started",
        targetUsername: nextUsername,
        message: "開始送出好友邀請。",
        payload: { source: "manual" },
      });
      await sendFriendRequest({
        fromUid: currentUser.uid,
        fromUsername: currentUsername,
        fromDisplayName: currentProfile?.displayNickname ?? null,
        targetUsername: nextUsername,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_created",
        phase: "completed",
        targetUsername: nextUsername,
        message: "已送出好友邀請。",
        payload: { source: "manual" },
      });
      setFriendDraft("");
      setMessage(`已送出給 ${nextUsername} 的好友邀請。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "送出好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_created",
        phase: "failed",
        targetUsername: nextUsername,
        message: nextMessage,
        payload: { source: "manual" },
      });
      setMessage(nextMessage);
    }
  }

  async function handleAcceptFriendRequest(
    request: FriendRequestRecord,
  ): Promise<void> {
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_accepted",
        phase: "started",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: "開始同意好友邀請。",
      });
      await acceptFriendRequest(request);
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_accepted",
        phase: "completed",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: "已同意好友邀請。",
      });
      setMessage(`已和 ${request.fromUsername} 成為好友。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "同意好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_accepted",
        phase: "failed",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  }

  async function handleRejectFriendRequest(
    request: FriendRequestRecord,
  ): Promise<void> {
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_rejected",
        phase: "started",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: "開始拒絕好友邀請。",
      });
      await rejectFriendRequest(request.id);
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_rejected",
        phase: "completed",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: "已拒絕好友邀請。",
      });
      setMessage(`已拒絕 ${request.fromUsername} 的好友邀請。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "拒絕好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_rejected",
        phase: "failed",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  }

  async function handleCancelOutgoingFriendRequest(
    request: FriendRequestRecord,
  ): Promise<void> {
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_cancelled",
        phase: "started",
        targetUid: request.toUid,
        targetUsername: request.toUsername,
        requestId: request.id,
        message: "開始取消已送出的好友邀請。",
      });
      await cancelFriendRequest(request.id);
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_cancelled",
        phase: "completed",
        targetUid: request.toUid,
        targetUsername: request.toUsername,
        requestId: request.id,
        message: "已取消已送出的好友邀請。",
      });
      setMessage(`已取消送給 ${request.toUsername} 的好友邀請。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "取消好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_cancelled",
        phase: "failed",
        targetUid: request.toUid,
        targetUsername: request.toUsername,
        requestId: request.id,
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  }

  async function handleRemoveFriend(friend: FriendRecord): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再管理好友。");
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_removed",
        phase: "started",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "開始移除好友。",
      });
      await removeFriend({
        currentUid: currentUser.uid,
        friendUid: friend.friendUid,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_removed",
        phase: "completed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "已移除好友。",
      });
      setMessage(`已移除好友 ${friend.username}。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "移除好友失敗。";
      await writeAppSystemLog({
        actionType: "friend_removed",
        phase: "failed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  }

  async function handleCreateFriendInvite(): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再產生加好友 QR Code。");
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_invite_created",
        phase: "started",
        message: "開始建立加好友邀請。",
      });
      const invite = await createFriendInvite({
        issuedByUid: currentUser.uid,
        issuedByUsername: currentUsername,
        issuedByDisplayName: currentProfile?.displayNickname ?? null,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_invite_created",
        phase: "completed",
        inviteId: invite.id,
        message: "已建立加好友邀請。",
      });
      setActiveFriendInvite(invite);
      setMessage("已產生新的加好友 QR Code。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "產生加好友 QR Code 失敗。";
      await writeAppSystemLog({
        actionType: "friend_invite_created",
        phase: "failed",
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  }

  async function handleSendFriendRequestFromQr(): Promise<void> {
    if (!currentUser) {
      setFriendInviteActionState({
        status: "error",
        detail: "請先登入，再送出好友邀請。",
      });
      pushFriendInviteTrace("error", "請先登入，再送出好友邀請。");
      setMessage("請先登入，再送出好友邀請。");
      return;
    }

    if (!scannedFriendInvite) {
      setFriendInviteActionState({
        status: "error",
        detail: "找不到這張加好友邀請。",
      });
      pushFriendInviteTrace("error", "找不到這張加好友邀請。");
      setMessage("找不到這張加好友邀請。");
      return;
    }

    if (scannedFriendInvite.issuedByUid === currentUser.uid) {
      setFriendInviteActionState({
        status: "error",
        detail: "這是你自己的行動條碼。",
      });
      pushFriendInviteTrace("error", "這是你自己的行動條碼。");
      setMessage("這是你自己的加好友 QR Code。");
      return;
    }

    if (
      friends.some((friend) => friend.username === scannedFriendInvite.issuedByUsername)
    ) {
      setFriendInviteActionState({
        status: "error",
        detail: `${scannedFriendInvite.issuedByUsername} 已經在好友列表中。`,
      });
      pushFriendInviteTrace(
        "error",
        `${scannedFriendInvite.issuedByUsername} 已經在好友列表中。`,
      );
      setMessage(`${scannedFriendInvite.issuedByUsername} 已經在好友列表中。`);
      return;
    }

    if (
      outgoingFriendRequests.some(
        (request) => request.toUid === scannedFriendInvite.issuedByUid,
      )
    ) {
      setFriendInviteActionState({
        status: "error",
        detail: "你已經送出好友邀請，請等待對方確認。",
      });
      pushFriendInviteTrace("error", "你已經送出好友邀請，請等待對方確認。");
      setMessage("你已經送出好友邀請，請等待對方確認。");
      return;
    }

    if (
      incomingFriendRequests.some(
        (request) => request.fromUid === scannedFriendInvite.issuedByUid,
      )
    ) {
      setFriendInviteActionState({
        status: "error",
        detail: "對方已先送出好友邀請，請直接在收到的邀請中按同意。",
      });
      pushFriendInviteTrace(
        "error",
        "對方已先送出好友邀請，請直接在收到的邀請中按同意。",
      );
      setMessage("對方已先送出好友邀請，請直接在收到的邀請中按同意。");
      return;
    }

    try {
      setFriendInviteActionState({
        status: "loading",
        detail: "正在送出好友邀請...",
      });
      pushFriendInviteTrace("loading", "正在送出好友邀請...");
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_created",
        phase: "started",
        targetUid: scannedFriendInvite.issuedByUid,
        targetUsername: scannedFriendInvite.issuedByUsername,
        inviteId: scannedFriendInvite.id,
        message: "開始透過 QR Code 送出好友邀請。",
        payload: { source: "invite" },
      });
      await sendFriendRequestFromInvite({
        inviteId: scannedFriendInvite.id,
        fromUid: currentUser.uid,
        fromUsername: currentUsername,
        fromDisplayName: currentProfile?.displayNickname ?? null,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_created",
        phase: "completed",
        targetUid: scannedFriendInvite.issuedByUid,
        targetUsername: scannedFriendInvite.issuedByUsername,
        inviteId: scannedFriendInvite.id,
        message: "已透過 QR Code 送出好友邀請。",
        payload: { source: "invite" },
      });
      setMessage(
        `已透過 QR Code 對 ${scannedFriendInvite.issuedByUsername} 送出好友邀請。`,
      );
      setFriendInviteActionState({
        status: "success",
        detail: `已送出給 ${scannedFriendInvite.issuedByUsername} 的好友邀請。`,
      });
      pushFriendInviteTrace(
        "success",
        `已送出給 ${scannedFriendInvite.issuedByUsername} 的好友邀請。`,
      );
      closeFriendInvitePage();
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "送出好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_created",
        phase: "failed",
        targetUid: scannedFriendInvite.issuedByUid,
        targetUsername: scannedFriendInvite.issuedByUsername,
        inviteId: scannedFriendInvite.id,
        message: nextMessage,
        payload: { source: "invite" },
      });
      setFriendInviteActionState({
        status: "error",
        detail: nextMessage,
      });
      pushFriendInviteTrace("error", nextMessage);
      setMessage(nextMessage);
    }
  }

  function closeFriendInvitePage(): void {
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("friendInvite");
    nextUrl.searchParams.delete("invite");
    nextUrl.searchParams.delete("view");
    window.history.replaceState({}, "", nextUrl.toString());
    setInviteIdFromUrl("");
    setScannedFriendInvite(null);
    setActiveTab(currentUser ? "files" : "account");
  }

  useEffect(() => {
    if (isFriendInvitePage) {
      setFriendInviteActionState({
        status: "idle",
        detail: "",
      });
    }
  }, [inviteIdFromUrl, isFriendInvitePage]);

  function openAccountPanel(): void {
    void handleTabChange("account");
    setShowAccountMenu(false);
  }

  async function handleSaveOwnNickname(): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再設定暱稱。");
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "profile_nickname_updated",
        phase: "started",
        message: "開始更新自己的暱稱。",
        payload: {
          displayNickname: nicknameDraft.trim() || null,
        },
      });
      await updateOwnDisplayNickname({
        uid: currentUser.uid,
        username: currentUsername,
        displayNickname: nicknameDraft,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "profile_nickname_updated",
        phase: "completed",
        message: nicknameDraft.trim()
          ? "已更新自己的暱稱。"
          : "已清除自己的暱稱。",
        payload: {
          displayNickname: nicknameDraft.trim() || null,
        },
      });
      setMessage(
        nicknameDraft.trim()
          ? `已更新你的暱稱：${nicknameDraft.trim()}`
          : "已恢復為使用帳號名稱顯示。",
      );
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "更新暱稱失敗。";
      await writeAppSystemLog({
        actionType: "profile_nickname_updated",
        phase: "failed",
        message: nextMessage,
        payload: {
          displayNickname: nicknameDraft.trim() || null,
        },
      });
      setMessage(`更新暱稱失敗：${nextMessage}`);
    }
  }

  function updateFriendNicknameDraft(friendUid: string, value: string): void {
    setFriendNicknameDrafts((current) => ({
      ...current,
      [friendUid]: value,
    }));
  }

  async function handleSaveFriendNickname(friend: FriendRecord): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再更新好友暱稱。");
      return;
    }

    try {
      const nextNickname = friendNicknameDrafts[friend.friendUid] ?? "";
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_nickname_updated",
        phase: "started",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "開始更新好友備註暱稱。",
        payload: {
          customNickname: nextNickname.trim() || null,
        },
      });
      await updateFriendCustomNickname({
        currentUid: currentUser.uid,
        friendUid: friend.friendUid,
        customNickname: nextNickname,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_nickname_updated",
        phase: "completed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: nextNickname.trim()
          ? "已更新好友備註暱稱。"
          : "已清除好友備註暱稱。",
        payload: {
          customNickname: nextNickname.trim() || null,
        },
      });
      setMessage(
        nextNickname.trim()
          ? `已更新 ${friend.username} 的好友備註暱稱。`
          : `已清除 ${friend.username} 的好友備註暱稱。`,
      );
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "更新好友暱稱失敗。";
      await writeAppSystemLog({
        actionType: "friend_nickname_updated",
        phase: "failed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: nextMessage,
      });
      setMessage(`更新好友暱稱失敗：${nextMessage}`);
    }
  }

  async function handleResetFriendNickname(friend: FriendRecord): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再更新好友暱稱。");
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_nickname_reset",
        phase: "started",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "開始恢復好友自己的暱稱。",
      });
      await updateFriendCustomNickname({
        currentUid: currentUser.uid,
        friendUid: friend.friendUid,
        customNickname: null,
      });
      setFriendNicknameDrafts((current) => ({
        ...current,
        [friend.friendUid]: "",
      }));
      await writeAppSystemLog({
        operationId,
        actionType: "friend_nickname_reset",
        phase: "completed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "已恢復顯示好友自己的暱稱。",
      });
      setMessage(`已恢復顯示 ${friend.username} 自己設定的暱稱。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "恢復好友暱稱失敗。";
      await writeAppSystemLog({
        actionType: "friend_nickname_reset",
        phase: "failed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: nextMessage,
      });
      setMessage(`恢復好友暱稱失敗：${nextMessage}`);
    }
  }

  function confirmDiscardCloudChanges(): boolean {
    if (!currentCloudFileId || !isCloudDirty) {
      return true;
    }

    return window.confirm(
      "目前檔案還有未儲存變更。確定要繼續嗎？未儲存內容不會上傳到雲端。",
    );
  }

  async function handleCreateCloudFile(): Promise<void> {
    if (!currentUser) {
      setMessage("請先註冊並登入，才能在 Firebase 建立自己的檔案。");
      return;
    }

    if (!confirmDiscardCloudChanges()) {
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "file_created",
        phase: "started",
        message: "開始建立雲端檔案。",
        payload: {
          rosterName: data.rosterName,
          gradeLabel: data.gradeLabel,
          academicTerm: data.academicTerm,
        },
      });
      const fileId = await createCloudFile({
        uid: currentUser.uid,
        username: currentUsername,
        displayName: currentProfile?.displayNickname ?? null,
        data,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "file_created",
        phase: "completed",
        ownerUid: currentUser.uid,
        fileId,
        fileName: data.academicTerm
          ? `${data.academicTerm} / ${data.rosterName || "未命名班級"}`
          : data.rosterName || "未命名班級",
        message: "已建立雲端檔案。",
      });
      setCurrentCloudFileId(fileId);
      setCurrentCloudFileOwnerUid(currentUser.uid);
      setExpandedCloudFileId(fileId);
      setIsCloudDirty(false);
      setShareEditorUids([]);
      setShowCreateFilePage(false);
      setMessage("已在你的帳號下建立新的雲端檔案。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "建立雲端檔案失敗。";
      await writeAppSystemLog({
        actionType: "file_created",
        phase: "failed",
        message: nextMessage,
        payload: {
          rosterName: data.rosterName,
          gradeLabel: data.gradeLabel,
          academicTerm: data.academicTerm,
        },
      });
      setMessage(`建立雲端檔案失敗：${nextMessage}`);
    }
  }

  function updateNewCloudFileDraft(
    field: keyof NewCloudFileDraft,
    value: string,
  ): void {
    setNewCloudFileDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function buildAppDataForNewCloudFile(): AppData {
    const rosterCount = Math.max(1, Math.floor(Number(newCloudFileDraft.rosterCount) || 0));
    const gradeLabel = newCloudFileDraft.gradeLabel || GRADE_OPTIONS[0] || "";
    const testDate = newCloudFileDraft.testDate || new Date().toISOString().slice(0, 10);
    const academicTerm = `民國 ${newCloudFileDraft.academicYear} 年${newCloudFileDraft.semester}`;
    const studentGradeLabel = resolveStudentGradeLabel(gradeLabel, "");
    const rosterEntries = Array.from({ length: rosterCount }, () => ({
      ...makeEmptyRosterEntry(),
      studentGradeLabel,
    }));

    return {
      ...defaultAppData,
      testDate,
      academicTerm,
      rosterName: newCloudFileDraft.rosterName.trim() || "未命名班級",
      gradeLabel,
      rosterEntries,
      records: [],
    };
  }

  async function handleCreateCloudFileFromDraft(): Promise<void> {
    if (!currentUser) {
      setMessage("請先註冊並登入，才能在 Firebase 建立自己的檔案。");
      return;
    }

    const nextData = buildAppDataForNewCloudFile();
    const rosterName = nextData.rosterName.trim();
    if (!rosterName) {
      setMessage("請先輸入班級名稱。");
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "file_created",
        phase: "started",
        message: "開始建立雲端檔案。",
        payload: {
          rosterName: nextData.rosterName,
          gradeLabel: nextData.gradeLabel,
          academicTerm: nextData.academicTerm,
        },
      });
      const fileId = await createCloudFile({
        uid: currentUser.uid,
        username: currentUsername,
        displayName: currentProfile?.displayNickname ?? null,
        data: nextData,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "file_created",
        phase: "completed",
        ownerUid: currentUser.uid,
        fileId,
        fileName: `${nextData.academicTerm} / ${nextData.rosterName || "未命名班級"}`,
        message: "已建立雲端檔案。",
      });
      skipNextCloudDirtyRef.current = true;
      setData(nextData);
      setCurrentCloudFileId(fileId);
      setCurrentCloudFileOwnerUid(currentUser.uid);
      setExpandedCloudFileId(fileId);
      setIsCloudDirty(false);
      setShareEditorUids([]);
      setSelectedId("");
      setDraftRecord(makeEmptyRecord(nextData.testDate));
      setRosterDraft(
        nextData.rosterEntries.length ? nextData.rosterEntries : [makeEmptyRosterEntry()],
      );
      setRosterSizeInput(String(nextData.rosterEntries.length || 1));
      setShowCreateFilePage(false);
      setMessage("已建立新的雲端檔案。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "建立雲端檔案失敗。";
      await writeAppSystemLog({
        actionType: "file_created",
        phase: "failed",
        message: nextMessage,
        payload: {
          rosterName: nextData.rosterName,
          gradeLabel: nextData.gradeLabel,
          academicTerm: nextData.academicTerm,
        },
      });
      setMessage(`建立雲端檔案失敗：${nextMessage}`);
    }
  }

  async function handleSaveCurrentCloudFile(): Promise<boolean> {
    if (!currentUser || !currentCloudFileId || !currentCloudFileOwnerUid) {
      setMessage("請先開啟一份雲端檔案，再儲存。");
      return false;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "file_saved",
        phase: "started",
        ownerUid: currentCloudFileOwnerUid,
        fileId: currentCloudFileId,
        fileName: data.academicTerm
          ? `${data.academicTerm} / ${data.rosterName || "未命名班級"}`
          : data.rosterName || "未命名班級",
        message: "開始儲存雲端檔案。",
      });
      await saveCloudFileData({
        ownerUid: currentCloudFileOwnerUid,
        fileId: currentCloudFileId,
        username: currentUsername,
        displayName: currentProfile?.displayNickname ?? null,
        data,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "file_saved",
        phase: "completed",
        ownerUid: currentCloudFileOwnerUid,
        fileId: currentCloudFileId,
        fileName: data.academicTerm
          ? `${data.academicTerm} / ${data.rosterName || "未命名班級"}`
          : data.rosterName || "未命名班級",
        message: "已儲存雲端檔案。",
      });
      setIsCloudDirty(false);
      setMessage("目前檔案已儲存到雲端。");
      return true;
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "儲存雲端檔案失敗。";
      await writeAppSystemLog({
        actionType: "file_saved",
        phase: "failed",
        ownerUid: currentCloudFileOwnerUid,
        fileId: currentCloudFileId,
        fileName: data.academicTerm
          ? `${data.academicTerm} / ${data.rosterName || "未命名班級"}`
          : data.rosterName || "未命名班級",
        message: nextMessage,
      });
      setMessage(`儲存雲端檔案失敗：${nextMessage}`);
      return false;
    }
  }

  async function restoreCurrentCloudFileFromServer(): Promise<boolean> {
    if (!currentCloudFileId || !currentCloudFileOwnerUid) {
      return false;
    }

    try {
      const nextData = await loadCloudFile(currentCloudFileOwnerUid, currentCloudFileId);
      skipNextCloudDirtyRef.current = true;
      setData(nextData);
      setIsCloudDirty(false);
      setShareEditorUids(await getCloudFileEditorUids(currentCloudFileOwnerUid, currentCloudFileId));
      setSelectedId(nextData.records[0]?.id ?? "");
      setDraftRecord(nextData.records[0] ?? makeEmptyRecord(nextData.testDate));
      setRosterDraft(
        nextData.rosterEntries.length ? nextData.rosterEntries : [makeEmptyRosterEntry()],
      );
      setRosterSizeInput(String(nextData.rosterEntries.length || 1));
      setMessage("已放棄未儲存變更，重新載入雲端檔案。");
      return true;
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "無法重新載入目前檔案。";
      setMessage(`放棄變更失敗：${nextMessage}`);
      return false;
    }
  }

  async function handleTabChange(nextTab: TabKey): Promise<void> {
    if (nextTab === activeTab) {
      return;
    }

    if (activeTab === "roster" && hasRosterDraftChanges) {
      const shouldSave = window.confirm(
        "目前學員名單有未儲存變更。按「確定」會先儲存，再切換頁面。",
      );

      if (shouldSave) {
        applyRosterDraftToCurrentData(false);
        setMessage("已儲存學員名單，正在切換頁面。");
        setActiveTab(nextTab);
        return;
      }

      const shouldDiscard = window.confirm(
        "要放棄目前學員名單的未儲存變更並切換頁面嗎？",
      );

      if (!shouldDiscard) {
        return;
      }

      discardRosterDraftChanges(false);
      setMessage("已放棄學員名單變更，正在切換頁面。");
    }

    if (activeTab === "files" && currentCloudFileId && isCloudDirty) {
      const shouldSave = window.confirm(
        "目前檔案有未儲存變更。按「確定」會先儲存，再切換頁面。",
      );

      if (shouldSave) {
        const saved = await handleSaveCurrentCloudFile();
        if (!saved) {
          return;
        }
        setActiveTab(nextTab);
        return;
      }

      const shouldDiscard = window.confirm(
        "要放棄目前的未儲存變更並切換頁面嗎？",
      );

      if (!shouldDiscard) {
        return;
      }

      const restored = await restoreCurrentCloudFileFromServer();
      if (!restored) {
        return;
      }
    }

    setActiveTab(nextTab);
  }

  async function handleOpenCloudFile(file: CloudFileSummary): Promise<void> {
    if (!currentUser) {
      pushFileOpenTrace("error", "未登入，無法切換檔案。");
      recordDiagnosticEvent("cloud.open-blocked", "未登入，無法切換檔案。", {
        targetFileId: file.id,
        targetOwnerUid: file.ownerUid,
        targetFileName: file.fileName,
      });
      setMessage("請先登入，再開啟雲端檔案。");
      return;
    }

    if (!confirmDiscardCloudChanges()) {
      pushFileOpenTrace("info", `已取消切換「${file.fileName}」，因為目前檔案仍有未儲存變更。`);
      recordDiagnosticEvent("cloud.open-cancelled", "使用者取消切換檔案。", {
        uid: currentUser.uid,
        currentCloudFileId,
        currentCloudFileOwnerUid,
        targetFileId: file.id,
        targetOwnerUid: file.ownerUid,
        targetFileName: file.fileName,
      });
      return;
    }

    try {
      setFileOpenTraceEntries([]);
      saveFileOpenTrace([]);
      pushFileOpenTrace("info", `開始切換檔案：${file.fileName}`);
      const operationId = createSystemLogOperationId();
      recordDiagnosticEvent("cloud.open-started", "使用者手動開啟檔案。", {
        uid: currentUser.uid,
        currentCloudFileId,
        currentCloudFileOwnerUid,
        targetFileId: file.id,
        targetOwnerUid: file.ownerUid,
        targetFileName: file.fileName,
        targetAccessRole: file.accessRole,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "file_opened",
        phase: "started",
        ownerUid: file.ownerUid,
        fileId: file.id,
        fileName: file.fileName,
        message: "開始開啟雲端檔案。",
      });
      pushFileOpenTrace("info", "已寫入 systemLogs started。");
      const nextData = await loadCloudFile(file.ownerUid, file.id);
      pushFileOpenTrace(
        "success",
        `已從雲端讀到檔案內容，名冊 ${nextData.rosterEntries.length} 人，測驗紀錄 ${nextData.records.length} 筆。`,
      );
      recordDiagnosticEvent("cloud.open-loaded", "已從雲端讀到檔案內容。", {
        uid: currentUser.uid,
        targetFileId: file.id,
        targetOwnerUid: file.ownerUid,
        targetFileName: file.fileName,
        rosterName: nextData.rosterName,
        recordCount: nextData.records.length,
        rosterCount: nextData.rosterEntries.length,
      });
      skipNextCloudDirtyRef.current = true;
      setData(nextData);
      pushFileOpenTrace("info", "已更新目前畫面資料。");
      setCurrentCloudFileId(file.id);
      setCurrentCloudFileOwnerUid(file.ownerUid);
      setExpandedCloudFileId(file.id);
      setIsCloudDirty(false);
      pushFileOpenTrace("info", `準備切換目前檔案 ID=${file.id} owner=${file.ownerUid}。`);
      const nextShareEditorUids = await getCloudFileEditorUids(file.ownerUid, file.id);
      setShareEditorUids(nextShareEditorUids);
      pushFileOpenTrace(
        "success",
        `已讀取共同編輯名單，共 ${nextShareEditorUids.length} 位。`,
      );
      setSelectedId(nextData.records[0]?.id ?? "");
      setDraftRecord(nextData.records[0] ?? makeEmptyRecord(nextData.testDate));
      setRosterDraft(
        nextData.rosterEntries.length
          ? nextData.rosterEntries
          : [makeEmptyRosterEntry()],
      );
      setRosterSizeInput(String(nextData.rosterEntries.length || 1));
      pushFileOpenTrace("success", "已更新目前選取學生、草稿與名冊狀態。");
      await writeAppSystemLog({
        operationId,
        actionType: "file_opened",
        phase: "completed",
        ownerUid: file.ownerUid,
        fileId: file.id,
        fileName: file.fileName,
        message: "已開啟雲端檔案。",
      });
      pushFileOpenTrace("success", "已寫入 systemLogs completed，檔案切換完成。");
      recordDiagnosticEvent("cloud.open-completed", "手動開啟檔案完成。", {
        uid: currentUser.uid,
        targetFileId: file.id,
        targetOwnerUid: file.ownerUid,
        targetFileName: file.fileName,
      });
      setMessage(`已切換到檔案：${file.fileName}`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "開啟雲端檔案失敗。";
      pushFileOpenTrace("error", `切換失敗：${nextMessage}`);
      recordDiagnosticEvent("cloud.open-failed", "手動開啟檔案失敗。", {
        uid: currentUser.uid,
        targetFileId: file.id,
        targetOwnerUid: file.ownerUid,
        targetFileName: file.fileName,
        error: nextMessage,
      });
      await writeAppSystemLog({
        actionType: "file_opened",
        phase: "failed",
        ownerUid: file.ownerUid,
        fileId: file.id,
        fileName: file.fileName,
        message: nextMessage,
      });
      setMessage(`開啟雲端檔案失敗：${nextMessage}`);
    }
  }

  function updateCloudFileDraft(
    fileId: string,
    field: "rosterName" | "gradeLabel" | "academicTerm" | "testDate",
    value: string,
  ): void {
    setCloudFileDrafts((current) => ({
      ...current,
      [fileId]: {
        rosterName: current[fileId]?.rosterName ?? "",
        gradeLabel: current[fileId]?.gradeLabel ?? "",
        academicTerm: current[fileId]?.academicTerm ?? "",
        testDate: current[fileId]?.testDate ?? "",
        [field]: value,
      },
    }));
  }

  function updateCloudFileDraftTermPart(
    fileId: string,
    field: "academicYear" | "semester",
    value: string,
  ): void {
    const currentValue =
      cloudFileDrafts[fileId]?.academicTerm ??
      cloudFiles.find((file) => file.id === fileId)?.academicTerm ??
      "";
    const currentParts = parseAcademicTermParts(currentValue);
    const nextAcademicYear =
      field === "academicYear" ? value : currentParts.academicYear;
    const nextSemester = field === "semester" ? value : currentParts.semester;

    updateCloudFileDraft(
      fileId,
      "academicTerm",
      buildAcademicTermValue(nextAcademicYear, nextSemester),
    );
  }

  async function handleSaveCloudFileInfo(file: CloudFileSummary): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再更新檔案資訊。");
      return;
    }

    const draft = cloudFileDrafts[file.id];
    if (!draft) {
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "file_info_updated",
        phase: "started",
        ownerUid: currentUser.uid,
        fileId: file.id,
        fileName: file.fileName,
        message: "開始更新檔案資訊。",
        payload: {
          rosterName: draft.rosterName,
          gradeLabel: draft.gradeLabel,
          academicTerm: draft.academicTerm,
          testDate: draft.testDate,
        },
      });
      await updateCloudFileInfo({
        ownerUid: currentUser.uid,
        fileId: file.id,
        rosterName: draft.rosterName,
        gradeLabel: draft.gradeLabel,
        academicTerm: draft.academicTerm,
        testDate: draft.testDate,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "file_info_updated",
        phase: "completed",
        ownerUid: currentUser.uid,
        fileId: file.id,
        fileName: file.fileName,
        message: "已更新檔案資訊。",
        payload: {
          rosterName: draft.rosterName,
          gradeLabel: draft.gradeLabel,
          academicTerm: draft.academicTerm,
          testDate: draft.testDate,
        },
      });
      setMessage(`已更新檔案資訊：${file.fileName}`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "更新檔案資訊失敗。";
      await writeAppSystemLog({
        actionType: "file_info_updated",
        phase: "failed",
        ownerUid: currentUser.uid,
        fileId: file.id,
        fileName: file.fileName,
        message: nextMessage,
      });
      setMessage(`更新檔案資訊失敗：${nextMessage}`);
    }
  }

  async function handleArchiveCloudFile(file: CloudFileSummary): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再封存檔案。");
      return;
    }

    const confirmed = window.confirm(
      `確定要封存「${file.fileName}」嗎？封存後它會從清單中移除，但不會真的刪除資料。`,
    );
    if (!confirmed) {
      return;
    }

    const doubleConfirmed = window.confirm(
      `請再次確認：要把「${file.fileName}」從檔案清單中封存移除嗎？`,
    );
    if (!doubleConfirmed) {
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "file_archived",
        phase: "started",
        ownerUid: currentUser.uid,
        fileId: file.id,
        fileName: file.fileName,
        message: "開始封存檔案。",
      });
      await archiveCloudFile({
        ownerUid: currentUser.uid,
        fileId: file.id,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "file_archived",
        phase: "completed",
        ownerUid: currentUser.uid,
        fileId: file.id,
        fileName: file.fileName,
        message: "已封存檔案。",
      });
      if (currentCloudFileId === file.id) {
        setCurrentCloudFileId(null);
        setCurrentCloudFileOwnerUid(null);
        setIsCloudDirty(false);
        setShareEditorUids([]);
        writeLastCloudFileSelection(currentUser.uid, null);
      }
      if (expandedCloudFileId === file.id) {
        setExpandedCloudFileId(null);
      }
      setMessage(`已封存檔案：${file.fileName}`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "封存檔案失敗。";
      await writeAppSystemLog({
        actionType: "file_archived",
        phase: "failed",
        ownerUid: currentUser.uid,
        fileId: file.id,
        fileName: file.fileName,
        message: nextMessage,
      });
      setMessage(`封存檔案失敗：${nextMessage}`);
    }
  }

  async function persistFileEditors(
    file: CloudFileSummary,
    nextEditorUids: string[],
    successMessage: string,
  ): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再設定共同編輯好友。");
      return;
    }

    if (file.ownerUid !== currentUser.uid) {
      setMessage("只有檔案擁有者可以設定共同編輯好友。");
      return;
    }

    const previousEditorUids = shareEditorUids;
    try {
      setShareEditorUids(nextEditorUids);
      await setCloudFileEditors({
        ownerUid: currentUser.uid,
        ownerUsername: currentUsername,
        ownerDisplayName: currentProfile?.displayNickname ?? null,
        file,
        previousEditorUids,
        editorTargets: shareableFriends
          .filter((friend) => nextEditorUids.includes(friend.friendUid))
          .map((friend) => ({
            uid: friend.friendUid,
            username: friend.username,
            displayName: friend.profileNickname,
          })),
      });
      setMessage(successMessage);
    } catch (error) {
      setShareEditorUids(previousEditorUids);
      const nextMessage =
        error instanceof Error ? error.message : "更新共同編輯好友失敗。";
      setMessage(`更新共同編輯好友失敗：${nextMessage}`);
      throw error instanceof Error ? error : new Error(nextMessage);
    }
  }

  async function handleShareFileWithFriend(file: CloudFileSummary): Promise<void> {
    if (!selectedShareFriendUid) {
      setMessage("請先選擇要分享的好友。");
      return;
    }

    const targetFriend = shareableFriends.find(
      (friend) => friend.friendUid === selectedShareFriendUid,
    );
    if (!targetFriend) {
      setMessage("找不到要分享的好友。");
      return;
    }

    if (shareEditorUids.includes(targetFriend.friendUid)) {
      setMessage(`「${targetFriend.displayName}」已經是共同編輯。`);
      return;
    }

    const nextEditorUids = [...shareEditorUids, targetFriend.friendUid];
    const operationId = createSystemLogOperationId();
    await writeAppSystemLog({
      operationId,
      actionType: "file_shared",
      phase: "started",
      ownerUid: file.ownerUid,
      fileId: file.id,
      fileName: file.fileName,
      targetUid: targetFriend.friendUid,
      targetUsername: targetFriend.username,
      message: "開始分享檔案。",
    });
    try {
      await persistFileEditors(
        file,
        nextEditorUids,
        `已將「${targetFriend.displayName}」加入「${file.fileName}」的共同編輯。`,
      );
      await writeAppSystemLog({
        operationId,
        actionType: "file_shared",
        phase: "completed",
        ownerUid: file.ownerUid,
        fileId: file.id,
        fileName: file.fileName,
        targetUid: targetFriend.friendUid,
        targetUsername: targetFriend.username,
        message: "已分享檔案。",
      });
      setSelectedShareFriendUid("");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "分享檔案失敗。";
      await writeAppSystemLog({
        operationId,
        actionType: "file_shared",
        phase: "failed",
        ownerUid: file.ownerUid,
        fileId: file.id,
        fileName: file.fileName,
        targetUid: targetFriend.friendUid,
        targetUsername: targetFriend.username,
        message: nextMessage,
      });
    }
  }

  async function handleRemoveFileEditor(
    file: CloudFileSummary,
    friendUid: string,
  ): Promise<void> {
    const targetFriend = shareableFriends.find((friend) => friend.friendUid === friendUid);
    const nextEditorUids = shareEditorUids.filter((uid) => uid !== friendUid);
    const operationId = createSystemLogOperationId();
    await writeAppSystemLog({
      operationId,
      actionType: "file_share_revoked",
      phase: "started",
      ownerUid: file.ownerUid,
      fileId: file.id,
      fileName: file.fileName,
      targetUid: friendUid,
      targetUsername: targetFriend?.username ?? null,
      message: "開始取消檔案分享。",
    });
    try {
      await persistFileEditors(
        file,
        nextEditorUids,
        targetFriend
          ? `已移除「${targetFriend.displayName}」的共同編輯權限。`
          : `已更新「${file.fileName}」的共同編輯名單。`,
      );
      await writeAppSystemLog({
        operationId,
        actionType: "file_share_revoked",
        phase: "completed",
        ownerUid: file.ownerUid,
        fileId: file.id,
        fileName: file.fileName,
        targetUid: friendUid,
        targetUsername: targetFriend?.username ?? null,
        message: "已取消檔案分享。",
      });
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "取消分享失敗。";
      await writeAppSystemLog({
        operationId,
        actionType: "file_share_revoked",
        phase: "failed",
        ownerUid: file.ownerUid,
        fileId: file.id,
        fileName: file.fileName,
        targetUid: friendUid,
        targetUsername: targetFriend?.username ?? null,
        message: nextMessage,
      });
    }
  }

  function openFileWorkspace(nextTab: Exclude<TabKey, "files" | "account" | "editor">): void {
    void handleTabChange(nextTab);
  }

  function formatInviteExpiry(dateString: string | null): string {
    if (!dateString) {
      return "短效邀請";
    }

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      return "短效邀請";
    }

    return `有效至 ${parsed.toLocaleString("zh-TW")}`;
  }

  function updateScore(field: FitnessField, value: string): void {
    updateDraftField(field, normalizeNumber(value));
  }

  function getMetricRule(field: FitnessField, record: FitnessRecord | null = selectedRecord) {
    return getAbilityRuleForField(getProfileForRecord(record), field);
  }

  function getMetricDisplayValue(record: FitnessRecord, field: FitnessField): string {
    return getDisplayValueForField(record[field], getMetricRule(field, record));
  }

  function getMetricSelectOptions(field: FitnessField, record: FitnessRecord | null = selectedRecord) {
    return getRubricOptions(getMetricRule(field, record));
  }

  function getMetricRangeHint(field: FitnessField): string {
    if (isMixedAgeClass(data.gradeLabel)) {
      return "";
    }

    const rule = getMetricRule(field, selectedRecord);
    if (!rule) {
      return "";
    }

    if (rule.kind === "rubric") {
      return "等級選項";
    }

    const firstBand = rule.bands[0];
    const lastBand = rule.bands[rule.bands.length - 1];
    const highLabel =
      typeof firstBand?.min === "number"
        ? `${firstBand.min}↑`
        : typeof firstBand?.max === "number"
          ? `${firstBand.max}↓`
          : "";
    const lowLabel =
      typeof lastBand?.max === "number"
        ? `${lastBand.max}↓`
        : typeof lastBand?.min === "number"
          ? `${lastBand.min}↑`
          : "";

    if (highLabel && lowLabel) {
      return `${lowLabel} ~ ${highLabel}`;
    }

    return highLabel || lowLabel;
  }

  function getTopLabel(record: FitnessRecord): string {
    const values = getAbilityScores(record, getProfileForRecord(record));
    const maxValue = Math.max(...values);
    const maxIndex = values.indexOf(maxValue);
    return getMetricRule(scoreFields[maxIndex], record)?.abilityLabel ?? "未設定";
  }

  function renderTableCell(
    record: FitnessRecord,
    field: EditableField,
    value: string | number,
    options?: {
      navigationFields?: EditableField[];
      inputType?: "text" | "number" | "select";
      min?: number;
      step?: number;
      className?: string;
      displayValue?: string;
      selectOptions?: Array<{ value: number | string; label: string }>;
    },
  ) {
    const isEditing =
      activeCell?.recordId === record.id && activeCell.field === field;

    const navigationFields =
      options?.navigationFields ??
      (isMixedAgeClass(data.gradeLabel)
        ? tableEditableFields
        : tableEditableFields.filter((nextField) => nextField !== "studentGradeLabel"));

    if (isEditing) {
      if (options?.inputType === "select") {
        return (
          <select
            autoFocus
            className={options?.className}
            onBlur={stopCellEdit}
            onChange={(event) =>
              updateTableField(record.id, field, event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                moveTableActiveCell(
                  record.id,
                  field,
                  event.shiftKey ? -1 : 1,
                  0,
                  navigationFields,
                );
                return;
              }

              if (event.key === "Escape") {
                stopCellEdit();
              }
            }}
            value={String(value)}
          >
            <option value="0">未填寫</option>
            {options.selectOptions?.map((option) => (
              <option key={`${field}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }

      return (
        <input
          autoFocus
          className={options?.className}
          min={options?.min}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={stopCellEdit}
          onChange={(event) =>
            updateTableField(record.id, field, event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              moveTableActiveCell(
                record.id,
                field,
                event.shiftKey ? -1 : 1,
                0,
                navigationFields,
              );
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveTableActiveCell(record.id, field, -1, 0, navigationFields);
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveTableActiveCell(record.id, field, 1, 0, navigationFields);
              return;
            }

            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveTableActiveCell(record.id, field, 0, -1, navigationFields);
              return;
            }

            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveTableActiveCell(record.id, field, 0, 1, navigationFields);
              return;
            }

            if (event.key === "Escape") {
              stopCellEdit();
            }
          }}
          step={options?.step}
          type={options?.inputType ?? "text"}
          value={String(value)}
        />
      );
    }

    return (
      <button
        className="cell-display"
        onClick={() => beginCellEdit(record.id, field)}
        type="button"
      >
        {options?.displayValue ?? (String(value || "") || "—")}
      </button>
    );
  }

  function resolveSheetScale(
    mode: SheetZoomMode,
    viewportWidth: number,
    baseWidth: number,
    minimumFitScale = 0,
  ): number {
    if (mode === "fit") {
      if (!viewportWidth) {
        return 1;
      }

      return Math.max(minimumFitScale, Math.min(1, viewportWidth / baseWidth));
    }

    return mode;
  }

  function preserveViewportPosition(
    viewport: HTMLDivElement | null,
    previousScale: number,
    nextScale: number,
  ): void {
    if (!viewport) {
      return;
    }

    const previousScrollableWidth = viewport.scrollWidth;
    const maxScrollLeft = Math.max(0, previousScrollableWidth - viewport.clientWidth);
    const scrollRatio = maxScrollLeft > 0 ? viewport.scrollLeft / maxScrollLeft : 0;

    requestAnimationFrame(() => {
      const nextMaxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollLeft = nextMaxScrollLeft * scrollRatio;
    });

    if (previousScale === nextScale) {
      return;
    }
  }

  function clampViewportScroll(
    viewport: HTMLDivElement | null,
    scaledWidth: number,
  ): void {
    if (!viewport) {
      return;
    }

    const maxScrollLeft = Math.max(
      0,
      scaledWidth + debugSettings.sheetScrollRightPadding - viewport.clientWidth,
    );
    if (viewport.scrollLeft > maxScrollLeft) {
      viewport.scrollLeft = maxScrollLeft;
    }
  }

  function handleViewportScroll(
    viewport: HTMLDivElement | null,
    scaledWidth: number,
  ): void {
    clampViewportScroll(viewport, scaledWidth);
  }

  const rosterScale = resolveSheetScale(
    rosterZoomMode,
    rosterViewportWidth,
    rosterNaturalWidth,
  );
  const tableScale = resolveSheetScale(
    tableZoomMode,
    tableViewportWidth,
    tableNaturalWidth,
  );
  const metricScale = resolveSheetScale(
    metricZoomMode,
    metricViewportWidth,
    metricNaturalWidth,
  );

  useEffect(() => {
    preserveViewportPosition(
      rosterViewportRef.current,
      previousRosterScaleRef.current,
      rosterScale,
    );
    previousRosterScaleRef.current = rosterScale;
  }, [rosterScale]);

  useEffect(() => {
    preserveViewportPosition(
      tableViewportRef.current,
      previousTableScaleRef.current,
      tableScale,
    );
    previousTableScaleRef.current = tableScale;
  }, [tableScale]);

  useEffect(() => {
    preserveViewportPosition(
      metricViewportRef.current,
      previousMetricScaleRef.current,
      metricScale,
    );
    previousMetricScaleRef.current = metricScale;
  }, [metricScale]);

  useEffect(() => {
    if (!inviteIdFromUrl) {
      setScannedFriendInvite(null);
      return;
    }

    let isCancelled = false;

    void getFriendInvite(inviteIdFromUrl)
      .then((invite) => {
        if (!isCancelled) {
          setScannedFriendInvite(invite);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setScannedFriendInvite(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [inviteIdFromUrl]);

  useEffect(() => {
    if (!activeFriendInvite) {
      setFriendInviteQrDataUrl("");
      setActiveFriendInviteUrl("");
      return;
    }

    let isCancelled = false;
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("friendInvite", activeFriendInvite.id);
    inviteUrl.searchParams.set("view", "friend-invite");
    inviteUrl.searchParams.delete("invite");
    inviteUrl.hash = "";
    const inviteUrlText = inviteUrl.toString();
    setActiveFriendInviteUrl(inviteUrlText);

    void QRCode.toDataURL(inviteUrlText, {
      width: 280,
      margin: 1,
    }).then((dataUrl: string) => {
      if (!isCancelled) {
        setFriendInviteQrDataUrl(dataUrl);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [activeFriendInvite]);

  function renderSheetZoomToolbar(
    currentMode: SheetZoomMode,
    onChange: (nextMode: SheetZoomMode) => void,
    options: Array<{ label: string; value: SheetZoomMode }> = SHEET_ZOOM_OPTIONS,
  ) {
    return (
      <div className="sheet-toolbar" role="group" aria-label="表格縮放">
        {options.map((option) => (
          <button
            className={
              currentMode === option.value
                ? "sheet-zoom-button is-active"
                : "sheet-zoom-button"
            }
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  function renderSheetDebugInfo(values: {
    viewportWidth: number;
    naturalWidth: number;
    scale: number;
    scrollLeft: number;
  }) {
    const scaledWidth = values.naturalWidth * values.scale;
    const maxScrollLeft = Math.max(
      0,
      scaledWidth + debugSettings.sheetScrollRightPadding - values.viewportWidth,
    );

    return (
      <div className="sheet-debug">
        {`vw:${values.viewportWidth.toFixed(1)} | nw:${values.naturalWidth.toFixed(1)} | scale:${values.scale.toFixed(3)} | sw:${scaledWidth.toFixed(1)} | pad:${debugSettings.sheetScrollRightPadding} | max:${maxScrollLeft.toFixed(1)} | left:${values.scrollLeft.toFixed(1)}`}
      </div>
    );
  }

  function getViewportMaxHeight(rowHeight: number): string {
    const headerHeight = 54;
    const rowsHeight = rowHeight * debugSettings.sheetVisibleRows;
    return `${headerHeight + rowsHeight}px`;
  }

  if (isReportDebugMode) {
    return (
      <div className="report-debug-shell">
        <A4CanvasBoard
          ref={pdfCanvasRef}
          abilityProfile={currentAbilityProfile}
          abilityRulesConfig={abilityRulesConfig}
          abilityLevelLabels={selectedAbilityLevelLabels}
          abilityScores={selectedAbilityScores}
          labels={selectedRecordItemLabels}
          record={selectedRecord}
          rosterName={data.rosterName}
          seatNumber={selectedSeatNumber}
          testDate={data.testDate}
        />
      </div>
    );
  }

  const isScannedInviteAlreadyFriend =
    Boolean(scannedFriendInvite) &&
    friends.some((friend) => friend.username === scannedFriendInvite?.issuedByUsername);
  const diagnosticEventsPreview = getDiagnosticEvents().slice(0, 8);
  const diagnosticEnvironmentPreview = getDiagnosticEnvironment();
  const diagnosticBrowserId = getDiagnosticBrowserId();

  return (
    <div
      className="app-shell"
      style={
        {
          "--summary-frozen-column-width": `${debugSettings.summaryFrozenColumnWidth}px`,
        } as CSSProperties
      }
    >
      <header className="hero">
        <div>
          <div className="hero-top">
            <div>
              <img
                alt="新北市運動遊戲體育協會 SGPEA 標誌"
                className="hero-logo"
                src={associationLogo}
              />
              <p className="eyebrow">新北市運動遊戲體育協會</p>
              <h1>體適能測驗管理工具</h1>
            </div>
            <div className="hero-auth">
              <div className="shared-date-field auth-entry">
                <button
                  className="secondary-button"
                  onClick={() => {
                    recordDiagnosticEvent("diagnostic.panel-toggled", "使用者開啟或關閉問題回報面板。", {
                      nextVisible: !showDiagnosticPanel,
                      uid: currentUser?.uid ?? null,
                      browserId: diagnosticBrowserId,
                      currentCloudFileId,
                      currentCloudFileOwnerUid,
                    });
                    setShowDiagnosticPanel((current) => !current);
                  }}
                  type="button"
                >
                  回報問題
                </button>
                {!currentUser ? (
                  <div className="button-row">
                    <button
                      className="primary-button"
                      disabled={!authReady}
                      onClick={() => {
                        setAuthMode("login");
                        setShowLoginPanel((current) =>
                          authMode === "login" ? !current : true,
                        );
                      }}
                      type="button"
                    >
                      {authReady ? "登入" : "登入初始化中"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!authReady}
                      onClick={() => {
                        setAuthMode("register");
                        setShowLoginPanel((current) =>
                          authMode === "register" ? !current : true,
                        );
                      }}
                      type="button"
                    >
                      註冊
                    </button>
                  </div>
                ) : (
                  <div className="account-menu-shell">
                    <button
                      className="secondary-button header-account-button"
                      onClick={() => setShowAccountMenu((current) => !current)}
                      type="button"
                    >
                      {`帳號：${currentDisplayName || "未命名使用者"}`}
                    </button>
                    {showAccountMenu ? (
                      <div className="account-dropdown">
                        <button
                          className="account-dropdown-item"
                          onClick={openAccountPanel}
                          type="button"
                        >
                          帳號管理
                        </button>
                        <button
                          className="account-dropdown-item"
                          onClick={handleSignOut}
                          type="button"
                        >
                          登出
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
          {!currentUser && showLoginPanel ? (
            <section className="auth-panel">
              <h2>{authMode === "login" ? "使用者登入" : "建立帳號"}</h2>
              <div className="auth-form-grid">
                <input
                  onChange={(event) => setLoginUsername(event.target.value)}
                  placeholder="帳號（例如 teacher01）"
                  type="text"
                  value={loginUsername}
                />
                <input
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="密碼"
                  type="password"
                  value={loginPassword}
                />
                <p className="auth-help">
                  帳號請使用 3 到 32 碼的小寫英數，可包含 .、_、-。系統會自動轉成內部使用的假 Email。
                </p>
                <div className="button-row">
                  <button
                    className="primary-button"
                    disabled={!authReady}
                    onClick={authMode === "login" ? handleSignIn : handleRegister}
                    type="button"
                  >
                    {authMode === "login" ? "登入" : "註冊"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setShowLoginPanel(false)}
                    type="button"
                  >
                    取消
                  </button>
                </div>
              </div>
            </section>
          ) : null}
          {showDiagnosticPanel ? (
            <section className="auth-panel diagnostic-panel">
              <h2>回報問題</h2>
              <p className="auth-help">
                請描述你遇到的狀況。系統會一併送出這個瀏覽器最近操作紀錄、登入狀態變化、目前檔案資訊與瀏覽器版面資料；不會送出密碼、token 或 cookie。
              </p>
              <div className="auth-form-grid diagnostic-form-grid">
                <input
                  onChange={(event) => setDiagnosticTitle(event.target.value)}
                  placeholder="問題標題（選填）"
                  type="text"
                  value={diagnosticTitle}
                />
                <textarea
                  className="diagnostic-textarea"
                  onChange={(event) => setDiagnosticDescription(event.target.value)}
                  placeholder="請描述發生了什麼事，例如：B 老師登入後仍看到 A 老師的檔案。"
                  value={diagnosticDescription}
                />
                <textarea
                  className="diagnostic-textarea"
                  onChange={(event) => setDiagnosticExpected(event.target.value)}
                  placeholder="預期結果（選填）"
                  value={diagnosticExpected}
                />
                <textarea
                  className="diagnostic-textarea"
                  onChange={(event) => setDiagnosticActual(event.target.value)}
                  placeholder="實際結果（選填）"
                  value={diagnosticActual}
                />
                <div className="diagnostic-summary">
                  <strong>即將附上的診斷摘要</strong>
                  <div className="diagnostic-summary-grid">
                    <span>登入帳號</span>
                    <span>{currentUser ? `${currentUsername} / ${currentUser.uid}` : "尚未登入，會以匿名回報送出"}</span>
                    <span>瀏覽器紀錄 ID</span>
                    <span>{diagnosticBrowserId}</span>
                    <span>目前檔案</span>
                    <span>{currentCloudFileSummary?.fileName ?? currentWorkspaceFileLabel}</span>
                    <span>版面大小</span>
                    <span>
                      {diagnosticEnvironmentPreview.viewport.width} × {diagnosticEnvironmentPreview.viewport.height}
                      ，{diagnosticEnvironmentPreview.device.estimatedDeviceType}
                    </span>
                    <span>最近事件</span>
                    <span>{diagnosticEventsPreview.length} 筆</span>
                  </div>
                  {diagnosticEventsPreview.length > 0 ? (
                    <ol className="diagnostic-event-preview">
                      {diagnosticEventsPreview.map((event) => (
                        <li key={`${event.timestamp}-${event.type}`}>
                          <code>{event.type}</code>
                          <span>{event.message}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
                <div className="button-row">
                  <button
                    className="primary-button"
                    disabled={diagnosticSubmitting}
                    onClick={handleSubmitDiagnosticReport}
                    type="button"
                  >
                    {diagnosticSubmitting ? "送出中" : "送出回報"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={diagnosticSubmitting}
                    onClick={() => setShowDiagnosticPanel(false)}
                    type="button"
                  >
                    取消
                  </button>
                </div>
                {!currentUser ? (
                  <p className="auth-help">目前尚未登入，回報會以匿名方式送出，但仍會包含這個瀏覽器最近的操作流程。</p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </header>

      {experimentalMode ? (
        <section className="startup-banner experimental-banner" aria-live="polite">
          <div className="startup-banner-head">
            <h2>實驗版頁面</h2>
            <p>這個入口和正式版共用同一套畫面與資料流，之後新的功能會先放在這裡測試，再決定是否複製回正式版。</p>
          </div>
        </section>
      ) : null}

      {frontendIssues.length > 0 ? (
        <section className="startup-banner" aria-live="polite">
          <div className="startup-banner-head">
            <h2>前端載入檢查</h2>
            <p>{summarizeFrontendStatus(loadCheckpoints)}</p>
          </div>
          <div className="startup-checkpoint-grid">
            {(Object.entries(loadCheckpoints) as Array<[LoadCheckpointKey, LoadCheckpointState]>).map(
              ([key, checkpoint]) => (
                <article
                  className={`startup-checkpoint is-${checkpoint.status}`}
                  key={key}
                >
                  <strong>{checkpoint.label}</strong>
                  <span>{checkpoint.detail}</span>
                </article>
              ),
            )}
          </div>
          <div className="startup-issues">
            <strong>目前偵測到的前端問題</strong>
            <ul>
              {frontendIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <p>如果問題持續發生，請將這段訊息截圖給維護者。</p>
          </div>
        </section>
      ) : null}

      {isFriendInvitePage ? (
        <main className="panel-grid">
          <section className="panel friend-invite-page">
            <div className="panel-header">
              <div>
                <h2>加入好友邀請</h2>
              </div>
            </div>
            <div className="friend-empty-state friend-invite-state">
              {scannedFriendInvite ? (
                <>
                  <strong>
                    {scannedFriendInvite.issuedByDisplayName ||
                      scannedFriendInvite.issuedByUsername}
                  </strong>
                  <p>{formatInviteExpiry(scannedFriendInvite.expiresAt)}</p>
                  {!currentUser ? (
                    <p>請先登入，再把這位老師加入好友。</p>
                  ) : scannedFriendInvite.issuedByUid === currentUser.uid ? (
                    <p>這是你自己的行動條碼。</p>
                  ) : isScannedInviteAlreadyFriend ? (
                    <p>你們已經是好友了，不需要再送出邀請。</p>
                  ) : (
                    <p>確認後會送出好友邀請，對方同意後就會加入好友列表。</p>
                  )}
                </>
              ) : (
                <>
                  <strong>找不到這張好友邀請</strong>
                  <p>這個邀請可能已失效、過期，或網址不完整。</p>
                </>
              )}
              <div className="friend-row-actions">
                {scannedFriendInvite &&
                currentUser &&
                scannedFriendInvite.issuedByUid !== currentUser.uid &&
                !isScannedInviteAlreadyFriend ? (
                  <button
                    className="primary-button"
                    disabled={friendInviteActionState.status === "loading"}
                    onClick={() => {
                      void handleSendFriendRequestFromQr();
                    }}
                    type="button"
                  >
                    {friendInviteActionState.status === "loading"
                      ? "送出中"
                      : "送出好友邀請"}
                  </button>
                ) : null}
                <button
                  className="secondary-button"
                  disabled={friendInviteActionState.status === "loading"}
                  onClick={closeFriendInvitePage}
                  type="button"
                >
                  {scannedFriendInvite &&
                  currentUser &&
                  scannedFriendInvite.issuedByUid !== currentUser.uid &&
                  !isScannedInviteAlreadyFriend
                    ? "取消邀請"
                    : "回到主頁"}
                </button>
              </div>
              {friendInviteActionState.status !== "idle" ? (
                <div
                  className={`friend-invite-status is-${friendInviteActionState.status}`}
                >
                  {friendInviteActionState.detail}
                </div>
              ) : null}
              {friendInviteTraceEntries.length > 0 ? (
                <div className="friend-invite-trace">
                  <strong>最近操作紀錄</strong>
                  <ul>
                    {friendInviteTraceEntries.map((entry, index) => (
                      <li key={`${entry.timestamp}-${index}`}>
                        [{new Date(entry.timestamp).toLocaleTimeString("zh-TW", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}] {entry.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        </main>
      ) : (
        <>

          <nav
            className={`tab-bar tab-bar--${mobileTabVariant} tab-bar--underline-main`}
            aria-label="主要功能"
          >
            {visibleTabs.map((tab) => (
              <button
                className={tab.key === activeTab ? "tab is-active" : "tab"}
                key={tab.key}
                onClick={() => {
                  void handleTabChange(tab.key);
                }}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <main className="panel-grid">
        {activeTab === "table" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>測驗總表</h2>
                </div>
              </div>
              {renderIncomingFriendAlertCard()}
              {renderWorkspaceFileCard()}
              <div className="table-toolbar-row">
                {renderSheetZoomToolbar(
                  tableZoomMode,
                  setTableZoomMode,
                  TABLE_SHEET_ZOOM_OPTIONS,
                )}
                <button
                  className="primary-button"
                  onClick={() => setShowTableFilters((current) => !current)}
                  type="button"
                >
                  {showTableFilters ? "收起篩選器" : "展開篩選器"}
                </button>
              </div>
              {data.records.length === 0 ? renderNoStudentsCard("測驗總表") : null}
              {data.records.length > 0 && showTableFilters ? (
                <div className="table-filter-panel">
                  {isMixedAgeClass(data.gradeLabel) ? (
                    <div className="table-filter-section">
                      <strong>年級篩選</strong>
                      <label className="filter-toggle">
                        <input
                          checked={
                            selectedTableGrades.length ===
                            TABLE_GRADE_CHECKBOX_OPTIONS.length
                          }
                          onChange={(event) =>
                            setSelectedTableGrades(
                              event.target.checked ? TABLE_GRADE_CHECKBOX_OPTIONS : [],
                            )
                          }
                          type="checkbox"
                        />
                        全部年級
                      </label>
                      <div className="table-grade-filter-grid">
                        {TABLE_GRADE_CHECKBOX_OPTIONS.map((grade) => (
                          <label className="filter-toggle" key={grade}>
                            <input
                              checked={selectedTableGrades.includes(grade)}
                              onChange={(event) =>
                                setSelectedTableGrades((current) =>
                                  event.target.checked
                                    ? current.includes(grade)
                                      ? current
                                      : [...current, grade]
                                    : current.filter((item) => item !== grade),
                                )
                              }
                              type="checkbox"
                            />
                            {grade}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="table-filter-section">
                    <strong>顯示條件</strong>
                    <label className="filter-toggle">
                      <input
                        checked={showIncompleteOnly}
                        onChange={(event) => setShowIncompleteOnly(event.target.checked)}
                        type="checkbox"
                      />
                      只顯示未完成學生
                    </label>
                  </div>
                  <div className="table-filter-section">
                    <strong>排序方式</strong>
                    <label className="shared-date-field table-filter-field">
                      <select
                        className="search-input"
                        onChange={(event) =>
                          setTableSortKey(event.target.value as TableSortKey)
                        }
                        value={tableSortKey}
                      >
                        {TABLE_SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}
              {data.records.length > 0 ? (
              <div className="sheet-shell">
                {debugSettings.showSheetDebug
                  ? renderSheetDebugInfo({
                      viewportWidth: tableViewportWidth,
                      naturalWidth: tableNaturalWidth,
                      scale: tableScale,
                      scrollLeft: tableViewportRef.current?.scrollLeft ?? 0,
                    })
                  : null}
                <div
                  className="sheet-viewport sheet-viewport-capped table-wrap"
                  onScroll={() =>
                    handleViewportScroll(
                      tableViewportRef.current,
                      tableNaturalWidth * tableScale,
                    )
                  }
                  ref={tableViewportRef}
                  style={{ maxHeight: getViewportMaxHeight(54) }}
                >
                  <div
                    className="sheet-zoom-stage"
                    style={{
                      width: `${tableNaturalWidth * tableScale}px`,
                      height: "100%",
                    }}
                  >
                    <table
                      className="table-editor sheet-playground summary-sheet"
                      ref={tableTableRef}
                      style={{
                        transform: `scale(${tableScale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <thead>
                        <tr>
                          <th className="is-frozen-column">學生姓名</th>
                          {isMixedAgeClass(data.gradeLabel) ? <th>學生年級</th> : null}
                          <th>身高</th>
                          <th>體重</th>
                          {scoreFields.map((field, index) => (
                            <th key={field}>
                              <span className="metric-header-title">
                                {resolvedItemLabels[index]}
                              </span>
                              <small className="metric-header-range">
                                {getMetricRangeHint(field)}
                              </small>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRecords.map((record) => (
                          <tr
                            className={record.id === selectedId ? "is-selected" : ""}
                            key={record.id}
                            onClick={() => selectRecord(record)}
                          >
                            <td className="is-frozen-column">
                              {renderTableCell(record, "studentName", record.studentName)}
                            </td>
                            {isMixedAgeClass(data.gradeLabel) ? (
                              <td>
                                {renderTableCell(
                                  record,
                                  "studentGradeLabel",
                                  record.studentGradeLabel,
                                  {
                                    inputType: "select",
                                    displayValue: record.studentGradeLabel,
                                    selectOptions: STUDENT_GRADE_OPTIONS.map((grade) => ({
                                      value: grade,
                                      label: grade,
                                    })),
                                  },
                                )}
                              </td>
                            ) : null}
                            <td>{renderTableCell(record, "height", record.height)}</td>
                            <td>{renderTableCell(record, "weight", record.weight)}</td>
                            {scoreFields.map((field) => (
                              <td key={field}>
                                {renderTableCell(record, field, record[field], {
                                  inputType:
                                    getMetricRule(field, record)?.kind === "rubric"
                                      ? "select"
                                      : "number",
                                  min: 0,
                                  step: 1,
                                  className: "cell-input-number",
                                  displayValue: getMetricDisplayValue(record, field),
                                  selectOptions: getMetricSelectOptions(field, record),
                                })}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              ) : null}
            </section>
          </>
        ) : null}

        {activeTab === "files" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>編輯檔案</h2>
                </div>
                <div className="button-row">
                  {currentCloudFileId && isCloudDirty ? (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        void handleSaveCurrentCloudFile();
                      }}
                      type="button"
                    >
                      儲存目前檔案
                    </button>
                  ) : null}
                  <button
                    className="primary-button"
                    disabled={!currentUser}
                    onClick={() => {
                      setShowFileSwitcher(false);
                      setShowCreateFilePage(true);
                    }}
                    type="button"
                  >
                    建立新檔案
                  </button>
                </div>
              </div>
              {renderIncomingFriendAlertCard()}
              {!currentUser ? (
                <div className="file-list-shell">
                  <div className="friend-empty-state">
                    <strong>尚未登入</strong>
                    <p>請先註冊並登入，之後才能在自己的帳號下建立雲端檔案。</p>
                  </div>
                </div>
              ) : cloudFiles.length === 0 ? (
                <div className="file-list-shell">
                  <div className="file-list-head">
                    <p>目前還沒有檔案。</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="file-current-shell">
                    <div className="workspace-file-card file-current-card">
                      <div>
                        <strong>目前使用檔案</strong>
                        <span>{currentWorkspaceFileLabel}</span>
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() => setShowFileSwitcher((current) => !current)}
                        type="button"
                      >
                        {showFileSwitcher ? "收合切換器" : "切換檔案"}
                      </button>
                    </div>
                    {showFileSwitcher ? (
                      <div className="file-switcher-card">
                        <label className="file-switcher-field">
                          <strong>選擇檔案</strong>
                          <select
                            onChange={(event) => setPendingSwitchFileKey(event.target.value)}
                            value={pendingSwitchFileKey}
                          >
                            {sortedCloudFiles.map((file) => (
                              <option
                                key={`${file.ownerUid}:${file.id}`}
                                value={`${file.ownerUid}:${file.id}`}
                              >
                                {file.accessRole === "owner" ? "" : "【共享】"}{file.academicTerm}／{file.rosterName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="file-switcher-actions">
                          <button
                            className="secondary-button"
                            onClick={() => setShowFileSwitcher(false)}
                            type="button"
                          >
                            取消
                          </button>
                          <button
                            className="primary-button"
                            disabled={
                              !pendingSwitchFile ||
                              `${pendingSwitchFile.ownerUid}:${pendingSwitchFile.id}` ===
                                currentCloudFileKey
                            }
                            onClick={() => {
                              if (!pendingSwitchFile) {
                                return;
                              }
                              setShowFileSwitcher(false);
                              void handleOpenCloudFile(pendingSwitchFile);
                            }}
                            type="button"
                          >
                            確認切換
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="file-list-shell">
                    {showCreateFilePage ? (
                      <>
                        <div className="panel-header">
                          <div>
                            <h3>建立新檔案</h3>
                          </div>
                        </div>
                        <div className="file-detail-grid">
                          <label>
                            <strong>學年度</strong>
                            <select
                              onChange={(event) =>
                                updateNewCloudFileDraft("academicYear", event.target.value)
                              }
                              value={newCloudFileDraft.academicYear}
                            >
                              {ACADEMIC_YEAR_OPTIONS.map((year) => (
                                <option key={year} value={year}>
                                  民國 {year} 年
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <strong>班級名稱</strong>
                            <input
                              onChange={(event) =>
                                updateNewCloudFileDraft("rosterName", event.target.value)
                              }
                              type="text"
                              value={newCloudFileDraft.rosterName}
                            />
                          </label>
                          <label>
                            <strong>學期</strong>
                            <select
                              onChange={(event) =>
                                updateNewCloudFileDraft("semester", event.target.value)
                              }
                              value={newCloudFileDraft.semester}
                            >
                              {TERM_OPTIONS.map((term) => (
                                <option key={term} value={term}>
                                  {term}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <strong>年級</strong>
                            <select
                              onChange={(event) =>
                                updateNewCloudFileDraft("gradeLabel", event.target.value)
                              }
                              value={newCloudFileDraft.gradeLabel}
                            >
                              {GRADE_OPTIONS.map((grade) => (
                                <option key={grade} value={grade}>
                                  {grade}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <strong>測驗日期</strong>
                            <input
                              onChange={(event) =>
                                updateNewCloudFileDraft("testDate", event.target.value)
                              }
                              type="date"
                              value={newCloudFileDraft.testDate}
                            />
                          </label>
                          <label className="file-size-field">
                            <strong>班級人數</strong>
                            <input
                              min={1}
                              onChange={(event) =>
                                updateNewCloudFileDraft("rosterCount", event.target.value)
                              }
                              type="number"
                              value={newCloudFileDraft.rosterCount}
                            />
                          </label>
                        </div>
                        <div className="file-accordion-actions">
                          <button
                            className="secondary-button"
                            onClick={() => setShowCreateFilePage(false)}
                            type="button"
                          >
                            取消
                          </button>
                          <button
                            className="primary-button"
                            onClick={() => {
                              void handleCreateCloudFileFromDraft();
                            }}
                            type="button"
                          >
                            建立新檔案
                          </button>
                        </div>
                      </>
                    ) : currentCloudFileSummary ? (
                      <>
                        <div className="file-detail-grid">
                          <label>
                            <strong>學年度</strong>
                            <select
                              disabled={!currentCloudFileIsOwner}
                              onChange={(event) =>
                                updateAcademicTermPart("academicYear", event.target.value)
                              }
                              value={parseAcademicTermParts(data.academicTerm).academicYear}
                            >
                              {ACADEMIC_YEAR_OPTIONS.map((year) => (
                                <option key={year} value={year}>
                                  民國 {year} 年
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <strong>班級名稱</strong>
                            <input
                              disabled={!currentCloudFileIsOwner}
                              onChange={(event) => updateRosterName(event.target.value)}
                              type="text"
                              value={data.rosterName}
                            />
                          </label>
                          <label>
                            <strong>學期</strong>
                            <select
                              disabled={!currentCloudFileIsOwner}
                              onChange={(event) =>
                                updateAcademicTermPart("semester", event.target.value)
                              }
                              value={parseAcademicTermParts(data.academicTerm).semester}
                            >
                              {TERM_OPTIONS.map((term) => (
                                <option key={term} value={term}>
                                  {term}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <strong>年級</strong>
                            <select
                              disabled={!currentCloudFileIsOwner}
                              onChange={(event) => updateGradeLabel(event.target.value)}
                              value={data.gradeLabel}
                            >
                              <option value="">未設定</option>
                              {GRADE_OPTIONS.map((grade) => (
                                <option key={grade} value={grade}>
                                  {grade}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <strong>測驗日期</strong>
                            <input
                              disabled={!currentCloudFileIsOwner}
                              onChange={(event) => updateSharedTestDate(event.target.value)}
                              type="date"
                              value={data.testDate}
                            />
                          </label>
                          <label className="file-size-field">
                            <strong>班級人數</strong>
                            <div className="file-size-row">
                              <input
                                disabled={!currentCloudFileIsOwner}
                                min={1}
                                onBlur={(event) => applyRosterSize(event.target.value)}
                                onChange={(event) => setRosterSizeInput(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    applyRosterSize((event.target as HTMLInputElement).value);
                                  }
                                }}
                                type="number"
                                value={rosterSizeInput}
                              />
                            </div>
                          </label>
                          <label>
                            <strong>檔案擁有者</strong>
                            <div className="static-field">
                              {currentCloudFileSummary.ownerDisplayName ||
                                currentCloudFileSummary.ownerUsername}
                              {currentCloudFileSummary.ownerUid === currentUser?.uid ? "（你）" : ""}
                            </div>
                          </label>
                          <label>
                            <strong>你的權限</strong>
                            <div className="static-field">
                              {currentCloudFileSummary.accessRole === "owner" ? "擁有者" : "共同編輯"}
                            </div>
                          </label>
                        </div>
                        {currentCloudFileSummary.accessRole === "owner" ? (
                          <div className="file-share-section">
                            <div className="friend-section-header">
                              <h4>共同編輯好友</h4>
                            </div>
                            {shareableFriends.length === 0 ? (
                              <div className="friend-empty-state">
                                <strong>目前還沒有可分享的好友</strong>
                                <p>先到帳號管理加入好友，之後就能把檔案分享給對方共同編輯。</p>
                              </div>
                            ) : (
                              <div className="file-share-controls">
                                {sharedEditorFriends.length > 0 ? (
                                  <div className="file-share-current-list">
                                    {sharedEditorFriends.map((friend) => (
                                      <div className="file-share-current-item" key={friend.friendUid}>
                                        <span>{friend.displayName}</span>
                                        <button
                                          className="secondary-button"
                                          onClick={() => {
                                            void handleRemoveFileEditor(
                                              currentCloudFileSummary,
                                              friend.friendUid,
                                            );
                                          }}
                                          type="button"
                                        >
                                          取消分享
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="file-share-hint">目前還沒有共同編輯好友。</p>
                                )}
                                <div className="file-share-row">
                                  <select
                                    onChange={(event) =>
                                      setSelectedShareFriendUid(event.target.value)
                                    }
                                    value={selectedShareFriendUid}
                                  >
                                    <option value="">選擇好友暱稱</option>
                                    {availableShareFriends.map((friend) => (
                                      <option key={friend.friendUid} value={friend.friendUid}>
                                        {friend.displayName}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    className="secondary-button"
                                    disabled={!selectedShareFriendUid}
                                    onClick={() => {
                                      void handleShareFileWithFriend(currentCloudFileSummary);
                                    }}
                                    type="button"
                                  >
                                    分享
                                  </button>
                                </div>
                                {availableShareFriends.length === 0 ? (
                                  <p className="file-share-hint">目前沒有其他好友可再分享。</p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        ) : null}
                        <div className="file-status-row">
                          <span className={isCloudDirty ? "status-chip is-active" : "status-chip"}>
                            {isCloudDirty ? "目前使用中・尚未儲存" : "目前使用中"}
                          </span>
                          <span>
                            最近更新{" "}
                            {currentCloudFileSummary.updatedAt
                              ? formatActivityDate(currentCloudFileSummary.updatedAt)
                              : "剛建立"}
                          </span>
                        </div>
                        {debugSettings.showFileOpenTrace && fileOpenTraceEntries.length > 0 ? (
                          <div className="friend-alert-card file-open-trace-card">
                            <div className="friend-alert-card-head">
                              <strong>切換檔案除錯資訊</strong>
                              <span>最近 {fileOpenTraceEntries.length} 筆</span>
                            </div>
                            <div className="friend-alert-list">
                              {fileOpenTraceEntries.map((entry, index) => (
                                <div className="friend-alert-item" key={`${entry.timestamp}-${index}`}>
                                  <div className="friend-alert-copy">
                                    <strong>
                                      [{new Date(entry.timestamp).toLocaleTimeString("zh-TW")}]
                                    </strong>
                                    <small>{entry.detail}</small>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="file-accordion-actions">
                          <button
                            className="primary-button"
                            disabled={!isCloudDirty}
                            onClick={() => {
                              void handleSaveCurrentCloudFile();
                            }}
                            type="button"
                          >
                            儲存目前檔案
                          </button>
                          {currentCloudFileSummary.accessRole === "owner" ? (
                            <button
                              className="danger-button"
                              onClick={() => {
                                void handleArchiveCloudFile(currentCloudFileSummary);
                              }}
                              type="button"
                            >
                              刪除檔案
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="friend-empty-state">
                        <strong>尚未開啟檔案</strong>
                        <p>請先建立新檔案，或從切換檔案選單中選取一份檔案。</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </>
        ) : null}

        {activeTab === "account" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>帳號管理</h2>
                </div>
              </div>
              {renderIncomingFriendAlertCard()}

              <div className="account-center-grid">
                <article className="account-card">
                  <h3>基本資料</h3>
                  <div className="auth-profile-grid">
                    <div>
                      <strong>帳號</strong>
                      <div>{currentUser ? currentUsername : "尚未登入"}</div>
                    </div>
                    <div>
                      <strong>我的暱稱</strong>
                      {currentUser ? (
                        <div className="friend-alias-form">
                          <input
                            onChange={(event) => setNicknameDraft(event.target.value)}
                            placeholder="例如 王老師、小熊教練"
                            type="text"
                            value={nicknameDraft}
                          />
                          <div className="friend-row-actions">
                            <button
                              className="primary-button"
                              onClick={() => {
                                void handleSaveOwnNickname();
                              }}
                              type="button"
                            >
                              儲存暱稱
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => setNicknameDraft("")}
                              type="button"
                            >
                              清空
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>尚未登入</div>
                      )}
                    </div>
                    <div>
                      <strong>狀態</strong>
                      <div>{currentUser ? "已登入" : "尚未登入"}</div>
                    </div>
                  </div>
                </article>

                <article className="account-card">
                  <div className="account-card-head">
                    <div>
                      <h3>好友列表</h3>
                    </div>
                  </div>
                  {!currentUser ? (
                    <div className="friend-empty-state">
                      <strong>尚未登入</strong>
                      <p>登入後才會顯示你的好友列表。</p>
                    </div>
                  ) : friends.length === 0 ? (
                    <div className="friend-empty-state">
                      <strong>目前還沒有好友</strong>
                      <p>可以先從上方輸入帳號送出邀請，等對方確認後會顯示在這裡。</p>
                    </div>
                  ) : (
                    <div className="friend-list">
                      {friends.map((friend) => {
                        const isExpanded = expandedFriendUids.includes(friend.friendUid);
                        return (
                          <div className="friend-row" key={friend.friendUid}>
                            <div className="friend-row-summary">
                              <strong>{getFriendDisplayName(friend)}</strong>
                              <button
                                className="secondary-button"
                                onClick={() => toggleFriendDetails(friend.friendUid)}
                                type="button"
                              >
                                {isExpanded ? "收合" : "展開"}
                              </button>
                            </div>
                            {isExpanded ? (
                              <div className="friend-row-main">
                                <div className="friend-identity">
                                  <small>帳號：{friend.username}</small>
                                  {friend.customNickname ? (
                                    <small>
                                      好友原本暱稱：
                                      {friend.profileNickname || friend.username}
                                    </small>
                                  ) : null}
                                </div>
                                <div className="friend-alias-form">
                                  <input
                                    onChange={(event) =>
                                      updateFriendNicknameDraft(
                                        friend.friendUid,
                                        event.target.value,
                                      )
                                    }
                                    placeholder={friend.profileNickname || friend.username}
                                    type="text"
                                    value={friendNicknameDrafts[friend.friendUid] ?? ""}
                                  />
                                  <div className="friend-row-actions">
                                    <button
                                      className="primary-button"
                                      onClick={() => {
                                        void handleSaveFriendNickname(friend);
                                      }}
                                      type="button"
                                    >
                                      儲存備註
                                    </button>
                                    <button
                                      className="secondary-button"
                                      onClick={() => {
                                        void handleResetFriendNickname(friend);
                                      }}
                                      type="button"
                                    >
                                      恢復好友暱稱
                                    </button>
                                  </div>
                                </div>
                                <div className="friend-row-footer">
                                  <small>
                                    成為好友時間 {formatActivityDate(friend.addedAt)}
                                  </small>
                                  <button
                                    className="secondary-button"
                                    onClick={() => {
                                      void handleRemoveFriend(friend);
                                    }}
                                    type="button"
                                  >
                                    移除
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article className="account-card">
                  <div className="account-card-head">
                    <div>
                      <h3>好友邀請</h3>
                    </div>
                  </div>

                  <div className="friend-section">
                    <div className="friend-section-header">
                      <h4>新增好友</h4>
                      <button
                        className="secondary-button"
                        disabled={!currentUser}
                        onClick={() => {
                          void handleCreateFriendInvite();
                        }}
                        type="button"
                      >
                        顯示行動條碼
                      </button>
                    </div>

                    <div className="friend-toolbar">
                      <input
                        disabled={!currentUser}
                        onChange={(event) => setFriendDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleAddFriend();
                          }
                        }}
                        placeholder="輸入好友帳號，例如 coach.lin"
                        type="text"
                        value={friendDraft}
                      />
                      <button
                        className="primary-button"
                        disabled={!currentUser}
                        onClick={() => {
                          void handleAddFriend();
                        }}
                        type="button"
                      >
                        送出邀請
                      </button>
                    </div>

                    {activeFriendInvite && friendInviteQrDataUrl ? (
                      <div className="friend-qr-card">
                        <img
                          alt={`加 ${activeFriendInvite.issuedByUsername} 好友的 QR Code`}
                          className="friend-qr-image"
                          src={friendInviteQrDataUrl}
                        />
                        <div className="friend-qr-copy">
                          <strong>
                            {activeFriendInvite.issuedByDisplayName ||
                              activeFriendInvite.issuedByUsername}
                          </strong>
                          <small>{formatInviteExpiry(activeFriendInvite.expiresAt)}</small>
                          <p>讓對方掃描後登入自己的帳號，就能送出好友邀請給你。</p>
                          {activeFriendInviteUrl ? (
                            <a
                              className="friend-qr-link"
                              href={activeFriendInviteUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {activeFriendInviteUrl}
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {!currentUser ? (
                    <div className="friend-empty-state">
                      <strong>尚未登入</strong>
                      <p>登入後才會顯示你的好友列表，也才能送出好友邀請。</p>
                    </div>
                  ) : (
                    <>
                      <div className="friend-section">
                        <h4>收到的邀請</h4>
                        {incomingFriendRequests.length === 0 ? (
                          <div className="friend-empty-state">
                            <strong>目前沒有待確認邀請</strong>
                            <p>之後如果有老師加你好友，這裡會即時顯示。</p>
                          </div>
                        ) : (
                          <div className="friend-list">
                            {incomingFriendRequests.map((request) => (
                              <div className="friend-row friend-row-alert" key={request.id}>
                                <div>
                                  <strong>{getIncomingRequestDisplayName(request)}</strong>
                                  <small>
                                    送出時間 {formatActivityDate(request.createdAt)}
                                  </small>
                                </div>
                                <div className="friend-row-actions">
                                  <button
                                    className="primary-button"
                                    onClick={() => {
                                      void handleAcceptFriendRequest(request);
                                    }}
                                    type="button"
                                  >
                                    同意
                                  </button>
                                  <button
                                    className="secondary-button"
                                    onClick={() => {
                                      void handleRejectFriendRequest(request);
                                    }}
                                    type="button"
                                  >
                                    拒絕
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="friend-section">
                        <h4>已送出的邀請</h4>
                        {outgoingFriendRequests.length === 0 ? (
                          <div className="friend-empty-state">
                            <strong>目前沒有送出的邀請</strong>
                            <p>你送出的好友邀請會先留在這裡，等待對方確認。</p>
                          </div>
                        ) : (
                          <div className="friend-list">
                            {outgoingFriendRequests.map((request) => (
                              <div className="friend-row" key={request.id}>
                                <div>
                                  <strong>{request.toDisplayName || request.toUsername}</strong>
                                  <small>
                                    送出時間 {formatActivityDate(request.createdAt)}
                                  </small>
                                </div>
                                <div className="friend-row-actions">
                                  <span className="status-chip">等待對方確認</span>
                                  <button
                                    className="secondary-button"
                                    onClick={() => {
                                      void handleCancelOutgoingFriendRequest(request);
                                    }}
                                    type="button"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </>
                  )}
                </article>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "metric" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>測驗項目</h2>
                </div>
              </div>
              {renderIncomingFriendAlertCard()}
              {renderWorkspaceFileCard()}
              {data.records.length === 0 ? renderNoStudentsCard("測驗項目") : null}

              {data.records.length > 0 ? (
                <>
                  <div className="metric-toolbar">
                    {scoreFields.map((field, index) => (
                      <button
                        className={field === activeMetric ? "metric-pill is-active" : "metric-pill"}
                        key={field}
                        onClick={() => setActiveMetric(field)}
                        type="button"
                      >
                        {resolvedItemLabels[index]}
                      </button>
                    ))}
                  </div>

                  <div className="sheet-shell">
                    {debugSettings.showSheetDebug
                      ? renderSheetDebugInfo({
                          viewportWidth: metricViewportWidth,
                          naturalWidth: metricNaturalWidth,
                          scale: metricScale,
                          scrollLeft: metricViewportRef.current?.scrollLeft ?? 0,
                        })
                      : null}
                    <div
                      className="sheet-viewport sheet-viewport-capped table-wrap"
                      onScroll={() =>
                        handleViewportScroll(
                          metricViewportRef.current,
                          metricNaturalWidth * metricScale,
                        )
                      }
                      ref={metricViewportRef}
                      style={{ maxHeight: getViewportMaxHeight(54) }}
                    >
                      <div
                        className="sheet-zoom-stage"
                        style={{
                          width: `${metricNaturalWidth * metricScale}px`,
                          height: "100%",
                        }}
                      >
                        <table
                          className="table-editor metric-editor sheet-playground summary-sheet"
                          ref={metricTableRef}
                          style={{
                            transform: `scale(${metricScale})`,
                            transformOrigin: "top left",
                          }}
                        >
                          <thead>
                            <tr>
                              <th className="is-frozen-column">學生姓名</th>
                              {isMixedAgeClass(data.gradeLabel) ? <th>學生年級</th> : null}
                              <th>{activeMetricLabel}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.records.map((record) => (
                              <tr
                                className={record.id === selectedId ? "is-selected" : ""}
                                key={record.id}
                                onClick={() => selectRecord(record)}
                              >
                                <td className="is-frozen-column">{record.studentName}</td>
                                {isMixedAgeClass(data.gradeLabel) ? (
                                  <td>{record.studentGradeLabel}</td>
                                ) : null}
                                <td>
                                  {renderTableCell(record, activeMetric, record[activeMetric], {
                                    inputType:
                                      getMetricRule(activeMetric, record)?.kind === "rubric"
                                        ? "select"
                                        : "number",
                                    min: 0,
                                    navigationFields: [activeMetric],
                                    step: 1,
                                    className: "cell-input-number",
                                    displayValue: getMetricDisplayValue(record, activeMetric),
                                    selectOptions: getMetricSelectOptions(activeMetric, record),
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </section>
          </>
        ) : null}

        {activeTab === "editor" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>單筆編輯</h2>
                  <p>適合針對單一學生做完整填寫與調整。</p>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  學生姓名
                  <input
                    onChange={(event) =>
                      updateDraftField("studentName", event.target.value)
                    }
                    value={draftRecord.studentName}
                  />
                </label>
                <label>
                  身高
                  <input
                    onChange={(event) => updateDraftField("height", event.target.value)}
                    value={draftRecord.height}
                  />
                </label>
                <label>
                  體重
                  <input
                    onChange={(event) => updateDraftField("weight", event.target.value)}
                    value={draftRecord.weight}
                  />
                </label>
                {isMixedAgeClass(data.gradeLabel) ? (
                  <label>
                    學生年級
                    <select
                      onChange={(event) =>
                        updateDraftField("studentGradeLabel", event.target.value)
                      }
                      value={draftRecord.studentGradeLabel}
                    >
                      {STUDENT_GRADE_OPTIONS.map((grade) => (
                        <option key={`draft-${grade}`} value={grade}>
                          {grade}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {scoreFields.map((field, index) => (
                  <label key={field}>
                    {getMetricRule(field, draftRecord)?.metricLabel ?? resolvedItemLabels[index]}
                    {getMetricRule(field, draftRecord)?.kind === "rubric" ? (
                      <select
                        onChange={(event) => updateScore(field, event.target.value)}
                        value={draftRecord[field]}
                      >
                        <option value="0">未填寫</option>
                        {getMetricSelectOptions(field, draftRecord).map((option) => (
                          <option key={`${field}-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        min="0"
                        onChange={(event) => updateScore(field, event.target.value)}
                        step="1"
                        type="number"
                        value={draftRecord[field]}
                      />
                    )}
                  </label>
                ))}
                <label className="full-span">
                  評語
                  <textarea
                    onChange={(event) =>
                      updateDraftField("comment", event.target.value)
                    }
                    rows={4}
                    value={draftRecord.comment}
                  />
                </label>
              </div>
              <div className="button-row">
                <button className="primary-button" onClick={saveDraft} type="button">
                  儲存資料
                </button>
                <button className="danger-button" onClick={deleteSelected} type="button">
                  刪除目前選取
                </button>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "roster" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>學員名單</h2>
                </div>
              </div>
              {renderIncomingFriendAlertCard()}
              {renderWorkspaceFileCard()}

              <div className="roster-editor">
                <div className="sheet-shell">
                  {debugSettings.showSheetDebug
                    ? renderSheetDebugInfo({
                        viewportWidth: rosterViewportWidth,
                        naturalWidth: rosterNaturalWidth,
                        scale: rosterScale,
                        scrollLeft: rosterViewportRef.current?.scrollLeft ?? 0,
                      })
                    : null}
                  <div
                    className="sheet-viewport sheet-viewport-capped table-wrap"
                    onScroll={() =>
                      handleViewportScroll(
                        rosterViewportRef.current,
                        rosterNaturalWidth * rosterScale,
                      )
                    }
                    ref={rosterViewportRef}
                    style={{ maxHeight: getViewportMaxHeight(50) }}
                  >
                    <div
                      className="sheet-zoom-stage"
                      style={{
                        width: `${rosterNaturalWidth * rosterScale}px`,
                        height: "100%",
                      }}
                    >
                      <table
                        className="sheet-playground roster-sheet"
                        ref={rosterTableRef}
                        style={{
                          transform: `scale(${rosterScale})`,
                          transformOrigin: "top left",
                        }}
                      >
                        <thead>
                          <tr>
                            <th className="is-frozen-column">#</th>
                            <th className="is-frozen-column-secondary">姓名</th>
                            <th>身高</th>
                            <th>體重</th>
                            {isMixedAgeClass(data.gradeLabel) ? <th>學生年級</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {rosterDraft.map((entry, index) => (
                            <tr key={entry.id}>
                              <td className="is-frozen-column">{index + 1}</td>
                              <td className="is-frozen-column-secondary">
                                {rosterActiveCell?.rowIndex === index &&
                                rosterActiveCell?.columnIndex === 0 ? (
                                  <input
                                    autoFocus
                                    className="sheet-input"
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={() => setRosterActiveCell(null)}
                                    onChange={(event) =>
                                      updateRosterDraftCell(index, 0, event.target.value)
                                    }
                                    onKeyDown={(event) =>
                                      handleRosterKeyDown(event, index, 0)
                                    }
                                    onPaste={(event) =>
                                      handleRosterPaste(event, index, 0)
                                    }
                                    value={entry.studentName}
                                  />
                                ) : (
                                  <button
                                    className="sheet-cell"
                                    onClick={() =>
                                      setRosterActiveCell({ rowIndex: index, columnIndex: 0 })
                                    }
                                    type="button"
                                  >
                                    {entry.studentName || "—"}
                                  </button>
                                )}
                              </td>
                              <td>
                                {rosterActiveCell?.rowIndex === index &&
                                rosterActiveCell?.columnIndex === 1 ? (
                                  <input
                                    autoFocus
                                    className="sheet-input"
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={() => setRosterActiveCell(null)}
                                    onChange={(event) =>
                                      updateRosterDraftCell(index, 1, event.target.value)
                                    }
                                    onKeyDown={(event) =>
                                      handleRosterKeyDown(event, index, 1)
                                    }
                                    onPaste={(event) =>
                                      handleRosterPaste(event, index, 1)
                                    }
                                    value={entry.height}
                                  />
                                ) : (
                                  <button
                                    className="sheet-cell"
                                    onClick={() =>
                                      setRosterActiveCell({ rowIndex: index, columnIndex: 1 })
                                    }
                                    type="button"
                                  >
                                    {entry.height || "—"}
                                  </button>
                                )}
                              </td>
                              <td>
                                {rosterActiveCell?.rowIndex === index &&
                                rosterActiveCell?.columnIndex === 2 ? (
                                  <input
                                    autoFocus
                                    className="sheet-input"
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={() => setRosterActiveCell(null)}
                                    onChange={(event) =>
                                      updateRosterDraftCell(index, 2, event.target.value)
                                    }
                                    onKeyDown={(event) =>
                                      handleRosterKeyDown(event, index, 2)
                                    }
                                    onPaste={(event) =>
                                      handleRosterPaste(event, index, 2)
                                    }
                                    value={entry.weight}
                                  />
                                ) : (
                                  <button
                                    className="sheet-cell"
                                    onClick={() =>
                                      setRosterActiveCell({ rowIndex: index, columnIndex: 2 })
                                    }
                                    type="button"
                                  >
                                    {entry.weight || "—"}
                                  </button>
                                )}
                              </td>
                              {isMixedAgeClass(data.gradeLabel) ? (
                                <td>
                                  {rosterActiveCell?.rowIndex === index &&
                                  rosterActiveCell?.columnIndex === 3 ? (
                                    <select
                                      autoFocus
                                      className="sheet-input"
                                      onBlur={() => setRosterActiveCell(null)}
                                      onChange={(event) =>
                                        updateRosterDraftCell(index, 3, event.target.value)
                                      }
                                      onKeyDown={(event) =>
                                        handleRosterKeyDown(event, index, 3)
                                      }
                                      value={entry.studentGradeLabel}
                                    >
                                      {STUDENT_GRADE_OPTIONS.map((grade) => (
                                        <option key={`${entry.id}-${grade}`} value={grade}>
                                          {grade}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <button
                                      className="sheet-cell"
                                      onClick={() =>
                                        setRosterActiveCell({ rowIndex: index, columnIndex: 3 })
                                      }
                                      type="button"
                                    >
                                      {entry.studentGradeLabel}
                                    </button>
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button
                    className="primary-button"
                    onClick={importRosterToRecords}
                    type="button"
                  >
                    儲存
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "analysis" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>檢視能力分析</h2>
                  <p>快速查看單一學生六項測驗分布。</p>
                </div>
                <label className="shared-date-field">
                  選擇學生
                  <select
                    className="search-input"
                    onChange={(event) => {
                      const nextRecord = data.records.find(
                        (record) => record.id === event.target.value,
                      );
                      if (nextRecord) {
                        selectRecord(nextRecord);
                      }
                    }}
                    value={selectedId}
                  >
                    {data.records.map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.studentName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <RadarChart
                labels={selectedRecordItemLabels}
                record={selectedRecord}
                scores={selectedAbilityScores}
              />
            </section>
          </>
        ) : null}

        {activeTab === "tablab" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Tab 元件展示</h2>
                  <p>這個頁面只出現在實驗版，用來快速比較不同 tab 元件的視覺與互動方式。每一組都可以直接點擊切換。</p>
                </div>
              </div>
              <div className="tab-lab-grid">
                {tabShowcaseSamples.map((sample) => {
                  const selectedValue = tabShowcaseSelections[sample.id] ?? sample.items[0] ?? "";
                  return (
                    <article className="tab-lab-card" key={sample.id}>
                      <div className="tab-lab-card-head">
                        <h3>{sample.title}</h3>
                        <p>{sample.description}</p>
                      </div>
                      <div
                        className={`tab-lab-strip tab-lab-strip--${sample.tone}`}
                        role="tablist"
                        aria-label={sample.title}
                      >
                        {sample.items.map((item) => (
                          <button
                            aria-selected={selectedValue === item}
                            className={
                              selectedValue === item
                                ? "tab-lab-item is-active"
                                : "tab-lab-item"
                            }
                            key={item}
                            onClick={() =>
                              setTabShowcaseSelections((current) => ({
                                ...current,
                                [sample.id]: item,
                              }))
                            }
                            role="tab"
                            type="button"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                      <div className="tab-lab-preview">
                        <span className="tab-lab-preview-label">目前選中</span>
                        <strong>{selectedValue}</strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="panel side-panel">
              <h2>怎麼看</h2>
              <ul className="plain-list">
                <li>柔和膠囊：最接近目前正式版，適合主導覽。</li>
                <li>底線切換：資訊型頁面常見，視覺較輕。</li>
                <li>分段切換：適合少量、互斥的內容視圖。</li>
                <li>卡片導覽：功能感較強，首頁感會更重。</li>
                <li>橫向捲動：最省高度，對手機最友善。</li>
              </ul>
            </section>
          </>
        ) : null}

        {activeTab === "pdf" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>測驗報告</h2>
                </div>
              </div>
              {renderIncomingFriendAlertCard()}
              {renderWorkspaceFileCard()}
              {data.records.length === 0 ? renderNoStudentsCard("測驗報告") : (
                <>
                  <div className="report-preview-toolbar">
                    <label className="shared-date-field report-student-picker">
                      選擇學生
                      <select
                        className="search-input"
                        onChange={(event) => {
                          const nextRecord = data.records.find(
                            (record) => record.id === event.target.value,
                          );
                          if (nextRecord) {
                            selectRecord(nextRecord);
                          }
                        }}
                        value={selectedId}
                      >
                        {data.records.map((record, index) => (
                          <option key={record.id} value={record.id}>
                            {`${index + 1} 號 ${record.studentName || "未命名學生"}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary-button"
                      onClick={handleDownloadAllPdfs}
                      type="button"
                    >
                      下載全班 PDF
                    </button>
                  </div>
                  <A4CanvasBoard
                    ref={pdfCanvasRef}
                    abilityProfile={currentAbilityProfile}
                    abilityRulesConfig={abilityRulesConfig}
                    abilityLevelLabels={selectedAbilityLevelLabels}
                    abilityScores={selectedAbilityScores}
                    labels={selectedRecordItemLabels}
                    record={selectedRecord}
                    rosterName={data.rosterName}
                    seatNumber={selectedSeatNumber}
                    testDate={data.testDate}
                  />
                </>
              )}
            </section>
          </>
        ) : null}
      </main>
        </>
      )}
    </div>
  );
}
