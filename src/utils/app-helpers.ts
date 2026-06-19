import { schoolGradeOptions } from "../domain/ability-rules";
import { defaultAppData } from "../domain/sample-data";
import { getSchoolName, normalizeSchoolId, type SchoolId } from "../domain/schools";
import type {
  AppData,
  FitnessField,
  FitnessRecord,
  RosterEntry,
  StudentGradeLabel,
} from "../domain/types";

export type TabKey =
  | "files"
  | "account"
  | "table"
  | "metric"
  | "editor"
  | "roster"
  | "analysis"
  | "pdf"
  | "tablab"
  | "playground"
  | "newMetric"
  | "schoolLab";

export type EditableField = keyof FitnessRecord;
export type FriendInviteActionState = {
  status: "idle" | "loading" | "success" | "error";
  detail: string;
};

export type FriendInviteTraceEntry = {
  timestamp: string;
  status: "loading" | "success" | "error";
  detail: string;
};

export type NewCloudFileDraft = {
  academicYear: string;
  semester: string;
  rosterName: string;
  schoolId: SchoolId | "";
  schoolName: string;
  schoolBranchName: string;
  gradeLabel: string;
  testDate: string;
  rosterCount: string;
};

export type CloudFileInfoDraft = {
  rosterName: string;
  gradeLabel: string;
  academicTerm: string;
  testDate: string;
  schoolId: SchoolId | "";
};

export type FileOpenTraceEntry = {
  timestamp: string;
  status: "info" | "success" | "error";
  detail: string;
};

export const FRIEND_INVITE_TRACE_STORAGE_KEY = "fitness-test-tool:friend-invite-trace";
export const FILE_OPEN_TRACE_STORAGE_KEY = "fitness-test-tool:file-open-trace";
export const SCHOOL_BRANCH_SUGGESTIONS = [
  "總校",
  "本校",
  "台北分校",
  "新北分校",
  "桃園分校",
  "台中分校",
  "高雄分校",
];

export function formatAuthError(error: unknown, fallback: string): string {
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

export function readFriendInviteIdFromUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("friendInvite") ?? params.get("invite") ?? "";
}

export function loadFriendInviteTrace(): FriendInviteTraceEntry[] {
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

export function loadFileOpenTrace(): FileOpenTraceEntry[] {
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

export function saveFileOpenTrace(entries: FileOpenTraceEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(FILE_OPEN_TRACE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore sessionStorage errors
  }
}

export function saveFriendInviteTrace(entries: FriendInviteTraceEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    FRIEND_INVITE_TRACE_STORAGE_KEY,
    JSON.stringify(entries.slice(0, 5)),
  );
}

export type ActiveCell = {
  recordId: string;
  field: EditableField;
} | null;

export type SheetZoomMode = "fit" | 0.8 | 0.9 | 1 | 1.1;
export type FileSortKey = "created-desc" | "updated-desc" | "name-asc" | "roster-asc" | "grade-asc";
export type MobileTabVariant = "wrap" | "scroll" | "compact";
export type TableSortKey = "seat" | "grade-desc" | "grade-asc";

export function readRequestedTabFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get("tab");
}

export const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "account", label: "帳號管理" },
  { key: "files", label: "編輯檔案" },
  { key: "roster", label: "學員名單" },
  { key: "metric", label: "測驗項目" },
  { key: "table", label: "測驗總表" },
  { key: "pdf", label: "測驗報告" },
];

export const tabTestIds: Partial<Record<TabKey, string>> = {
  account: "account-tab",
  files: "files-tab",
  metric: "metric-tab",
  pdf: "pdf-tab",
  roster: "roster-tab",
  table: "summary-tab",
};

export const experimentalTabs: Array<{ key: TabKey; label: string }> = [
  ...tabs,
  { key: "tablab", label: "Tab 元件展示" },
  { key: "schoolLab", label: "學校欄位測試" },
  { key: "playground", label: "試算表 Playground" },
  { key: "newMetric", label: "新版測驗項目" },
];

export const tabShowcaseSamples = [
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

export const scoreFields: FitnessField[] = [
  "item1",
  "item2",
  "item3",
  "item4",
  "item5",
  "item6",
];

export const tableEditableFields: EditableField[] = [
  "studentName",
  "height",
  "weight",
  "studentGradeLabel",
  ...scoreFields,
];
export const numericMetricInputFields: Array<keyof FitnessRecord> = [
  ...scoreFields,
  "item6Left",
  "item6Right",
];

export const SHEET_ZOOM_OPTIONS: Array<{ label: string; value: SheetZoomMode }> = [
  { label: "符合頁寬", value: "fit" },
  { label: "80%", value: 0.8 },
  { label: "90%", value: 0.9 },
  { label: "100%", value: 1 },
  { label: "110%", value: 1.1 },
];

export const TABLE_SHEET_ZOOM_OPTIONS: Array<{ label: string; value: SheetZoomMode }> = [
  { label: "符合頁寬", value: "fit" },
  { label: "100%", value: 1 },
];

export const GRADE_OPTIONS = schoolGradeOptions;
export const STUDENT_GRADE_OPTIONS: StudentGradeLabel[] = ["幼幼班", "小班", "中班", "大班"];
export const TERM_OPTIONS = ["上學期", "下學期"] as const;
export const CURRENT_ROC_YEAR = new Date().getFullYear() - 1911;
export const ACADEMIC_YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) =>
  String(CURRENT_ROC_YEAR - 2 + index),
);
export const LAST_CLOUD_FILE_STORAGE_PREFIX = "fitness-test-tool:last-cloud-file:";
export const TABLE_SORT_OPTIONS: Array<{ value: TableSortKey; label: string }> = [
  { value: "seat", label: "依號碼排序" },
  { value: "grade-desc", label: "依年級排序（大到小）" },
  { value: "grade-asc", label: "依年級排序（小到大）" },
];
export const TABLE_GRADE_CHECKBOX_OPTIONS: StudentGradeLabel[] = ["幼幼班", "小班", "中班", "大班"];
export const emptyAppData: AppData = {
  ...defaultAppData,
  rosterName: "",
  rosterEntries: [],
  records: [],
};

