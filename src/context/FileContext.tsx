import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useDiagnostics } from "./DiagnosticContext";
import { useFitnessData, makeEmptyRecord, makeEmptyRosterEntry } from "./FitnessDataContext";
import { useFriends } from "./FriendContext";
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
} from "../cloud-files";
import { recordDiagnosticEvent, recordUserAction } from "../diagnostics";
import { createSystemLogOperationId } from "../system-logs";
import type { AppData, StudentGradeLabel } from "../types";

export type FileSortKey = "created-desc" | "updated-desc" | "name-asc" | "roster-asc" | "grade-asc";

type NewCloudFileDraft = {
  academicYear: string;
  semester: string;
  rosterName: string;
  gradeLabel: string;
  testDate: string;
  rosterCount: string;
};

const GRADE_OPTIONS = ["幼幼班", "小班", "中班", "大班", "混齡班"];
const CURRENT_ROC_YEAR = new Date().getFullYear() - 1911;
const ACADEMIC_YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) =>
  String(CURRENT_ROC_YEAR - 2 + index),
);
const TERM_OPTIONS = ["上學期", "下學期"] as const;

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

const LAST_CLOUD_FILE_STORAGE_PREFIX = "fitness-test-tool:last-cloud-file:";

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
    // ignore
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

type FileOpenTraceEntry = {
  timestamp: string;
  status: "info" | "success" | "error";
  detail: string;
};

const FILE_OPEN_TRACE_STORAGE_KEY = "fitness-test-tool:file-open-trace";

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
    // ignore
  }
}

