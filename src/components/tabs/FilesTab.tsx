import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useFiles, FileSortKey } from "../../context/FileContext";
import { useFitnessData, makeEmptyRosterEntry } from "../../context/FitnessDataContext";
import { useFriends } from "../../context/FriendContext";
import { CloudFileSummary } from "../../cloud-files";
import { FriendRecord, FriendRequestRecord } from "../../friendships";
import type { StudentGradeLabel } from "../../types";
import type { DebugSettings } from "../../debug-settings";

interface FilesTabProps {
  setMessage: (msg: string) => void;
  debugSettings: DebugSettings;
}

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

function getIncomingRequestDisplayName(request: FriendRequestRecord) {
  return request.fromDisplayName?.trim() || request.fromUsername;
}

export default function FilesTab({ setMessage, debugSettings }: FilesTabProps) {
  const { currentUser } = useAuth();
  const { incomingFriendRequests, acceptRequest, rejectRequest } = useFriends();

  const {
    cloudFiles,
    currentCloudFileId,
    isCloudDirty,
    showFileSwitcher,
    setShowFileSwitcher,
    pendingSwitchFileKey,
    setPendingSwitchFileKey,
    showCreateFilePage,
    setShowCreateFilePage,
    newCloudFileDraft,
    setNewCloudFileDraft,
    selectedShareFriendUid,
    setSelectedShareFriendUid,
    fileOpenTraceEntries,
    sortedCloudFiles,
    currentCloudFileSummary,
    currentWorkspaceFileLabel,
    currentCloudFileKey,
    shareableFriends,
    sharedEditorFriends,
    availableShareFriends,
    handleSaveCurrentCloudFile,
    handleOpenCloudFile,
    handleArchiveCloudFile,
    handleShareFileWithFriend,
    handleRemoveFileEditor,
    handleCreateCloudFile,
  } = useFiles();

  const {
    data,
    setData,
    rosterDraft,
    setRosterDraft,
    setRosterActiveCell,
    rosterSizeInput,
    setRosterSizeInput,
    setDraftRecord,
  } = useFitnessData();

  const pendingSwitchFile = cloudFiles.find(
    (file) => `${file.ownerUid}:${file.id}` === pendingSwitchFileKey,
  );

  const currentCloudFileIsOwner = currentCloudFileSummary?.ownerUid === currentUser?.uid;

  const updateNewCloudFileDraft = (field: keyof NewCloudFileDraft, value: string) => {
    setNewCloudFileDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateRosterName = (nextName: string): void => {
    setData((current) => ({
      ...current,
      rosterName: nextName,
    }));
  };

  const updateGradeLabel = (nextGrade: string): void => {
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
  };

  const updateSharedTestDate = (nextDate: string): void => {
    setData((current) => ({
      ...current,
      testDate: nextDate,
      records: current.records.map((record) => ({
        ...record,
        testDate: nextDate,
      })),
    }));
  };

  const updateAcademicTerm = (nextTerm: string): void => {
    setData((current) => ({
      ...current,
      academicTerm: nextTerm,
    }));
  };

  const updateAcademicTermPart = (
    field: "academicYear" | "semester",
    value: string,
  ): void => {
    const currentParts = parseAcademicTermParts(data.academicTerm);
    const nextAcademicYear =
      field === "academicYear" ? value : currentParts.academicYear;
    const nextSemester = field === "semester" ? value : currentParts.semester;
    updateAcademicTerm(buildAcademicTermValue(nextAcademicYear, nextSemester));
  };

  const applyRosterSize = (nextValue: string = rosterSizeInput): void => {
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
  };

  const renderIncomingFriendAlertCard = () => {
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
                    void acceptRequest(request, setMessage);
                  }}
                  type="button"
                >
                  同意
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    void rejectRequest(request, setMessage);
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
  };

  return (
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
                void handleSaveCurrentCloudFile(data, "在編輯檔案分頁按下「儲存目前檔案」按鈕。");
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
      ) : cloudFiles.length === 0 && !showCreateFilePage ? (
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
                      void handleOpenCloudFile(pendingSwitchFile, setMessage);
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
                      required
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
                      max={35}
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
                      void handleCreateCloudFile(setMessage);
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
                                      setMessage,
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
                              void handleShareFileWithFriend(currentCloudFileSummary, setMessage);
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
                      void handleSaveCurrentCloudFile(data, "在編輯檔案分頁按下「儲存目前檔案」按鈕。");
                    }}
                    type="button"
                  >
                    儲存目前檔案
                  </button>
                  {currentCloudFileSummary.accessRole === "owner" ? (
                    <button
                      className="danger-button"
                      onClick={() => {
                        void handleArchiveCloudFile(currentCloudFileSummary, setMessage);
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
  );
}
