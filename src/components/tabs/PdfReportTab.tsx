import React, { useMemo, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useFiles } from "../../context/FileContext";
import { useFitnessData } from "../../context/FitnessDataContext";
import { useFriends } from "../../context/FriendContext";
import A4CanvasBoard, { exportAllReportsPdf, type A4CanvasBoardHandle } from "../../A4CanvasBoard";
import { findAbilityGradeProfile, getAbilityRuleForField, getAbilityScores, getAbilityBandLabel } from "../../ability-scoring";
import { FriendRequestRecord } from "../../friendships";
import type { StudentGradeLabel, FitnessField, FitnessRecord } from "../../types";
import type { DebugSettings } from "../../debug-settings";

interface PdfReportTabProps {
  setMessage: (msg: string) => void;
  debugSettings: DebugSettings;
  handleTabChange: (tab: string) => void;
}

const scoreFields: FitnessField[] = [
  "item1",
  "item2",
  "item3",
  "item4",
  "item5",
  "item6",
];

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

export default function PdfReportTab({ setMessage, debugSettings, handleTabChange }: PdfReportTabProps) {
  const { currentUser } = useAuth();
  const { incomingFriendRequests, acceptRequest, rejectRequest } = useFriends();

  const {
    currentWorkspaceFileLabel,
  } = useFiles();

  const {
    data,
    selectedId,
    setSelectedId,
    setDraftRecord,
    abilityRulesConfig,
  } = useFitnessData();

  const pdfCanvasRef = useRef<A4CanvasBoardHandle | null>(null);

  const selectedRecord = useMemo(
    () => data.records.find((record) => record.id === selectedId) ?? null,
    [data.records, selectedId],
  );

  const currentAbilityProfile = useMemo(
    () => findAbilityGradeProfile(abilityRulesConfig, resolveStudentGradeLabel(data.gradeLabel, selectedRecord?.studentGradeLabel || "")),
    [abilityRulesConfig, data.gradeLabel, selectedRecord],
  );

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

  const selectRecord = (record: FitnessRecord): void => {
    setSelectedId(record.id);
    setDraftRecord({ ...record });
  };

  const handleDownloadAllPdfs = async (): Promise<void> => {
    await exportAllReportsPdf({
      abilityProfile: currentAbilityProfile,
      abilityRulesConfig,
      fileGradeLabel: data.gradeLabel,
      records: data.records,
      rosterName: data.rosterName,
      testDate: data.testDate,
    });
    setMessage(`已下載 ${data.rosterName || "本班"} 全班報告。`);
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

  const renderWorkspaceFileCard = () => {
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
  };

  const renderNoStudentsCard = (pageLabel: string) => {
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
  };

  return (
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
  );
}
