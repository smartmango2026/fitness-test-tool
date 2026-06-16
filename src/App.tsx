import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth, AuthProvider } from "./context/AuthContext";
import { useFitnessData, FitnessDataProvider, makeEmptyRecord, makeEmptyRosterEntry } from "./context/FitnessDataContext";
import { useFriends, FriendProvider } from "./context/FriendContext";
import { useFiles, FileProvider } from "./context/FileContext";
import { useDiagnostics, DiagnosticProvider, summarizeFrontendStatus, type LoadCheckpointKey, type LoadCheckpointState } from "./context/DiagnosticContext";
import type { StudentGradeLabel, FitnessField, FitnessRecord, RosterEntry, AppData } from "./types";
import { db } from "./firebase";
import {
  getDiagnosticBrowserId,
  getDiagnosticEnvironment,
  getBrowserDiagnosticReportReferences,
  getUserActionEvents,
  recordUserAction,
  recordDiagnosticEvent,
  fetchVisibleDiagnosticReportReferences,
} from "./diagnostics";
import { emailToUsername, isValidUsername } from "./firebase-auth";
import { getFriendInvite, type FriendInviteRecord } from "./friendships";
import { loadDebugSettings, type DebugSettings } from "./debug-settings";
import associationLogo from "./assets/sgpea-logo.png";

// Tab Components
import AccountTab from "./components/tabs/AccountTab";
import FilesTab from "./components/tabs/FilesTab";
import RosterTab from "./components/tabs/RosterTab";
import MetricTab from "./components/tabs/MetricTab";
import TableTab from "./components/tabs/TableTab";
import PdfReportTab from "./components/tabs/PdfReportTab";
import EditorTab from "./components/tabs/EditorTab";
import PlaygroundTabs from "./components/tabs/PlaygroundTabs";

type TabKey =
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
  | "newMetric";

type MobileTabVariant = "wrap" | "scroll" | "compact";
type ReportDebugParams = {
  enabled: boolean;
  fileId: string | null;
  recordId: string | null;
  seat: number | null;
};

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
  { key: "playground", label: "試算表 Playground" },
  { key: "newMetric", label: "新版測驗項目" },
];

const tabLabelByKey: Record<string, string> = {
  account: "帳號管理",
  files: "編輯檔案",
  roster: "學員名單",
  metric: "測驗項目",
  table: "測驗總表",
  pdf: "測驗報告",
  editor: "學生資料編輯",
  tablab: "Tab 元件展示",
  playground: "試算表 Playground",
  newMetric: "新版測驗項目",
  analysis: "能力分析",
};

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

function readRequestedTabFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("tab");
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