interface FileContextType {
  cloudFiles: CloudFileSummary[];
  currentCloudFileId: string | null;
  setCurrentCloudFileId: React.Dispatch<React.SetStateAction<string | null>>;
  currentCloudFileOwnerUid: string | null;
  setCurrentCloudFileOwnerUid: React.Dispatch<React.SetStateAction<string | null>>;
  isCloudDirty: boolean;
  setIsCloudDirty: React.Dispatch<React.SetStateAction<boolean>>;
  expandedCloudFileId: string | null;
  setExpandedCloudFileId: React.Dispatch<React.SetStateAction<string | null>>;
  showFileSwitcher: boolean;
  setShowFileSwitcher: React.Dispatch<React.SetStateAction<boolean>>;
  pendingSwitchFileKey: string;
  setPendingSwitchFileKey: React.Dispatch<React.SetStateAction<string>>;
  showCreateFilePage: boolean;
  setShowCreateFilePage: React.Dispatch<React.SetStateAction<boolean>>;
  newCloudFileDraft: NewCloudFileDraft;
  setNewCloudFileDraft: React.Dispatch<React.SetStateAction<NewCloudFileDraft>>;
  shareEditorUids: string[];
  setShareEditorUids: React.Dispatch<React.SetStateAction<string[]>>;
  selectedShareFriendUid: string;
  setSelectedShareFriendUid: React.Dispatch<React.SetStateAction<string>>;
  cloudFileDrafts: Record<string, { rosterName: string; gradeLabel: string; academicTerm: string; testDate: string }>;
  setCloudFileDrafts: React.Dispatch<React.SetStateAction<Record<string, { rosterName: string; gradeLabel: string; academicTerm: string; testDate: string }>>>;
  fileOpenTraceEntries: FileOpenTraceEntry[];
  setFileOpenTraceEntries: React.Dispatch<React.SetStateAction<FileOpenTraceEntry[]>>;
  inviteIdFromUrl: string;
  setInviteIdFromUrl: React.Dispatch<React.SetStateAction<string>>;
  fileSortKey: FileSortKey;
  sortedCloudFiles: CloudFileSummary[];
  currentCloudFileSummary: CloudFileSummary | null;
  currentWorkspaceFileLabel: string;
  currentCloudFileKey: string;
  shareTargetFileSummary: CloudFileSummary | null;
  effectiveSharedEditorUids: string[];
  shareableFriends: any[];
  sharedEditorFriends: any[];
  availableShareFriends: any[];
  pushFileOpenTrace: (status: FileOpenTraceEntry["status"], detail: string) => void;
  handleSaveCurrentCloudFile: (dataToSave?: AppData, actionLabel?: string) => Promise<boolean>;
  restoreCurrentCloudFileFromServer: () => Promise<boolean>;
  handleOpenCloudFile: (file: CloudFileSummary, setMessage: (msg: string) => void) => Promise<void>;
  updateCloudFileDraft: (fileId: string, field: "rosterName" | "gradeLabel" | "academicTerm" | "testDate", value: string) => void;
  updateCloudFileDraftTermPart: (fileId: string, field: "academicYear" | "semester", value: string) => void;
  handleSaveCloudFileInfo: (file: CloudFileSummary, setMessage: (msg: string) => void) => Promise<void>;
  handleArchiveCloudFile: (file: CloudFileSummary, setMessage: (msg: string) => void) => Promise<void>;
  handleShareFileWithFriend: (file: CloudFileSummary, setMessage: (msg: string) => void) => Promise<void>;
  handleRemoveFileEditor: (file: CloudFileSummary, friendUid: string, setMessage: (msg: string) => void) => Promise<void>;
  handleCreateCloudFile: (setMessage: (msg: string) => void) => Promise<void>;
  resetFileSessionState: () => void;
  confirmDiscardCloudChanges: () => boolean;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

export function FileProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, currentUsername, currentProfile, writeAppSystemLog } = useAuth();
  const { updateLoadCheckpoint, pushFrontendIssue } = useDiagnostics();
  const { friends } = useFriends();
  const { data, resetFitnessData, setData, setSelectedId, setDraftRecord, setRosterDraft, setRosterSizeInput } = useFitnessData();

  const [cloudFiles, setCloudFiles] = useState<CloudFileSummary[]>([]);
  const [currentCloudFileId, setCurrentCloudFileId] = useState<string | null>(null);
  const [currentCloudFileOwnerUid, setCurrentCloudFileOwnerUid] = useState<string | null>(null);
  const [isCloudDirty, setIsCloudDirty] = useState(false);
  const [expandedCloudFileId, setExpandedCloudFileId] = useState<string | null>(null);
  const [showFileSwitcher, setShowFileSwitcher] = useState(false);
  const [pendingSwitchFileKey, setPendingSwitchFileKey] = useState("");
  const [showCreateFilePage, setShowCreateFilePage] = useState(false);
  const [newCloudFileDraft, setNewCloudFileDraft] = useState<NewCloudFileDraft>(() =>
    makeNewCloudFileDraft(data),
  );
  const [shareEditorUids, setShareEditorUids] = useState<string[]>([]);
  const [selectedShareFriendUid, setSelectedShareFriendUid] = useState("");
  const [cloudFileDrafts, setCloudFileDrafts] = useState<
    Record<string, { rosterName: string; gradeLabel: string; academicTerm: string; testDate: string }>
  >({});
  const [fileOpenTraceEntries, setFileOpenTraceEntries] = useState<FileOpenTraceEntry[]>(() =>
    loadFileOpenTrace(),
  );
  const [inviteIdFromUrl, setInviteIdFromUrl] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("friendInvite") ?? params.get("invite") ?? "";
    }
    return "";
  });
  const [fileSortKey] = useState<FileSortKey>("created-desc");

  const skipNextCloudDirtyRef = useRef(false);
  const autoOpenedLastCloudFileRef = useRef<string | null>(null);
  const shareRepairSignatureRef = useRef<string | null>(null);

  // Sync open trace persistence
  useEffect(() => {
    saveFileOpenTrace(fileOpenTraceEntries);
  }, [fileOpenTraceEntries]);

  // Sync cloudFiles subscription
  useEffect(() => {
    if (!currentUser) {
      setCloudFiles([]);
      setCurrentCloudFileId(null);
      setCurrentCloudFileOwnerUid(null);
      setIsCloudDirty(false);
      setExpandedCloudFileId(null);
      return;
    }

    let filesLoaded = false;

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
        const nextMessage = error instanceof Error ? error.message : "無法載入雲端檔案列表。";
        updateLoadCheckpoint("cloudFiles", "error", nextMessage);
        pushFrontendIssue(`雲端檔案列表載入失敗：${nextMessage}`);
      },
    );

    return () => {
      unsubscribeCloudFiles();
    };
  }, [currentUser]);

  // Auto restore last opened file
  useEffect(() => {
    if (!currentUser || currentCloudFileId || cloudFiles.length === 0) {
      return;
    }

    const lastSelection = readLastCloudFileSelection(currentUser.uid);
    const lastFileKey = lastSelection ? `${lastSelection.ownerUid}:${lastSelection.fileId}` : null;
    if (lastFileKey && autoOpenedLastCloudFileRef.current === lastFileKey) {
      return;
    }

    const newestFile = [...cloudFiles].sort((left, right) =>
      (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
    )[0];
    const targetFile = lastSelection
      ? cloudFiles.find(
          (file) => file.id === lastSelection.fileId && file.ownerUid === lastSelection.ownerUid,
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

    if (lastSelection && !cloudFiles.some((f) => f.id === lastSelection.fileId && f.ownerUid === lastSelection.ownerUid)) {
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
          nextData.rosterEntries.length ? nextData.rosterEntries : [makeEmptyRosterEntry()],
        );
        setRosterSizeInput(String(nextData.rosterEntries.length || 1));
        setExpandedCloudFileId(targetFile.id);
        void getCloudFileEditorUids(targetFile.ownerUid, targetFile.id).then(setShareEditorUids);
        updateLoadCheckpoint("restoreFile", "success", `已開啟檔案：${targetFile.fileName}`);
      })
      .catch((error) => {
        const nextMessage = error instanceof Error ? error.message : "無法開啟上次使用的檔案。";
        updateLoadCheckpoint("restoreFile", "error", nextMessage);
        pushFrontendIssue(`自動開啟檔案失敗：${nextMessage}`);
      });
  }, [cloudFiles, currentCloudFileId, currentUser]);

  // Keep track of checkpoint default states when not logged in
  useEffect(() => {
    if (currentUser && cloudFiles.length === 0 && !currentCloudFileId) {
      updateLoadCheckpoint("restoreFile", "success", "目前沒有可自動開啟的檔案。");
    }
  }, [cloudFiles.length, currentCloudFileId, currentUser]);

  // Track isCloudDirty flag
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

  // Page BeforeUnload Listener
  useEffect(() => {
    if (!currentCloudFileId || !isCloudDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentCloudFileId, isCloudDirty]);

  // Load editor UIDs for shares
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

  // Sync last opened selection in local storage
  useEffect(() => {
    if (!currentUser || !currentCloudFileId || !currentCloudFileOwnerUid) {
      return;
    }

    writeLastCloudFileSelection(currentUser.uid, {
      fileId: currentCloudFileId,
      ownerUid: currentCloudFileOwnerUid,
    });
  }, [currentCloudFileId, currentCloudFileOwnerUid, currentUser]);

  // Sync switcher pending switch key
  useEffect(() => {
    if (!showFileSwitcher) return;
    if (currentCloudFileId && currentCloudFileOwnerUid) {
      setPendingSwitchFileKey(`${currentCloudFileOwnerUid}:${currentCloudFileId}`);
    } else if (cloudFiles.length > 0) {
      const sorted = [...cloudFiles].sort((left, right) =>
        (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
      );
      setPendingSwitchFileKey(`${sorted[0].ownerUid}:${sorted[0].id}`);
    }
  }, [currentCloudFileId, currentCloudFileOwnerUid, showFileSwitcher, cloudFiles]);

  // Sync new cloud file draft
  useEffect(() => {
    if (!showCreateFilePage) return;
    setNewCloudFileDraft(makeNewCloudFileDraft(data));
  }, [data, showCreateFilePage]);

  // Memo derivations
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

  const currentCloudFileSummary = useMemo(
    () =>
      cloudFiles.find(
        (file) => file.id === currentCloudFileId && file.ownerUid === currentCloudFileOwnerUid,
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

  const currentWorkspaceFileLabel = currentCloudFileSummary
    ? `${currentCloudFileSummary.accessRole === "owner" ? "" : "【共享】"}${currentCloudFileSummary.academicTerm}／${currentCloudFileSummary.rosterName}`
    : "尚未開啟檔案";

  const shareableFriends = useMemo(
    () => friends.filter((friend) => friend.friendUid !== currentUser?.uid),
    [friends, currentUser],
  );

  const sharedEditorFriends = useMemo(
    () => shareableFriends.filter((friend) => effectiveSharedEditorUids.includes(friend.friendUid)),
    [effectiveSharedEditorUids, shareableFriends],
  );

  const availableShareFriends = useMemo(
    () => shareableFriends.filter((friend) => !effectiveSharedEditorUids.includes(friend.friendUid)),
    [effectiveSharedEditorUids, shareableFriends],
  );

  const pushFileOpenTrace = (status: FileOpenTraceEntry["status"], detail: string) => {
    const entry: FileOpenTraceEntry = {
      timestamp: new Date().toISOString(),
      status,
      detail,
    };
    setFileOpenTraceEntries((current) => [entry, ...current].slice(0, 10));
  };

  const resetFileSessionState = () => {
    autoOpenedLastCloudFileRef.current = null;
    shareRepairSignatureRef.current = null;
    skipNextCloudDirtyRef.current = true;
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
    resetFitnessData();
  };

  const confirmDiscardCloudChanges = (): boolean => {
    if (!currentCloudFileId || !isCloudDirty) {
      return true;
    }
    return window.confirm(
      "目前編輯的檔案還有尚未儲存的變更，開啟新檔案會覆蓋目前變更。確定要開啟新檔案嗎？",
    );
  };

  const handleSaveCurrentCloudFile = async (
    dataToSave: AppData = data,
    actionLabel = "按下「儲存目前檔案」按鈕。",
  ): Promise<boolean> => {
    if (!currentUser || !currentCloudFileId || !currentCloudFileOwnerUid) {
      return false;
    }

    try {
      recordUserAction(actionLabel, {
        fileId: currentCloudFileId,
        ownerUid: currentCloudFileOwnerUid,
        rosterName: dataToSave.rosterName,
        recordCount: dataToSave.records.length,
        rosterCount: dataToSave.rosterEntries.length,
      });

      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "file_saved",
        phase: "started",
        ownerUid: currentCloudFileOwnerUid,
        fileId: currentCloudFileId,
        fileName: dataToSave.academicTerm
          ? `${dataToSave.academicTerm} / ${dataToSave.rosterName || "未命名班級"}`
          : dataToSave.rosterName || "未命名班級",
        message: "開始儲存雲端檔案。",
      });

      await saveCloudFileData({
        ownerUid: currentCloudFileOwnerUid,
        fileId: currentCloudFileId,
        username: currentUsername,
        displayName: currentProfile?.displayNickname ?? null,
        data: dataToSave,
      });

      await writeAppSystemLog({
        operationId,
        actionType: "file_saved",
        phase: "completed",
        ownerUid: currentCloudFileOwnerUid,
        fileId: currentCloudFileId,
        fileName: dataToSave.academicTerm
          ? `${dataToSave.academicTerm} / ${dataToSave.rosterName || "未命名班級"}`
          : dataToSave.rosterName || "未命名班級",
        message: "已儲存雲端檔案。",
      });

      setIsCloudDirty(false);
      return true;
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "儲存雲端檔案失敗。";
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
      return false;
    }
  };

  const restoreCurrentCloudFileFromServer = async (): Promise<boolean> => {
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
      return true;
    } catch (error) {
      return false;
    }
  };

  const handleOpenCloudFile = async (file: CloudFileSummary, setMessage: (msg: string) => void) => {
    if (!currentUser) {
      pushFileOpenTrace("error", "未登入，無法切換檔案。");
      setMessage("請先登入，再開啟雲端檔案。");
      return;
    }

    if (!confirmDiscardCloudChanges()) {
      pushFileOpenTrace("info", `已取消切換「${file.fileName}」，因為目前檔案仍有未儲存變更。`);
      return;
    }

    try {
      setFileOpenTraceEntries([]);
      saveFileOpenTrace([]);
      pushFileOpenTrace("info", `開始切換檔案：${file.fileName}`);
      const operationId = createSystemLogOperationId();
      recordUserAction(`開啟檔案「${file.fileName}」。`, {
        fileId: file.id,
        ownerUid: file.ownerUid,
        accessRole: file.accessRole,
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

      const nextData = await loadCloudFile(file.ownerUid, file.id);
      pushFileOpenTrace(
        "success",
        `已從雲端讀到檔案內容，名冊 ${nextData.rosterEntries.length} 人，測驗紀錄 ${nextData.records.length} 筆。`,
      );

      skipNextCloudDirtyRef.current = true;
      setData(nextData);
      setCurrentCloudFileId(file.id);
      setCurrentCloudFileOwnerUid(file.ownerUid);
      setExpandedCloudFileId(file.id);
      setIsCloudDirty(false);
      
      const nextShareEditorUids = await getCloudFileEditorUids(file.ownerUid, file.id);
      setShareEditorUids(nextShareEditorUids);

      setSelectedId(nextData.records[0]?.id ?? "");
      setDraftRecord(nextData.records[0] ?? makeEmptyRecord(nextData.testDate));
      setRosterDraft(
        nextData.rosterEntries.length ? nextData.rosterEntries : [makeEmptyRosterEntry()],
      );
      setRosterSizeInput(String(nextData.rosterEntries.length || 1));

      await writeAppSystemLog({
        operationId,
        actionType: "file_opened",
        phase: "completed",
        ownerUid: file.ownerUid,
        fileId: file.id,
        fileName: file.fileName,
        message: "已開啟雲端檔案。",
      });

      setMessage(`已切換到檔案：${file.fileName}`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "開啟雲端檔案失敗。";
      pushFileOpenTrace("error", `切換失敗：${nextMessage}`);
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
  };

  const updateCloudFileDraft = (
    fileId: string,
    field: "rosterName" | "gradeLabel" | "academicTerm" | "testDate",
    value: string,
  ) => {
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
  };

  const updateCloudFileDraftTermPart = (
    fileId: string,
    field: "academicYear" | "semester",
    value: string,
  ) => {
    const currentValue =
      cloudFileDrafts[fileId]?.academicTerm ??
      cloudFiles.find((file) => file.id === fileId)?.academicTerm ??
      "";
    const currentParts = parseAcademicTermParts(currentValue);
    const nextAcademicYear = field === "academicYear" ? value : currentParts.academicYear;
    const nextSemester = field === "semester" ? value : currentParts.semester;

    updateCloudFileDraft(
      fileId,
      "academicTerm",
      buildAcademicTermValue(nextAcademicYear, nextSemester),
    );
  };

  const handleSaveCloudFileInfo = async (file: CloudFileSummary, setMessage: (msg: string) => void) => {
    if (!currentUser) {
      setMessage("請先登入，再更新檔案資訊。");
      return;
    }

    const draft = cloudFileDrafts[file.id];
    if (!draft) {
      return;
    }

    try {
      recordUserAction(`按下「儲存檔案資訊」按鈕：${file.fileName}。`, {
        fileId: file.id,
        ownerUid: file.ownerUid,
        fileName: file.fileName,
      });

      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "file_info_updated",
        phase: "started",
        ownerUid: currentUser.uid,
        fileId: file.id,
        fileName: file.fileName,
        message: "開始更新檔案資訊。",
        payload: { ...draft },
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
        payload: { ...draft },
      });

      setMessage(`已更新檔案資訊：${file.fileName}`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "更新檔案資訊失敗。";
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
  };

  const handleArchiveCloudFile = async (file: CloudFileSummary, setMessage: (msg: string) => void) => {
    if (!currentUser) {
      setMessage("請先登入，再封存檔案。");
      return;
    }

    const confirmed = window.confirm(
      `確定要封存「${file.fileName}」嗎？封存後它會從清單中移除，但不會真的刪除資料。`,
    );
    if (!confirmed) return;

    const doubleConfirmed = window.confirm(
      `請再次確認：要把「${file.fileName}」從檔案清單中封存移除嗎？`,
    );
    if (!doubleConfirmed) return;

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
      const nextMessage = error instanceof Error ? error.message : "封存檔案失敗。";
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
  };

  const persistFileEditors = async (
    file: CloudFileSummary,
    nextEditorUids: string[],
    successMessage: string,
    setMessage: (msg: string) => void,
  ): Promise<void> => {
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
      const nextMessage = error instanceof Error ? error.message : "更新共同編輯好友失敗。";
      setMessage(`更新共同編輯好友失敗：${nextMessage}`);
      throw error instanceof Error ? error : new Error(nextMessage);
    }
  };

  const handleShareFileWithFriend = async (file: CloudFileSummary, setMessage: (msg: string) => void) => {
    if (!selectedShareFriendUid) {
      setMessage("請先選擇要分享的好友。");
      return;
    }

    const targetFriend = shareableFriends.find((friend) => friend.friendUid === selectedShareFriendUid);
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
        setMessage,
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
      const nextMessage = error instanceof Error ? error.message : "分享檔案失敗。";
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
  };

  const handleRemoveFileEditor = async (
    file: CloudFileSummary,
    friendUid: string,
    setMessage: (msg: string) => void,
  ) => {
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
        setMessage,
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
      const nextMessage = error instanceof Error ? error.message : "取消分享失敗。";
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
  };

  const handleCreateCloudFile = async (setMessage: (msg: string) => void) => {
    if (!currentUser) {
      setMessage("請先登入，再新增檔案。");
      return;
    }

    const { rosterName, gradeLabel, academicYear, semester, testDate, rosterCount } = newCloudFileDraft;
    const trimmedRosterName = rosterName.trim();
    if (!trimmedRosterName) {
      setMessage("請輸入班級名稱。");
      return;
    }

    const nextCount = Number(rosterCount);
    if (!Number.isInteger(nextCount) || nextCount <= 0 || nextCount > 250) {
      setMessage("班級人數請輸入 1 到 250 之間的正整數。");
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "file_created",
        phase: "started",
        ownerUid: currentUser.uid,
        message: "開始建立雲端檔案。",
      });

      const nextRosterEntries = Array.from({ length: nextCount }, (_, index) => ({
        id: crypto.randomUUID(),
        studentName: "",
        height: "",
        weight: "",
        studentGradeLabel: (gradeLabel === "混齡班" ? "大班" : gradeLabel) as StudentGradeLabel,
      }));

      const nextRecords = nextRosterEntries.map((entry) => ({
        id: crypto.randomUUID(),
        studentName: "",
        height: "",
        weight: "",
        studentGradeLabel: entry.studentGradeLabel,
        testDate,
        item1: 0,
        item2: 0,
        item3: 0,
        item4: 0,
        item5: 0,
        item6: 0,
        comment: "",
      }));

      const newFileId = await createCloudFile({
        uid: currentUser.uid,
        username: currentUsername,
        displayName: currentProfile?.displayNickname ?? null,
        data: {
          schemaVersion: data.schemaVersion,
          academicTerm: buildAcademicTermValue(academicYear, semester),
          rosterName: trimmedRosterName,
          gradeLabel,
          testDate,
          itemLabels: data.itemLabels,
          rosterEntries: nextRosterEntries,
          records: nextRecords,
        },
      });

      await writeAppSystemLog({
        operationId,
        actionType: "file_created",
        phase: "completed",
        ownerUid: currentUser.uid,
        fileId: newFileId,
        fileName: `${buildAcademicTermValue(academicYear, semester)} / ${trimmedRosterName}`,
        message: "已建立雲端檔案。",
      });

      setShowCreateFilePage(false);
      setMessage(`已建立雲端檔案：${trimmedRosterName}`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "建立雲端檔案失敗。";
      await writeAppSystemLog({
        actionType: "file_created",
        phase: "failed",
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  };

  return (
    <FileContext.Provider
      value={{
        cloudFiles,
        currentCloudFileId,
        setCurrentCloudFileId,
        currentCloudFileOwnerUid,
        setCurrentCloudFileOwnerUid,
        isCloudDirty,
        setIsCloudDirty,
        expandedCloudFileId,
        setExpandedCloudFileId,
        showFileSwitcher,
        setShowFileSwitcher,
        pendingSwitchFileKey,
        setPendingSwitchFileKey,
        showCreateFilePage,
        setShowCreateFilePage,
        newCloudFileDraft,
        setNewCloudFileDraft,
        shareEditorUids,
        setShareEditorUids,
        selectedShareFriendUid,
        setSelectedShareFriendUid,
        cloudFileDrafts,
        setCloudFileDrafts,
        fileOpenTraceEntries,
        setFileOpenTraceEntries,
        inviteIdFromUrl,
        setInviteIdFromUrl,
        fileSortKey,
        sortedCloudFiles,
        currentCloudFileSummary,
        currentWorkspaceFileLabel,
        currentCloudFileKey,
        shareTargetFileSummary,
        effectiveSharedEditorUids,
        shareableFriends,
        sharedEditorFriends,
        availableShareFriends,
        pushFileOpenTrace,
        handleSaveCurrentCloudFile,
        restoreCurrentCloudFileFromServer,
        handleOpenCloudFile,
        updateCloudFileDraft,
        updateCloudFileDraftTermPart,
        handleSaveCloudFileInfo,
        handleArchiveCloudFile,
        handleShareFileWithFriend,
        handleRemoveFileEditor,
        handleCreateCloudFile,
        resetFileSessionState,
        confirmDiscardCloudChanges,
      }}
    >
      {children}
    </FileContext.Provider>
  );
}

export function useFiles() {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error("useFiles must be used within a FileProvider");
  }
  return context;
}
export { parseAcademicTermParts, buildAcademicTermValue };
