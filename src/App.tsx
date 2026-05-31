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
import {
  loadDebugSettings,
  type DebugSettings,
} from "./debug-settings";
import {
  readFirebaseConnectionTest,
  writeFirebaseConnectionTest,
} from "./firebase-test";
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
  loadCloudFile,
  saveCloudFile as saveCloudFileData,
  subscribeToCloudFiles,
  type CloudFileSummary,
  updateCloudFileInfo,
} from "./cloud-files";
import {
  acceptFriendRequest,
  createFriendInvite,
  ensureUserProfile,
  getFriendInvite,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
  sendFriendRequestFromInvite,
  subscribeToFriends,
  subscribeToIncomingFriendRequests,
  subscribeToOutgoingFriendRequests,
  type FriendRecord,
  type FriendInviteRecord,
  type FriendRequestRecord,
} from "./friendships";
import RadarChart from "./RadarChart";
import { defaultAppData } from "./sample-data";
import type { AppData, FitnessField, FitnessRecord, RosterEntry } from "./types";
import type { User } from "firebase/auth";
import QRCode from "qrcode";

type TabKey =
  | "files"
  | "account"
  | "table"
  | "metric"
  | "editor"
  | "roster"
  | "analysis"
  | "pdf";

type EditableField = keyof FitnessRecord;

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

type ActiveCell = {
  recordId: string;
  field: EditableField;
} | null;

type SheetZoomMode = "fit" | 0.8 | 0.9 | 1 | 1.1;
type FileSortKey = "created-desc" | "updated-desc" | "name-asc" | "roster-asc" | "grade-asc";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "account", label: "帳號管理" },
  { key: "files", label: "檔案中心" },
  { key: "roster", label: "編輯名冊" },
  { key: "metric", label: "測驗項目" },
  { key: "table", label: "檢視總表" },
  { key: "pdf", label: "檢視報表" },
];

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
  ...scoreFields,
];

const SHEET_ZOOM_OPTIONS: Array<{ label: string; value: SheetZoomMode }> = [
  { label: "符合頁寬", value: "fit" },
  { label: "80%", value: 0.8 },
  { label: "90%", value: 0.9 },
  { label: "100%", value: 1 },
  { label: "110%", value: 1.1 },
];

const GRADE_OPTIONS = ["中大班", "小幼班"];
const TERM_OPTIONS = ["上學期", "下學期"] as const;
const CURRENT_ROC_YEAR = new Date().getFullYear() - 1911;
const ACADEMIC_YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) =>
  String(CURRENT_ROC_YEAR - 2 + index),
);

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
  };
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

type ReportDebugParams = {
  enabled: boolean;
  fileId: string | null;
  recordId: string | null;
  seat: number | null;
};

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