function resolveStudentGradeLabel(
  fileGradeLabel: string,
  studentGradeLabel: string,
): StudentGradeLabel {
  if (
    studentGradeLabel === "幼幼班" ||
    studentGradeLabel === "小班" ||
    studentGradeLabel === "中班" ||
    studentGradeLabel === "大班"
  ) {
    return studentGradeLabel;
  }
  if (
    fileGradeLabel === "幼幼班" ||
    fileGradeLabel === "小班" ||
    fileGradeLabel === "中班" ||
    fileGradeLabel === "大班"
  ) {
    return fileGradeLabel;
  }
  return "中班";
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

function comparableRosterEntriesForDirtyCheck(
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

type AppContentProps = {
  experimentalMode: boolean;
};

function AppContent({ experimentalMode }: AppContentProps) {
  const visibleTabs = experimentalMode ? experimentalTabs : tabs;
  const mobileTabVariant = useMemo(() => readMobileTabVariantFromUrl(), []);

  // Context Hooks
  const {
    loadCheckpoints,
    frontendIssues,
    showDiagnosticPanel,
    setShowDiagnosticPanel,
    diagnosticTitle,
    setDiagnosticTitle,
    diagnosticDescription,
    setDiagnosticDescription,
    diagnosticExpected,
    setDiagnosticExpected,
    diagnosticActual,
    setDiagnosticActual,
    diagnosticSubmitting,
    diagnosticPanelTab,
    setDiagnosticPanelTab,
    diagnosticReportHistory,
    setDiagnosticReportHistory,
    diagnosticHistoryLoading,
    setDiagnosticHistoryLoading,
    diagnosticHistoryMessage,
    setDiagnosticHistoryMessage,
    submitReport,
  } = useDiagnostics();

  const {
    currentUser,
    currentUsername,
    currentDisplayName,
    authReady,
    loginUsername,
    setLoginUsername,
    loginPassword,
    setLoginPassword,
    showLoginPanel,
    setShowLoginPanel,
    showAccountMenu,
    setShowAccountMenu,
    authMode,
    setAuthMode,
    signIn,
    register,
    signOut,
  } = useAuth();

  const {
    data,
    setData,
    selectedId,
    setSelectedId,
    setDraftRecord,
    rosterDraft,
    setRosterDraft,
    setRosterSizeInput,
    setRosterActiveCell,
  } = useFitnessData();

  const {
    friends,
    scannedFriendInvite,
    setScannedFriendInvite,
    friendInviteActionState,
    setFriendInviteActionState,
    friendInviteTraceEntries,
    friendInviteQrDataUrl,
    activeFriendInviteUrl,
    activeFriendInvite,
    pushFriendInviteTrace,
    sendRequestFromQr,
  } = useFriends();

  const {
    currentCloudFileId,
    currentCloudFileOwnerUid,
    isCloudDirty,
    cloudFiles,
    inviteIdFromUrl,
    setInviteIdFromUrl,
    currentWorkspaceFileLabel,
    currentCloudFileSummary,
    handleSaveCurrentCloudFile,
    confirmDiscardCloudChanges,
  } = useFiles();

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const requestedTab = readRequestedTabFromUrl();
    if (requestedTab && visibleTabs.some((t) => t.key === requestedTab)) {
      return requestedTab as TabKey;
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

  const [message, setMessage] = useState("前端已啟動。");
  const [debugSettings] = useState<DebugSettings>(() => loadDebugSettings());

  const isFriendInvitePage = Boolean(inviteIdFromUrl);

  const comparableRosterDraft = useMemo(
    () => comparableRosterEntriesForDirtyCheck(rosterDraft, data.gradeLabel),
    [data.gradeLabel, rosterDraft],
  );
  const comparableSavedRosterEntries = useMemo(
    () => comparableRosterEntriesForDirtyCheck(data.rosterEntries, data.gradeLabel),
    [data.gradeLabel, data.rosterEntries],
  );
  const hasRosterDraftChanges = useMemo(
    () =>
      JSON.stringify(comparableRosterDraft) !==
      JSON.stringify(comparableSavedRosterEntries),
    [comparableRosterDraft, comparableSavedRosterEntries],
  );

  // Sync historical diagnostic reports
  useEffect(() => {
    if (showDiagnosticPanel && diagnosticPanelTab === "history") {
      void refreshDiagnosticReportHistory(false);
    }
  }, [showDiagnosticPanel, diagnosticPanelTab, currentUser]);

  // Sync invite details when URL invite ID is present
  useEffect(() => {
    if (!inviteIdFromUrl) {
      setScannedFriendInvite(null);
      return;
    }

    let isCancelled = false;
    void getFriendInvite(inviteIdFromUrl)
      .then((invite: FriendInviteRecord | null) => {
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
  }, [inviteIdFromUrl, setScannedFriendInvite]);

  // Sync QR code scan action state when invite changes
  useEffect(() => {
    if (isFriendInvitePage) {
      setFriendInviteActionState({
        status: "idle",
        detail: "",
      });
    }
  }, [inviteIdFromUrl, isFriendInvitePage, setFriendInviteActionState]);

  const refreshDiagnosticReportHistory = async (showMessage = true): Promise<void> => {
    setDiagnosticHistoryLoading(true);
    setDiagnosticHistoryMessage("");
    try {
      const reports = await fetchVisibleDiagnosticReportReferences(
        db,
        currentUser?.uid ?? null,
      );
      setDiagnosticReportHistory(reports);
      setDiagnosticHistoryMessage(
        reports.length
          ? `已找到 ${reports.length} 筆曾回報問題。`
          : "目前沒有查到曾回報的問題。",
      );
      if (showMessage) {
        recordUserAction("重新整理「曾回報問題」清單。", {
          reportCount: reports.length,
          browserId: getDiagnosticBrowserId(),
          uid: currentUser?.uid ?? null,
        });
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "讀取曾回報問題失敗。";
      setDiagnosticHistoryMessage(`讀取失敗：${nextMessage}`);
      recordDiagnosticEvent("diagnostic.history-load-failed", "讀取曾回報問題失敗。", {
        error: nextMessage,
        uid: currentUser?.uid ?? null,
        browserId: getDiagnosticBrowserId(),
      });
    } finally {
      setDiagnosticHistoryLoading(false);
    }
  };

  const showAuthAlert = (title: string, detail: string): void => {
    recordUserAction(`看到「${title}」提示。`, { title, detail });
    window.alert(`${title}\n\n${detail}`);
  };

  const handleSignIn = async (): Promise<void> => {
    try {
      await signIn();
    } catch (error) {
      const nextMessage = formatAuthError(error, "帳號登入失敗。");
      showAuthAlert("登入失敗", nextMessage);
      setMessage(`帳號登入失敗：${nextMessage}`);
    }
  };

  const handleRegister = async (): Promise<void> => {
    try {
      await register();
    } catch (error) {
      const nextMessage = formatAuthError(error, "註冊失敗。");
      showAuthAlert("註冊失敗", nextMessage);
      setMessage(`註冊失敗：${nextMessage}`);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut(async () => {
        if (currentCloudFileId && isCloudDirty) {
          const shouldSave = window.confirm(
            "目前檔案有未儲存變更。按「確定」會先儲存，再登出。",
          );
          if (shouldSave) {
            const saved = await handleSaveCurrentCloudFile(
              data,
              "登出前儲存目前檔案。",
            );
            return saved;
          }
          const shouldDiscard = window.confirm(
            "要放棄目前檔案的未儲存變更並登出嗎？",
          );
          return shouldDiscard;
        }
        return true;
      });
      setMessage("已登出。");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "登出失敗。";
      showAuthAlert("登出失敗", nextMessage);
      setMessage(`登出失敗：${nextMessage}`);
    }
  };

  const handleSubmitDiagnosticReport = async (): Promise<void> => {
    if (!diagnosticDescription.trim()) {
      setMessage("請先輸入問題描述。");
      return;
    }

    try {
      const fileSnapshot = currentCloudFileId
        ? {
            fileId: currentCloudFileId,
            ownerUid: currentCloudFileOwnerUid,
            isDirty: isCloudDirty,
            workspaceLabel: currentWorkspaceFileLabel,
            summary: currentCloudFileSummary
              ? {
                  id: currentCloudFileSummary.id,
                  fileName: currentCloudFileSummary.fileName,
                  ownerUid: currentCloudFileSummary.ownerUid,
                }
              : null,
          }
        : {
            workspaceLabel: currentWorkspaceFileLabel,
          };

      const reportId = await submitReport(
        currentUser
          ? {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
            }
          : null,
        currentUsername && currentDisplayName
          ? { username: currentUsername, displayNickname: currentDisplayName }
          : null,
        fileSnapshot,
      );

      setMessage(`問題回報已送出，編號：${reportId}`);
      setShowDiagnosticPanel(false);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "送出問題回報失敗。";
      setMessage(`問題回報送出失敗：${nextMessage}`);
    }
  };

  const buildDataWithRosterDraft = (): AppData => {
    const normalizedRosterDraft = rosterDraft.map((entry) => ({
      ...entry,
      studentName: entry.studentName.trim(),
      height: entry.height.trim(),
      weight: entry.weight.trim(),
      studentGradeLabel: resolveStudentGradeLabel(
        data.gradeLabel,
        entry.studentGradeLabel,
      ),
    }));

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

    return {
      ...data,
      rosterEntries: normalizedRosterEntries,
      records: nextRecords,
    };
  };

  const handleTabChange = async (nextTab: string): Promise<void> => {
    if (nextTab === activeTab) {
      return;
    }

    recordUserAction(`切換到「${tabLabelByKey[nextTab] ?? nextTab}」分頁。`, {
      fromTab: activeTab,
      fromLabel: tabLabelByKey[activeTab] ?? activeTab,
      toTab: nextTab,
      toLabel: tabLabelByKey[nextTab] ?? nextTab,
    });

    if (activeTab === "roster" && currentCloudFileId && hasRosterDraftChanges) {
      const shouldSave = window.confirm(
        "目前學員名單有未儲存變更。按「確定」會先儲存，再切換頁面。",
      );

      if (shouldSave) {
        const nextData = buildDataWithRosterDraft();
        const saved = currentCloudFileId
          ? await handleSaveCurrentCloudFile(nextData, "切換分頁前儲存學員名單並同步雲端。")
          : false;
        if (!saved && currentCloudFileId) {
          return;
        }
        setData(nextData);
        setRosterDraft(
          nextData.rosterEntries.length
            ? nextData.rosterEntries
            : [makeEmptyRosterEntry()],
        );
        setSelectedId(nextData.records[0]?.id ?? "");
        setDraftRecord(nextData.records[0] ?? makeEmptyRecord(data.testDate));

        setMessage("已儲存學員名單，正在切換頁面。");
        setActiveTab(nextTab as TabKey);
        return;
      }

      const shouldDiscard = window.confirm(
        "要放棄目前學員名單的未儲存變更並切換頁面嗎？",
      );

      if (!shouldDiscard) {
        return;
      }

      setRosterDraft(
        data.rosterEntries.length ? data.rosterEntries : [makeEmptyRosterEntry()],
      );
      setRosterSizeInput(String(Math.max(data.rosterEntries.length, 1)));
      setRosterActiveCell(null);
      setMessage("已放棄學員名單變更，正在切換頁面。");
    }

    if (currentCloudFileId && isCloudDirty) {
      const shouldSave = window.confirm(
        "目前檔案有未儲存變更。按「確定」會先儲存，再切換頁面。",
      );

      if (shouldSave) {
        const saved = await handleSaveCurrentCloudFile(
          data,
          `切換到「${tabLabelByKey[nextTab] ?? nextTab}」前儲存目前檔案。`,
        );
        if (!saved) {
          return;
        }
        setActiveTab(nextTab as TabKey);
        return;
      }

      const shouldDiscard = window.confirm(
        "要放棄目前檔案的未儲存變更並切換頁面嗎？",
      );

      if (!shouldDiscard) {
        return;
      }

      await confirmDiscardCloudChanges();
      setMessage("已放棄檔案變更，正在切換頁面。");
    }

    setActiveTab(nextTab as TabKey);
  };

  const closeFriendInvitePage = (): void => {
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
  };

  const openAccountPanel = (): void => {
    void handleTabChange("account");
    setShowAccountMenu(false);
  };

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
                    recordUserAction(`${showDiagnosticPanel ? "關閉" : "開啟"}「回報問題」面板。`);
                    recordDiagnosticEvent("diagnostic.panel-toggled", "使用者開啟或關閉問題回報面板。", {
                      nextVisible: !showDiagnosticPanel,
                      uid: currentUser?.uid ?? null,
                      browserId: getDiagnosticBrowserId(),
                      currentCloudFileId,
                      currentCloudFileOwnerUid,
                    });
                    setShowDiagnosticPanel(!showDiagnosticPanel);
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
                        recordUserAction("按下頁首「登入」按鈕。");
                        setAuthMode("login");
                        setShowLoginPanel(authMode === "login" ? !showLoginPanel : true);
                      }}
                      type="button"
                    >
                      {authReady ? "登入" : "登入初始化中"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!authReady}
                      onClick={() => {
                        recordUserAction("按下頁首「註冊」按鈕。");
                        setAuthMode("register");
                        setShowLoginPanel(authMode === "register" ? !showLoginPanel : true);
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
                      onClick={() => {
                        recordUserAction(`${showAccountMenu ? "關閉" : "開啟"}帳號選單。`, {
                          username: currentUsername,
                        });
                        setShowAccountMenu(!showAccountMenu);
                      }}
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
                          onClick={() => {
                            void handleSignOut();
                          }}
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
              <div className="diagnostic-tabs" role="tablist" aria-label="問題回報分頁">
                <button
                  className={`diagnostic-tab ${diagnosticPanelTab === "new" ? "is-active" : ""}`}
                  onClick={() => {
                    recordUserAction("切換到「填寫回報」分頁。");
                    setDiagnosticPanelTab("new");
                  }}
                  type="button"
                >
                  填寫回報
                </button>
                <button
                  className={`diagnostic-tab ${diagnosticPanelTab === "history" ? "is-active" : ""}`}
                  onClick={() => {
                    recordUserAction("切換到「曾回報問題」分頁。");
                    setDiagnosticPanelTab("history");
                  }}
                  type="button"
                >
                  曾回報問題
                </button>
              </div>

              {diagnosticPanelTab === "new" ? (
                <>
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
                        <span>
                          {currentUser
                            ? `${currentUsername} / ${currentUser.uid}`
                            : "尚未登入，會以匿名回報送出"}
                        </span>
                        <span>瀏覽器紀錄 ID</span>
                        <span>{getDiagnosticBrowserId()}</span>
                        <span>目前檔案</span>
                        <span>
                          {currentCloudFileSummary?.fileName ?? currentWorkspaceFileLabel}
                        </span>
                        <span>版面大小</span>
                        <span>
                          {getDiagnosticEnvironment().viewport.width} ×{" "}
                          {getDiagnosticEnvironment().viewport.height}，
                          {getDiagnosticEnvironment().device.estimatedDeviceType}
                        </span>
                        <span>最近事件</span>
                        <span>{getUserActionEvents().slice(0, 8).length} 筆使用者操作，另含技術紀錄</span>
                        <span>本瀏覽器回報</span>
                        <span>{getBrowserDiagnosticReportReferences().slice(0, 5).length} 筆</span>
                      </div>
                      {getUserActionEvents().slice(0, 8).length > 0 ? (
                        <ol className="diagnostic-event-preview">
                          {getUserActionEvents()
                            .slice(0, 8)
                            .map((event) => (
                              <li key={`${event.timestamp}-${event.type}`}>
                                <span>{event.label ?? event.message}</span>
                              </li>
                            ))}
                        </ol>
                      ) : null}
                    </div>
                    <div className="button-row">
                      <button
                        className="primary-button"
                        disabled={diagnosticSubmitting}
                        onClick={() => {
                          void handleSubmitDiagnosticReport();
                        }}
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
                      <p className="auth-help">
                        目前尚未登入，回報會以匿名方式送出，但仍會包含這個瀏覽器最近的操作流程。
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="diagnostic-history">
                  <p className="auth-help">
                    這裡會用本瀏覽器儲存的回報 ID 查詢公開狀態；如果已登入，也會讀取目前帳號底下的問題回報索引。
                  </p>
                  <div className="diagnostic-history-toolbar">
                    <div className="diagnostic-summary-grid">
                      <span>瀏覽器紀錄 ID</span>
                      <span>{getDiagnosticBrowserId()}</span>
                      <span>目前帳號</span>
                      <span>
                        {currentUser ? currentUsername : "尚未登入，只查詢本瀏覽器紀錄"}
                      </span>
                    </div>
                    <button
                      className="secondary-button"
                      disabled={diagnosticHistoryLoading}
                      onClick={() => {
                        void refreshDiagnosticReportHistory(true);
                      }}
                      type="button"
                    >
                      {diagnosticHistoryLoading ? "查詢中" : "重新整理"}
                    </button>
                  </div>
                  {diagnosticHistoryMessage ? (
                    <p className="auth-help">{diagnosticHistoryMessage}</p>
                  ) : null}
                  {diagnosticReportHistory.length > 0 ? (
                    <div className="diagnostic-report-list">
                      {diagnosticReportHistory.map((report) => (
                        <article className="diagnostic-report-card" key={report.reportId}>
                          <div>
                            <strong>
                              {report.title || report.description || "未命名問題"}
                            </strong>
                            <code>{report.reportId}</code>
                          </div>
                          <p>{report.description || "沒有留下問題描述。"}</p>
                          <div className="diagnostic-report-meta">
                            <span className={`status-chip status-chip--${report.status}`}>
                              {report.statusLabel}
                            </span>
                            <span>
                              來源：{report.source === "browser" ? "本瀏覽器" : "目前帳號"}
                            </span>
                            <span>
                              建立：{formatActivityDate(report.createdAt || null)}
                            </span>
                            {report.statusUpdatedAt ? (
                              <span>更新：{formatActivityDate(report.statusUpdatedAt)}</span>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="friend-empty-state">
                      <strong>目前沒有查到曾回報問題</strong>
                      <p>
                        如果曾在另一台電腦或另一個瀏覽器回報，請先登入同一個帳號後再重新整理。
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </header>

      {experimentalMode ? (
        <section className="startup-banner experimental-banner" aria-live="polite">
          <div className="startup-banner-head">
            <h2>實驗版頁面</h2>
            <p>
              這個入口和正式版共用同一套畫面與資料流，之後新的功能會先放在這裡測試，再決定是否複製回正式版。
            </p>
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
            {(
              Object.entries(loadCheckpoints) as Array<
                [LoadCheckpointKey, LoadCheckpointState]
              >
            ).map(([key, checkpoint]) => (
              <article
                className={`startup-checkpoint is-${checkpoint.status}`}
                key={key}
              >
                <strong>{checkpoint.label}</strong>
                <span>{checkpoint.detail}</span>
              </article>
            ))}
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
                  ) : friends.some(
                      (friend) => friend.username === scannedFriendInvite?.issuedByUsername,
                    ) ? (
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
                !friends.some(
                  (friend) => friend.username === scannedFriendInvite?.issuedByUsername,
                ) ? (
                  <button
                    className="primary-button"
                    disabled={friendInviteActionState.status === "loading"}
                    onClick={() => {
                      void sendRequestFromQr(setMessage);
                    }}
                    type="button"
                  >
                    {friendInviteActionState.status === "loading" ? "送出中" : "送出好友邀請"}
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
                  !friends.some(
                    (friend) => friend.username === scannedFriendInvite?.issuedByUsername,
                  )
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
                        [
                        {new Date(entry.timestamp).toLocaleTimeString("zh-TW", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                        ] {entry.detail}
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
            {activeTab === "account" && <AccountTab setMessage={setMessage} />}
            {activeTab === "files" && (
              <FilesTab setMessage={setMessage} debugSettings={debugSettings} />
            )}
            {activeTab === "roster" && (
              <RosterTab
                setMessage={setMessage}
                debugSettings={debugSettings}
                handleTabChange={handleTabChange}
              />
            )}
            {activeTab === "metric" && (
              <MetricTab
                setMessage={setMessage}
                debugSettings={debugSettings}
                handleTabChange={handleTabChange}
              />
            )}
            {activeTab === "table" && (
              <TableTab
                setMessage={setMessage}
                debugSettings={debugSettings}
                handleTabChange={handleTabChange}
              />
            )}
            {activeTab === "pdf" && (
              <PdfReportTab
                setMessage={setMessage}
                debugSettings={debugSettings}
                handleTabChange={handleTabChange}
              />
            )}
            {activeTab === "editor" && (
              <EditorTab setMessage={setMessage} handleTabChange={handleTabChange} />
            )}
            {(activeTab === "tablab" ||
              activeTab === "playground" ||
              activeTab === "newMetric") && (
              <PlaygroundTabs
                setMessage={setMessage}
                activeTab={activeTab as "tablab" | "playground" | "newMetric"}
                handleTabChange={handleTabChange}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}

type AppProps = {
  experimentalMode?: boolean;
};

export default function App({ experimentalMode = false }: AppProps) {
  return (
    <DiagnosticProvider>
      <AuthProvider>
        <FitnessDataProvider>
          <FriendProvider>
            <FileProvider>
              <AppContent experimentalMode={experimentalMode} />
            </FileProvider>
          </FriendProvider>
        </FitnessDataProvider>
      </AuthProvider>
    </DiagnosticProvider>
  );
}
