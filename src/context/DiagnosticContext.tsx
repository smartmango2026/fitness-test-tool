import React, { createContext, useContext, useState, useEffect } from "react";
import {
  getDiagnosticEvents,
  submitDiagnosticReport as submitCloudDiagnosticReport,
  type DiagnosticReportReference,
} from "../diagnostics";
import { db } from "../firebase";

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

interface DiagnosticContextType {
  loadCheckpoints: Record<LoadCheckpointKey, LoadCheckpointState>;
  setLoadCheckpoints: React.Dispatch<React.SetStateAction<Record<LoadCheckpointKey, LoadCheckpointState>>>;
  updateLoadCheckpoint: (key: LoadCheckpointKey, status: LoadCheckpointState["status"], detail: string) => void;
  frontendIssues: string[];
  setFrontendIssues: React.Dispatch<React.SetStateAction<string[]>>;
  pushFrontendIssue: (issue: string) => void;
  showDiagnosticPanel: boolean;
  setShowDiagnosticPanel: (show: boolean) => void;
  diagnosticTitle: string;
  setDiagnosticTitle: (title: string) => void;
  diagnosticDescription: string;
  setDiagnosticDescription: (desc: string) => void;
  diagnosticExpected: string;
  setDiagnosticExpected: (exp: string) => void;
  diagnosticActual: string;
  setDiagnosticActual: (act: string) => void;
  diagnosticSubmitting: boolean;
  setDiagnosticSubmitting: (submitting: boolean) => void;
  diagnosticPanelTab: "new" | "history";
  setDiagnosticPanelTab: (tab: "new" | "history") => void;
  diagnosticReportHistory: DiagnosticReportReference[];
  setDiagnosticReportHistory: React.Dispatch<React.SetStateAction<DiagnosticReportReference[]>>;
  diagnosticHistoryLoading: boolean;
  setDiagnosticHistoryLoading: (loading: boolean) => void;
  diagnosticHistoryMessage: string;
  setDiagnosticHistoryMessage: (msg: string) => void;
  submitReport: (
    currentUser: { uid: string; email: string | null; displayName: string | null } | null,
    currentProfile: { username: string | null; displayNickname: string | null } | null,
    currentFileSnapshot: Record<string, unknown>
  ) => Promise<string | null>;
}

const DiagnosticContext = createContext<DiagnosticContextType | undefined>(undefined);

export function DiagnosticProvider({ children }: { children: React.ReactNode }) {
  const [loadCheckpoints, setLoadCheckpoints] = useState<Record<LoadCheckpointKey, LoadCheckpointState>>(() =>
    makeDefaultLoadCheckpoints(),
  );
  const [frontendIssues, setFrontendIssues] = useState<string[]>([]);
  const [showDiagnosticPanel, setShowDiagnosticPanel] = useState(false);
  const [diagnosticTitle, setDiagnosticTitle] = useState("");
  const [diagnosticDescription, setDiagnosticDescription] = useState("");
  const [diagnosticExpected, setDiagnosticExpected] = useState("");
  const [diagnosticActual, setDiagnosticActual] = useState("");
  const [diagnosticSubmitting, setDiagnosticSubmitting] = useState(false);
  const [diagnosticPanelTab, setDiagnosticPanelTab] = useState<"new" | "history">("new");
  const [diagnosticReportHistory, setDiagnosticReportHistory] = useState<DiagnosticReportReference[]>([]);
  const [diagnosticHistoryLoading, setDiagnosticHistoryLoading] = useState(false);
  const [diagnosticHistoryMessage, setDiagnosticHistoryMessageInternal] = useState("");

  // Helper cast to boolean like in state type if needed, but let's change context type definition to string to match!
  // Yes: diagnosticHistoryMessage: string;
  
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

  const setDiagnosticHistoryMessage = (msg: string) => {
    setDiagnosticHistoryMessageInternal(msg);
  };

  const submitReport = async (
    currentUser: { uid: string; email: string | null; displayName: string | null } | null,
    currentProfile: { username: string | null; displayNickname: string | null } | null,
    currentFileSnapshot: Record<string, unknown>
  ): Promise<string | null> => {
    setDiagnosticSubmitting(true);
    try {
      const reportId = await submitCloudDiagnosticReport(db, {
        reporterUid: currentUser ? currentUser.uid : null,
        reporterUsername: currentProfile ? currentProfile.username : null,
        reporterDisplayName: currentProfile ? currentProfile.displayNickname : null,
        userMessage: {
          title: diagnosticTitle.trim(),
          description: diagnosticDescription.trim(),
          expected: diagnosticExpected.trim(),
          actual: diagnosticActual.trim(),
        },
        authSnapshot: currentUser
          ? {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
            }
          : {},
        currentFileSnapshot,
        frontendIssues,
      });

      // Clear input fields on success
      setDiagnosticTitle("");
      setDiagnosticDescription("");
      setDiagnosticExpected("");
      setDiagnosticActual("");
      return reportId;
    } catch (error) {
      console.error("Failed to submit diagnostic report:", error);
      throw error;
    } finally {
      setDiagnosticSubmitting(false);
    }
  };

  return (
    <DiagnosticContext.Provider
      value={{
        loadCheckpoints,
        setLoadCheckpoints,
        updateLoadCheckpoint,
        frontendIssues,
        setFrontendIssues,
        pushFrontendIssue,
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
        setDiagnosticSubmitting,
        diagnosticPanelTab,
        setDiagnosticPanelTab,
        diagnosticReportHistory,
        setDiagnosticReportHistory,
        diagnosticHistoryLoading,
        setDiagnosticHistoryLoading,
        diagnosticHistoryMessage,
        setDiagnosticHistoryMessage,
        submitReport,
      }}
    >
      {children}
    </DiagnosticContext.Provider>
  );
}

export function useDiagnostics() {
  const context = useContext(DiagnosticContext);
  if (!context) {
    throw new Error("useDiagnostics must be used within a DiagnosticProvider");
  }
  return context;
}