export default function App() {
  const [data, setData] = useState<AppData>(defaultAppData);
  const reportDebugParams = useMemo(() => readReportDebugParamsFromUrl(), []);
  const isReportDebugMode = reportDebugParams.enabled;
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (readReportDebugParamsFromUrl().enabled) {
      return "pdf";
    }

    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("invite")
    ) {
      return "account";
    }

    return "account";
  });
  const [selectedId, setSelectedId] = useState<string>(data.records[0]?.id ?? "");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [friendDraft, setFriendDraft] = useState("");
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
  const [cloudFiles, setCloudFiles] = useState<CloudFileSummary[]>([]);
  const [fileSortKey, setFileSortKey] = useState<FileSortKey>("created-desc");
  const [abilityRulesConfig, setAbilityRulesConfig] = useState<AbilityRulesConfig>(
    defaultAbilityRulesConfig,
  );
  const [currentCloudFileId, setCurrentCloudFileId] = useState<string | null>(null);
  const [isCloudDirty, setIsCloudDirty] = useState(false);
  const [expandedCloudFileId, setExpandedCloudFileId] = useState<string | null>(null);
  const [cloudFileDrafts, setCloudFileDrafts] = useState<
    Record<string, { rosterName: string; gradeLabel: string; academicTerm: string }>
  >({});
  const [draftRecord, setDraftRecord] = useState<FitnessRecord>(
    data.records[0] ?? makeEmptyRecord(data.testDate),
  );
  const [message, setMessage] = useState("已載入本機資料。");
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [activeMetric, setActiveMetric] = useState<FitnessField>("item1");
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
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
  const [rosterZoomMode, setRosterZoomMode] = useState<SheetZoomMode>("fit");
  const [tableZoomMode, setTableZoomMode] = useState<SheetZoomMode>("fit");
  const [metricZoomMode, setMetricZoomMode] = useState<SheetZoomMode>("fit");
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

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((user) => {
      if (user) {
        void ensureUserProfile(user);
        setActiveTab((current) =>
          isReportDebugMode ? "pdf" : current === "account" ? "files" : current,
        );
      }
      setCurrentUser(user);
      setAuthReady(true);
      setShowAccountMenu(false);
    });

    return unsubscribe;
  }, [isReportDebugMode]);

  useEffect(() => {
    if (!currentUser) {
      reportDebugFileLoadedRef.current = null;
      setFriendDraft("");
      setFriends([]);
      setIncomingFriendRequests([]);
      setOutgoingFriendRequests([]);
      setCloudFiles([]);
      setAbilityRulesConfig(defaultAbilityRulesConfig);
      setCurrentCloudFileId(null);
      setIsCloudDirty(false);
      return;
    }

    const unsubscribeFriends = subscribeToFriends(currentUser.uid, setFriends);
    const unsubscribeIncoming = subscribeToIncomingFriendRequests(
      currentUser.uid,
      setIncomingFriendRequests,
    );
    const unsubscribeOutgoing = subscribeToOutgoingFriendRequests(
      currentUser.uid,
      setOutgoingFriendRequests,
    );
    const unsubscribeCloudFiles = subscribeToCloudFiles(
      currentUser.uid,
      setCloudFiles,
    );
    const unsubscribeAbilityRules = subscribeToAbilityRulesConfig(
      currentUser.uid,
      setAbilityRulesConfig,
    );

    void ensureAbilityRulesConfig(currentUser.uid).catch((error) => {
      const nextMessage =
        error instanceof Error ? error.message : "無法載入能力值對應表。";
      setMessage(`能力值對應表載入失敗：${nextMessage}`);
    });

    return () => {
      unsubscribeFriends();
      unsubscribeIncoming();
      unsubscribeOutgoing();
      unsubscribeCloudFiles();
      unsubscribeAbilityRules();
    };
  }, [currentUser]);

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
        setIsCloudDirty(false);
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
  const currentAbilityProfile = useMemo(
    () => findAbilityGradeProfile(abilityRulesConfig, data.gradeLabel),
    [abilityRulesConfig, data.gradeLabel],
  );
  const resolvedItemLabels = useMemo(
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
    return showIncompleteOnly
      ? data.records.filter((record) => hasIncompleteScore(record))
      : data.records;
  }, [data.records, showIncompleteOnly]);

  const activeMetricIndex = scoreFields.indexOf(activeMetric);
  const activeMetricLabel = resolvedItemLabels[activeMetricIndex] ?? activeMetric;
  const currentUsername =
    currentUser?.displayName || emailToUsername(currentUser?.email) || "未登入";
  const inviteIdFromUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(window.location.search).get("invite") ?? "";
  }, []);
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
    setRosterDraft((current) => [...current, makeEmptyRosterEntry()]);
  }

  function applyRosterSize(): void {
    const nextCount = Math.max(1, Math.floor(Number(rosterSizeInput) || 0));
    const currentCount = rosterDraft.length;

    if (nextCount === currentCount) {
      setRosterSizeInput(String(nextCount));
      return;
    }

    if (nextCount > currentCount) {
      setRosterDraft((current) => [
        ...current,
        ...Array.from({ length: nextCount - currentCount }, () => makeEmptyRosterEntry()),
      ]);
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
    event: KeyboardEvent<HTMLInputElement>,
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
      nextColumnIndex = Math.min(2, columnIndex + 1);
    } else {
      return;
    }

    setRosterActiveCell({ rowIndex: nextRowIndex, columnIndex: nextColumnIndex });
  }

  function importRosterToRecords(): void {
    const normalizedRosterEntries = rosterDraft
      .map((entry) => ({
        ...entry,
        studentName: entry.studentName.trim(),
        height: entry.height.trim(),
        weight: entry.weight.trim(),
      }))
      .filter((entry) => entry.studentName);

    if (!normalizedRosterEntries.length) {
      setMessage("目前名冊是空的。");
      return;
    }

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
          testDate: data.testDate,
        };
      }

      return {
        ...makeEmptyRecord(data.testDate),
        studentName: entry.studentName,
        height: entry.height,
        weight: entry.weight,
      };
    });

    setData((current) => ({
      ...current,
      rosterEntries: normalizedRosterEntries,
      records: nextRecords,
    }));
    setRosterDraft(normalizedRosterEntries);
    setSelectedId(nextRecords[0]?.id ?? "");
    setDraftRecord(nextRecords[0] ?? makeEmptyRecord(data.testDate));
    setMessage("已將名冊匯入目前資料。");
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
      labels: resolvedItemLabels,
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
      const user = await signInWithUsername(loginUsername.trim(), loginPassword);
      setShowLoginPanel(false);
      setLoginPassword("");
      setLoginUsername("");
      setMessage(`已登入 ${user.displayName || emailToUsername(user.email) || "使用者"}。`);
    } catch (error) {
      const nextMessage = formatAuthError(error, "帳號登入失敗。");
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
      const user = await registerWithUsername(loginUsername.trim(), loginPassword);
      setShowLoginPanel(false);
      setLoginPassword("");
      setLoginUsername("");
      setMessage(`已建立帳號 ${user.displayName || emailToUsername(user.email) || "使用者"}。`);
    } catch (error) {
      const nextMessage = formatAuthError(error, "註冊失敗。");
      setMessage(`註冊失敗：${nextMessage}`);
    }
  }

  async function handleSignOut(): Promise<void> {
    try {
      await signOutCurrentUser();
      setShowLoginPanel(false);
      setShowAccountMenu(false);
      setMessage("已登出。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "登出失敗。";
      setMessage(`登出失敗：${nextMessage}`);
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
      await sendFriendRequest({
        fromUid: currentUser.uid,
        fromUsername: currentUsername,
        targetUsername: nextUsername,
      });
      setFriendDraft("");
      setMessage(`已送出給 ${nextUsername} 的好友邀請。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "送出好友邀請失敗。";
      setMessage(nextMessage);
    }
  }

  async function handleAcceptFriendRequest(
    request: FriendRequestRecord,
  ): Promise<void> {
    try {
      await acceptFriendRequest(request);
      setMessage(`已和 ${request.fromUsername} 成為好友。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "同意好友邀請失敗。";
      setMessage(nextMessage);
    }
  }

  async function handleRejectFriendRequest(
    request: FriendRequestRecord,
  ): Promise<void> {
    try {
      await rejectFriendRequest(request.id);
      setMessage(`已拒絕 ${request.fromUsername} 的好友邀請。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "拒絕好友邀請失敗。";
      setMessage(nextMessage);
    }
  }

  async function handleRemoveFriend(friend: FriendRecord): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再管理好友。");
      return;
    }

    try {
      await removeFriend({
        currentUid: currentUser.uid,
        friendUid: friend.friendUid,
      });
      setMessage(`已移除好友 ${friend.username}。`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "移除好友失敗。";
      setMessage(nextMessage);
    }
  }

  async function handleCreateFriendInvite(): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再產生加好友 QR Code。");
      return;
    }

    try {
      const invite = await createFriendInvite({
        issuedByUid: currentUser.uid,
        issuedByUsername: currentUsername,
      });
      setActiveFriendInvite(invite);
      setMessage("已產生新的加好友 QR Code。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "產生加好友 QR Code 失敗。";
      setMessage(nextMessage);
    }
  }

  async function handleSendFriendRequestFromQr(): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再送出好友邀請。");
      return;
    }

    if (!scannedFriendInvite) {
      setMessage("找不到這張加好友邀請。");
      return;
    }

    if (scannedFriendInvite.issuedByUid === currentUser.uid) {
      setMessage("這是你自己的加好友 QR Code。");
      return;
    }

    if (
      friends.some((friend) => friend.username === scannedFriendInvite.issuedByUsername)
    ) {
      setMessage(`${scannedFriendInvite.issuedByUsername} 已經在好友列表中。`);
      return;
    }

    if (
      outgoingFriendRequests.some(
        (request) => request.toUid === scannedFriendInvite.issuedByUid,
      )
    ) {
      setMessage("你已經送出好友邀請，請等待對方確認。");
      return;
    }

    if (
      incomingFriendRequests.some(
        (request) => request.fromUid === scannedFriendInvite.issuedByUid,
      )
    ) {
      setMessage("對方已先送出好友邀請，請直接在收到的邀請中按同意。");
      return;
    }

    try {
      await sendFriendRequestFromInvite({
        inviteId: scannedFriendInvite.id,
        fromUid: currentUser.uid,
        fromUsername: currentUsername,
      });
      setMessage(
        `已透過 QR Code 對 ${scannedFriendInvite.issuedByUsername} 送出好友邀請。`,
      );
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "送出好友邀請失敗。";
      setMessage(nextMessage);
    }
  }

  function openAccountPanel(): void {
    setActiveTab("account");
    setShowAccountMenu(false);
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
      const fileId = await createCloudFile({
        uid: currentUser.uid,
        username: currentUsername,
        data,
      });
      setCurrentCloudFileId(fileId);
      setIsCloudDirty(false);
      setMessage("已在你的帳號下建立新的雲端檔案。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "建立雲端檔案失敗。";
      setMessage(`建立雲端檔案失敗：${nextMessage}`);
    }
  }

  async function handleSaveCurrentCloudFile(): Promise<void> {
    if (!currentUser || !currentCloudFileId) {
      setMessage("請先開啟一份雲端檔案，再儲存。");
      return;
    }

    try {
      await saveCloudFileData({
        uid: currentUser.uid,
        fileId: currentCloudFileId,
        username: currentUsername,
        data,
      });
      setIsCloudDirty(false);
      setMessage("目前檔案已儲存到雲端。");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "儲存雲端檔案失敗。";
      setMessage(`儲存雲端檔案失敗：${nextMessage}`);
    }
  }

  async function handleOpenCloudFile(file: CloudFileSummary): Promise<void> {
    if (!currentUser) {
      setMessage("請先登入，再開啟雲端檔案。");
      return;
    }

    if (!confirmDiscardCloudChanges()) {
      return;
    }

    try {
      const nextData = await loadCloudFile(currentUser.uid, file.id);
      skipNextCloudDirtyRef.current = true;
      setData(nextData);
      setCurrentCloudFileId(file.id);
      setIsCloudDirty(false);
      setSelectedId(nextData.records[0]?.id ?? "");
      setDraftRecord(nextData.records[0] ?? makeEmptyRecord(nextData.testDate));
      setRosterDraft(
        nextData.rosterEntries.length
          ? nextData.rosterEntries
          : [makeEmptyRosterEntry()],
      );
      setRosterSizeInput(String(nextData.rosterEntries.length || 1));
      setMessage(`已切換到檔案：${file.fileName}`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "開啟雲端檔案失敗。";
      setMessage(`開啟雲端檔案失敗：${nextMessage}`);
    }
  }

  function updateCloudFileDraft(
    fileId: string,
    field: "rosterName" | "gradeLabel" | "academicTerm",
    value: string,
  ): void {
    setCloudFileDrafts((current) => ({
      ...current,
      [fileId]: {
        rosterName: current[fileId]?.rosterName ?? "",
        gradeLabel: current[fileId]?.gradeLabel ?? "",
        academicTerm: current[fileId]?.academicTerm ?? "",
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
      await updateCloudFileInfo({
        uid: currentUser.uid,
        fileId: file.id,
        rosterName: draft.rosterName,
        gradeLabel: draft.gradeLabel,
        academicTerm: draft.academicTerm,
      });
      setMessage(`已更新檔案資訊：${file.fileName}`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "更新檔案資訊失敗。";
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

    try {
      await archiveCloudFile({
        uid: currentUser.uid,
        fileId: file.id,
      });
      if (currentCloudFileId === file.id) {
        setCurrentCloudFileId(null);
        setIsCloudDirty(false);
      }
      if (expandedCloudFileId === file.id) {
        setExpandedCloudFileId(null);
      }
      setMessage(`已封存檔案：${file.fileName}`);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "封存檔案失敗。";
      setMessage(`封存檔案失敗：${nextMessage}`);
    }
  }

  function openFileWorkspace(nextTab: Exclude<TabKey, "files" | "account" | "editor">): void {
    setActiveTab(nextTab);
  }

  function toggleCloudFilePanel(fileId: string): void {
    setExpandedCloudFileId((current) => (current === fileId ? null : fileId));
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

  function getMetricRule(field: FitnessField) {
    return getAbilityRuleForField(currentAbilityProfile, field);
  }

  function getMetricDisplayValue(record: FitnessRecord, field: FitnessField): string {
    return getDisplayValueForField(record[field], getMetricRule(field));
  }

  function getMetricSelectOptions(field: FitnessField) {
    return getRubricOptions(getMetricRule(field));
  }

  function getMetricRangeHint(field: FitnessField): string {
    const rule = getMetricRule(field);
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
    const values = getAbilityScores(record, currentAbilityProfile);
    const maxValue = Math.max(...values);
    const maxIndex = values.indexOf(maxValue);
    return resolvedItemLabels[maxIndex] ?? "未設定";
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
      selectOptions?: Array<{ value: number; label: string }>;
    },
  ) {
    const isEditing =
      activeCell?.recordId === record.id && activeCell.field === field;

    const navigationFields = options?.navigationFields ?? tableEditableFields;

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
    inviteUrl.searchParams.set("invite", activeFriendInvite.id);
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
  ) {
    return (
      <div className="sheet-toolbar" role="group" aria-label="表格縮放">
        {SHEET_ZOOM_OPTIONS.map((option) => (
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
          labels={resolvedItemLabels}
          record={selectedRecord}
          rosterName={data.rosterName}
          seatNumber={selectedSeatNumber}
          testDate={data.testDate}
        />
      </div>
    );
  }

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
              <p className="eyebrow">新北市運動遊戲體育協會</p>
              <h1>體適能測驗管理工具</h1>
              <p className="hero-copy">
                第一版以網頁為唯一正式編輯來源，Excel 僅用於檢視、備份、列印與攜帶。
              </p>
            </div>
            <div className="hero-auth">
              <div className="shared-date-field auth-entry">
                <span>帳號</span>
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
                      className="secondary-button"
                      onClick={() => setShowAccountMenu((current) => !current)}
                      type="button"
                    >
                      {currentUser.displayName || emailToUsername(currentUser.email) || "未命名使用者"}
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

          <div className="hero-meta">
            <label className="shared-date-field">
              班級名稱
              <input
                onChange={(event) => updateRosterName(event.target.value)}
                value={data.rosterName}
              />
            </label>
            <label className="shared-date-field">
              本次測驗日期
              <input
                onChange={(event) => updateSharedTestDate(event.target.value)}
                type="date"
                value={data.testDate}
              />
            </label>
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
        </div>
      </header>

      <div className="status-banner" role="status">
        {message}
      </div>

      <nav className="tab-bar" aria-label="主要功能">
        {tabs.map((tab) => (
          <button
            className={tab.key === activeTab ? "tab is-active" : "tab"}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
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
                  <h2>檢視總表</h2>
                  <p>這一頁預設是列表檢視，點一下儲存格再就地編輯，也能直接選取學生供能力分析使用。</p>
                </div>
                <div className="button-row">
                  <label className="filter-toggle">
                    <input
                      checked={showIncompleteOnly}
                      onChange={(event) => setShowIncompleteOnly(event.target.checked)}
                      type="checkbox"
                    />
                    只看未完成學生
                  </label>
                  <button
                    className="primary-button"
                    onClick={addTableRow}
                    type="button"
                  >
                    新增列
                  </button>
                </div>
              </div>
              <div className="sheet-shell">
                {renderSheetZoomToolbar(tableZoomMode, setTableZoomMode)}
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
                            <td>{renderTableCell(record, "height", record.height)}</td>
                            <td>{renderTableCell(record, "weight", record.weight)}</td>
                            {scoreFields.map((field) => (
                              <td key={field}>
                                {renderTableCell(record, field, record[field], {
                                  inputType:
                                    getMetricRule(field)?.kind === "rubric"
                                      ? "select"
                                      : "number",
                                  min: 0,
                                  step: 1,
                                  className: "cell-input-number",
                                  displayValue: getMetricDisplayValue(record, field),
                                  selectOptions: getMetricSelectOptions(field),
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
            </section>
          </>
        ) : null}

        {activeTab === "files" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>檔案中心</h2>
                  <p>所有檔案都會放在 Firebase，登入後才能在自己的帳號下建立與管理檔案。</p>
                </div>
                <div className="button-row">
                  {currentCloudFileId ? (
                    <button
                      className="secondary-button"
                      disabled={!isCloudDirty}
                      onClick={() => {
                        void handleSaveCurrentCloudFile();
                      }}
                      type="button"
                    >
                      {isCloudDirty ? "儲存目前檔案" : "已儲存"}
                    </button>
                  ) : null}
                  <button
                    className="primary-button"
                    disabled={!currentUser}
                    onClick={() => {
                      void handleCreateCloudFile();
                    }}
                    type="button"
                  >
                    建立新檔案
                  </button>
                </div>
              </div>

              <div className="file-list-shell">
                <div className="file-list-head">
                  <h3>我的檔案</h3>
                  <p>登入後才可以在 Firebase 建立並管理自己的雲端檔案。</p>
                  {currentUser ? (
                    <label className="file-sort-field">
                      <span>排序方式</span>
                      <select
                        onChange={(event) => setFileSortKey(event.target.value as FileSortKey)}
                        value={fileSortKey}
                      >
                        <option value="created-desc">建立時間（新到舊）</option>
                        <option value="updated-desc">編輯時間（新到舊）</option>
                        <option value="name-asc">檔案名稱</option>
                        <option value="roster-asc">班級名稱</option>
                        <option value="grade-asc">年級</option>
                      </select>
                    </label>
                  ) : null}
                </div>
                {!currentUser ? (
                  <div className="friend-empty-state">
                    <strong>尚未登入</strong>
                    <p>請先註冊並登入，之後才能在自己的帳號下建立雲端檔案。</p>
                  </div>
                ) : cloudFiles.length === 0 ? (
                  <div className="file-list-head">
                    <p>目前還沒有檔案。</p>
                  </div>
                ) : (
                  <div className="file-table">
                    <div className="file-table-row file-table-row-header">
                      <span>檔案名稱</span>
                      <span>班級名稱</span>
                      <span>年級</span>
                      <span>學期</span>
                      <span>班級人數</span>
                      <span>狀態</span>
                    </div>
                    {sortedCloudFiles.map((file) => (
                      <div className="file-accordion-item" key={file.id}>
                        <div
                          className={
                            file.id === currentCloudFileId
                              ? "file-table-row file-table-row-body is-active"
                              : "file-table-row file-table-row-body"
                          }
                          onClick={() => toggleCloudFilePanel(file.id)}
                        >
                          <span className="file-name-cell">
                            <span
                              className={
                                expandedCloudFileId === file.id
                                  ? "file-row-chevron is-open"
                                  : "file-row-chevron"
                              }
                              aria-hidden="true"
                            >
                              ▾
                            </span>
                            {file.fileName}
                          </span>
                          <span>{file.rosterName}</span>
                          <span>{file.gradeLabel}</span>
                          <span>{file.academicTerm}</span>
                          <span>{file.rosterCount} 人</span>
                          {file.id === currentCloudFileId ? (
                            <span>目前使用中</span>
                          ) : (
                            <button
                              className="secondary-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleOpenCloudFile(file);
                              }}
                              type="button"
                            >
                              使用這個檔案
                            </button>
                          )}
                        </div>
                        {expandedCloudFileId === file.id ? (
                          <div className="file-accordion-panel">
                            {file.id === currentCloudFileId ? (
                              <>
                                <div className="file-detail-grid">
                                  <label>
                                    <strong>班級名稱</strong>
                                    <input
                                      onChange={(event) => updateRosterName(event.target.value)}
                                      type="text"
                                      value={data.rosterName}
                                    />
                                  </label>
                                  <label>
                                    <strong>年級</strong>
                                    <select
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
                                    <strong>學年度</strong>
                                    <select
                                      onChange={(event) =>
                                        updateAcademicTermPart(
                                          "academicYear",
                                          event.target.value,
                                        )}
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
                                    <strong>學期</strong>
                                    <select
                                      onChange={(event) =>
                                        updateAcademicTermPart(
                                          "semester",
                                          event.target.value,
                                        )}
                                      value={parseAcademicTermParts(data.academicTerm).semester}
                                    >
                                      {TERM_OPTIONS.map((term) => (
                                        <option key={term} value={term}>
                                          {term}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="file-size-field">
                                    <strong>班級人數</strong>
                                    <div className="file-size-row">
                                      <input
                                        min={1}
                                        onChange={(event) => setRosterSizeInput(event.target.value)}
                                        type="number"
                                        value={rosterSizeInput}
                                      />
                                      <button
                                        className="secondary-button"
                                        onClick={applyRosterSize}
                                        type="button"
                                      >
                                        套用
                                      </button>
                                    </div>
                                  </label>
                                </div>
                                <div className="file-status-row">
                                  <span className="status-chip is-active">
                                    {isCloudDirty ? "目前使用中・尚未儲存" : "目前使用中"}
                                  </span>
                                  <span>
                                    最近更新 {file.updatedAt ? formatActivityDate(file.updatedAt) : "剛建立"}
                                  </span>
                                </div>
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
                                  <button
                                    className="secondary-button"
                                    onClick={() => openFileWorkspace("roster")}
                                    type="button"
                                  >
                                    編輯名冊資訊
                                  </button>
                                  <button
                                    className="secondary-button"
                                    onClick={() => openFileWorkspace("metric")}
                                    type="button"
                                  >
                                    開啟測驗項目
                                  </button>
                                  <button
                                    className="secondary-button"
                                    onClick={() => openFileWorkspace("table")}
                                    type="button"
                                  >
                                    開啟總表
                                  </button>
                                  <button
                                    className="secondary-button"
                                    onClick={() => openFileWorkspace("pdf")}
                                    type="button"
                                  >
                                    檢視報表
                                  </button>
                                  <button
                                    className="danger-button"
                                    onClick={() => {
                                      void handleArchiveCloudFile(file);
                                    }}
                                    type="button"
                                  >
                                    刪除檔案
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="file-detail-grid">
                                  <label>
                                    <strong>班級名稱</strong>
                                    <input
                                      onChange={(event) =>
                                        updateCloudFileDraft(
                                          file.id,
                                          "rosterName",
                                          event.target.value,
                                        )}
                                      type="text"
                                      value={cloudFileDrafts[file.id]?.rosterName ?? file.rosterName}
                                    />
                                  </label>
                                  <label>
                                    <strong>年級</strong>
                                    <select
                                      onChange={(event) =>
                                        updateCloudFileDraft(
                                          file.id,
                                          "gradeLabel",
                                          event.target.value,
                                        )}
                                      value={cloudFileDrafts[file.id]?.gradeLabel ?? file.gradeLabel}
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
                                    <strong>學年度</strong>
                                    <select
                                      onChange={(event) =>
                                        updateCloudFileDraftTermPart(
                                          file.id,
                                          "academicYear",
                                          event.target.value,
                                        )}
                                      value={parseAcademicTermParts(
                                        cloudFileDrafts[file.id]?.academicTerm ?? file.academicTerm,
                                      ).academicYear}
                                    >
                                      {ACADEMIC_YEAR_OPTIONS.map((year) => (
                                        <option key={year} value={year}>
                                          民國 {year} 年
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    <strong>學期</strong>
                                    <select
                                      onChange={(event) =>
                                        updateCloudFileDraftTermPart(
                                          file.id,
                                          "semester",
                                          event.target.value,
                                        )}
                                      value={parseAcademicTermParts(
                                        cloudFileDrafts[file.id]?.academicTerm ?? file.academicTerm,
                                      ).semester}
                                    >
                                      {TERM_OPTIONS.map((term) => (
                                        <option key={term} value={term}>
                                          {term}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <div className="file-status-row">
                                  <span className="status-chip">尚未切換</span>
                                  <span>
                                    最近更新 {file.updatedAt ? formatActivityDate(file.updatedAt) : "剛建立"}
                                  </span>
                                </div>
                                <div className="file-accordion-actions">
                                  <button
                                    className="secondary-button"
                                    onClick={() => {
                                      void handleSaveCloudFileInfo(file);
                                    }}
                                    type="button"
                                  >
                                    儲存檔案資訊
                                  </button>
                                  <button
                                    className="danger-button"
                                    onClick={() => {
                                      void handleArchiveCloudFile(file);
                                    }}
                                    type="button"
                                  >
                                    刪除檔案
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "account" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>帳號管理</h2>
                  <p>這一頁集中放帳號本身的資訊。之後如果加入好友、共享檔案與共同維護，也會從這裡往外延伸。</p>
                </div>
              </div>

              <div className="account-center-grid">
                <article className="account-card">
                  <h3>基本資料</h3>
                  <div className="auth-profile-grid">
                    <div>
                      <strong>帳號</strong>
                      <div>{currentUser ? currentUsername : "尚未登入"}</div>
                    </div>
                    <div>
                      <strong>說明</strong>
                      <div>這裡顯示的是老師登入時輸入的那組帳號。</div>
                    </div>
                  </div>
                </article>

                <article className="account-card">
                  <div className="account-card-head">
                    <div>
                      <h3>好友列表</h3>
                      <p>現在會把好友與好友邀請同步到 Firestore，也支援用 QR Code 快速送出好友邀請。</p>
                    </div>
                  </div>

                  {scannedFriendInvite ? (
                    <div className="friend-section friend-qr-panel">
                      <h4>掃描到的加好友邀請</h4>
                      <div className="friend-empty-state friend-invite-state">
                        <strong>{scannedFriendInvite.issuedByUsername}</strong>
                        <p>{formatInviteExpiry(scannedFriendInvite.expiresAt)}</p>
                        {!currentUser ? (
                          <p>請先登入，再把這位老師加入好友。</p>
                        ) : scannedFriendInvite.issuedByUid === currentUser.uid ? (
                          <p>這是你自己的加好友 QR Code。</p>
                        ) : (
                          <div className="friend-row-actions">
                            <button
                              className="primary-button"
                              onClick={() => {
                                void handleSendFriendRequestFromQr();
                              }}
                              type="button"
                            >
                              送出好友邀請
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

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
                        顯示我的加好友 QR Code
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
                          <strong>{activeFriendInvite.issuedByUsername}</strong>
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
                              <div className="friend-row" key={request.id}>
                                <div>
                                  <strong>{request.fromUsername}</strong>
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
                                  <strong>{request.toUsername}</strong>
                                  <small>
                                    送出時間 {formatActivityDate(request.createdAt)}
                                  </small>
                                </div>
                                <span className="status-chip">等待對方確認</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="friend-section">
                        <h4>我的好友</h4>
                        {friends.length === 0 ? (
                          <div className="friend-empty-state">
                            <strong>目前還沒有好友</strong>
                            <p>可以先從上方輸入帳號送出邀請，等對方確認後會顯示在這裡。</p>
                          </div>
                        ) : (
                          <div className="friend-list">
                            {friends.map((friend) => (
                              <div className="friend-row" key={friend.friendUid}>
                                <div>
                                  <strong>{friend.username}</strong>
                                  <small>
                                    成為好友時間 {formatActivityDate(friend.addedAt)}
                                  </small>
                                </div>
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
                  <p>一次只處理一個測驗欄位，適合全班統一補分或修分。</p>
                </div>
              </div>

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
                {renderSheetZoomToolbar(metricZoomMode, setMetricZoomMode)}
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
                            <td>
                              {renderTableCell(record, activeMetric, record[activeMetric], {
                                inputType:
                                  getMetricRule(activeMetric)?.kind === "rubric"
                                    ? "select"
                                    : "number",
                                min: 0,
                                navigationFields: [activeMetric],
                                step: 1,
                                className: "cell-input-number",
                                displayValue: getMetricDisplayValue(record, activeMetric),
                                selectOptions: getMetricSelectOptions(activeMetric),
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
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
                {scoreFields.map((field, index) => (
                  <label key={field}>
                    {resolvedItemLabels[index]}
                    {getMetricRule(field)?.kind === "rubric" ? (
                      <select
                        onChange={(event) => updateScore(field, event.target.value)}
                        value={draftRecord[field]}
                      >
                        <option value="0">未填寫</option>
                        {getMetricSelectOptions(field).map((option) => (
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
                  <h2>編輯名冊</h2>
                  <p>這裡只管理一份目前名冊。若要切換班級，直接匯入那個班先前的資料即可。</p>
                </div>
              </div>

              <div className="roster-editor">
                <div className="roster-settings">
                  <label className="metric-label-editor">
                    班級人數
                    <input
                      inputMode="numeric"
                      min="1"
                      onChange={(event) => setRosterSizeInput(event.target.value)}
                      type="number"
                      value={rosterSizeInput}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    onClick={applyRosterSize}
                    type="button"
                  >
                    套用人數
                  </button>
                </div>

                <div className="roster-hint">
                  減少人數時會先提醒你，因為之後儲存名冊可能刪除超出人數的學生資料。
                </div>

                <div className="sheet-shell">
                  {renderSheetZoomToolbar(rosterZoomMode, setRosterZoomMode)}
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
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button
                    className="secondary-button"
                    onClick={addRosterRow}
                    type="button"
                  >
                    新增列
                  </button>
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
                labels={resolvedItemLabels}
                record={selectedRecord}
                scores={selectedAbilityScores}
              />
            </section>
          </>
        ) : null}

        {activeTab === "pdf" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>檢視報表</h2>
                  <p>這裡直接整合 A4 報表畫布與 PDF 輸出，適合檢視學生報表內容並產出正式 PDF。</p>
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
                    {data.records.map((record, index) => (
                      <option key={record.id} value={record.id}>
                        {`${index + 1} 號 ${record.studentName || "未命名學生"}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <A4CanvasBoard
                ref={pdfCanvasRef}
                abilityProfile={currentAbilityProfile}
                abilityRulesConfig={abilityRulesConfig}
                abilityLevelLabels={selectedAbilityLevelLabels}
                abilityScores={selectedAbilityScores}
                labels={resolvedItemLabels}
                record={selectedRecord}
                rosterName={data.rosterName}
                seatNumber={selectedSeatNumber}
                testDate={data.testDate}
              />
              <div className="callout">
                這裡是目前主要的報表檢視頁。除了直接下載 PDF，你也可以在這裡同步處理 Excel 備份與重新匯入。
              </div>
              <div className="button-row">
                <button className="secondary-button" onClick={handleDownloadCurrentPdf} type="button">
                  下載目前學生 PDF
                </button>
                <button className="primary-button" onClick={handleDownloadAllPdfs} type="button">
                  下載全班 PDF
                </button>
              </div>
            </section>
            <section className="panel side-panel">
              <h2>目前能力</h2>
              <ul className="plain-list">
                <li>會直接帶入目前選到學生的雷達圖與基本資訊。</li>
                <li>可以再往上疊文字與圖片圖層。</li>
                <li>可直接下載真正的 PDF 檔。</li>
                <li>Excel 仍然保留給備份、搬移與重新匯入使用。</li>
                <li>若匯入的 Excel 缺少 `_system` 工作表，系統會拒絕載入。</li>
              </ul>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