export function hasIncompleteScore(record: FitnessRecord): boolean {
  return scoreFields.some(
    (field) => !Number.isFinite(record[field]) || record[field] <= 0,
  );
}

export function makeEmptyRecord(testDate: string): FitnessRecord {
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
    item6Left: 0,
    item6Right: 0,
    comment: "",
  };
}

export function makeEmptyRosterEntry(): RosterEntry {
  return {
    id: crypto.randomUUID(),
    studentName: "",
    height: "",
    weight: "",
    studentGradeLabel: "大班",
  };
}

export function normalizeRosterEntriesForFile(
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

export function comparableRosterEntriesForDirtyCheck(
  entries: RosterEntry[],
  fileGradeLabel: string,
): Array<Omit<RosterEntry, "id">> {
  const comparableEntries = normalizeRosterEntriesForFile(entries, fileGradeLabel).map(
    ({ studentName, height, weight, studentGradeLabel }) => ({
      studentName,
      height,
      weight,
      studentGradeLabel,
    }),
  );

  while (comparableEntries.length > 0) {
    const lastEntry = comparableEntries[comparableEntries.length - 1];
    if (!lastEntry || lastEntry.studentName || lastEntry.height || lastEntry.weight) {
      break;
    }

    comparableEntries.pop();
  }

  return comparableEntries;
}

export function makeNewCloudFileDraft(source: AppData): NewCloudFileDraft {
  const parts = parseAcademicTermParts(source.academicTerm);
  const schoolId = normalizeSchoolId(source.schoolId);
  return {
    academicYear: parts.academicYear || String(CURRENT_ROC_YEAR),
    semester: parts.semester || TERM_OPTIONS[1],
    rosterName: "",
    schoolId,
    schoolName: source.schoolNameSnapshot?.trim() || getSchoolName(schoolId),
    schoolBranchName: source.schoolBranchNameSnapshot?.trim() ?? "",
    gradeLabel: source.gradeLabel || GRADE_OPTIONS[0] || "",
    testDate: source.testDate || new Date().toISOString().slice(0, 10),
    rosterCount: "1",
  };
}

export function isStudentGradeLabel(value: string): value is StudentGradeLabel {
  return value === "幼幼班" || value === "小班" || value === "中班" || value === "大班";
}

export function resolveStudentGradeLabel(
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

export function isMixedAgeClass(gradeLabel: string): boolean {
  return gradeLabel === "混齡班";
}

export function getStudentGradeRank(gradeLabel: StudentGradeLabel): number {
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

export function inferStudentGradeFromText(
  value: string | undefined,
  fallback: StudentGradeLabel,
): StudentGradeLabel {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  return isStudentGradeLabel(trimmed) ? trimmed : fallback;
}

export function upsertRecord(records: FitnessRecord[], nextRecord: FitnessRecord) {
  const foundIndex = records.findIndex((record) => record.id === nextRecord.id);
  if (foundIndex === -1) {
    return [nextRecord, ...records];
  }

  return records.map((record) =>
    record.id === nextRecord.id ? nextRecord : record,
  );
}

export function normalizeNumber(value: string): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((row) => row.split("\t"));
}

export function formatAcademicTerm(dateString: string): string {
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

export function parseAcademicTermParts(termValue: string): {
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

export function buildAcademicTermValue(
  academicYear: string,
  semester: string,
): string {
  if (!academicYear || !semester) {
    return "";
  }

  return `${academicYear}學年度${semester}`;
}

export function isValidDateInput(value: string): boolean {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) {
    return false;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

export function getLastCloudFileStorageKey(uid: string): string {
  const runtime =
    typeof window !== "undefined" && window.__FITNESS_TEST_RUNTIME__ === "e2e"
      ? "e2e"
      : "production";

  return `${LAST_CLOUD_FILE_STORAGE_PREFIX}${runtime}:${uid}`;
}

export function readLastCloudFileSelection(uid: string): { fileId: string; ownerUid: string } | null {
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

export function writeLastCloudFileSelection(
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

export type ReportDebugParams = {
  enabled: boolean;
  fileId: string | null;
  recordId: string | null;
  seat: number | null;
};

export type LoadCheckpointKey =
  | "frontend"
  | "auth"
  | "profile"
  | "friends"
  | "friendRequests"
  | "cloudFiles"
  | "abilityRules"
  | "restoreFile";

export type LoadCheckpointState = {
  label: string;
  status: "waiting" | "loading" | "success" | "error";
  detail: string;
};

export const DEFAULT_LOAD_CHECKPOINTS: Record<LoadCheckpointKey, LoadCheckpointState> = {
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

export function makeDefaultLoadCheckpoints(): Record<LoadCheckpointKey, LoadCheckpointState> {
  return JSON.parse(JSON.stringify(DEFAULT_LOAD_CHECKPOINTS)) as Record<
    LoadCheckpointKey,
    LoadCheckpointState
  >;
}

export function summarizeFrontendStatus(
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

export function readReportDebugParamsFromUrl(): ReportDebugParams {
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

export function readMobileTabVariantFromUrl(): MobileTabVariant {
  if (typeof window === "undefined") {
    return "wrap";
  }

  const variant = new URLSearchParams(window.location.search).get("mobileTabs");
  if (variant === "scroll" || variant === "compact") {
    return variant;
  }

  return "wrap";
}
