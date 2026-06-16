import React, { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useFiles } from "../../context/FileContext";
import { useFitnessData } from "../../context/FitnessDataContext";
import { useFriends } from "../../context/FriendContext";
import SpreadsheetPlayground from "../../SpreadsheetPlayground";
import NewMetricPlayground from "../../NewMetricPlayground";
import { findAbilityGradeProfile, getAbilityRuleForField, getDisplayValueForField, getRubricOptions } from "../../ability-scoring";
import { FriendRequestRecord } from "../../friendships";
import type { StudentGradeLabel, FitnessField, FitnessRecord } from "../../types";

interface PlaygroundTabsProps {
  setMessage: (msg: string) => void;
  activeTab: "tablab" | "playground" | "newMetric";
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

function normalizeNumber(value: string): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

export default function PlaygroundTabs({ setMessage, activeTab, handleTabChange }: PlaygroundTabsProps) {
  const { currentUser } = useAuth();
  const { incomingFriendRequests, acceptRequest, rejectRequest } = useFriends();

  const {
    currentCloudFileId,
    currentWorkspaceFileLabel,
    handleSaveCurrentCloudFile,
    isCloudDirty,
  } = useFiles();

  const {
    data,
    setData,
    selectedId,
    activeMetric,
    setActiveMetric,
    abilityRulesConfig,
  } = useFitnessData();

  const [tabShowcaseSelections, setTabShowcaseSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      tabShowcaseSamples.map((sample) => [sample.id, sample.items[0] ?? ""]),
    ),
  );

  const selectedRecord = useMemo(
    () => data.records.find((record) => record.id === selectedId) ?? null,
    [data.records, selectedId],
  );

  const currentAbilityProfile = useMemo(
    () => findAbilityGradeProfile(abilityRulesConfig, resolveStudentGradeLabel(data.gradeLabel, selectedRecord?.studentGradeLabel || "")),
    [abilityRulesConfig, data.gradeLabel, selectedRecord],
  );

  const getRecordGradeLabel = (record: FitnessRecord | null): string => {
    if (!record) {
      return data.gradeLabel;
    }
    return resolveStudentGradeLabel(data.gradeLabel, record.studentGradeLabel);
  };

  const getProfileForRecord = (record: FitnessRecord | null) => {
    return findAbilityGradeProfile(abilityRulesConfig, getRecordGradeLabel(record));
  };

  const getMetricRule = (field: FitnessField, record: FitnessRecord | null) => {
    return getAbilityRuleForField(getProfileForRecord(record), field);
  };

  const getMetricDisplayValue = (record: FitnessRecord, field: FitnessField): string => {
    return getDisplayValueForField(record[field], getMetricRule(field, record));
  };

  const getMetricSelectOptions = (field: FitnessField, record: FitnessRecord | null) => {
    return getRubricOptions(getMetricRule(field, record));
  };

  const resolvedItemLabels = useMemo(() => {
    return scoreFields.map(
      (field, index) =>
        getAbilityRuleForField(currentAbilityProfile, field)?.metricLabel ??
        data.itemLabels[index] ??
        field,
    );
  }, [currentAbilityProfile, data.itemLabels]);

  const updateTableField = (
    recordId: string,
    field: keyof FitnessRecord,
    value: string,
  ): void => {
    setData((current) => ({
      ...current,
      records: current.records.map((record) => {
        if (record.id !== recordId) {
          return record;
        }
        if (field === "studentName" || field === "height" || field === "weight" || field === "comment") {
          return {
            ...record,
            [field]: value,
          };
        }
        if (field === "studentGradeLabel") {
          return {
            ...record,
            studentGradeLabel: isStudentGradeLabel(value) ? value : record.studentGradeLabel,
          };
        }
        return {
          ...record,
          [field]: normalizeNumber(value),
        };
      }),
    }));
  };

  const getMetricRangeHint = (field: FitnessField): string => {
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

  if (activeTab === "tablab") {
    return (
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
    );
  }

  if (activeTab === "playground") {
    return <SpreadsheetPlayground />;
  }

  if (activeTab === "newMetric") {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>新版測驗項目</h2>
            <p>使用類似 Excel 試算表之固定寬度與字型表格，僅保留「學生姓名」與「測驗數值」兩個欄位。點擊欄位按 Tab 或上下鍵可自動切換並進行鍵盤編輯，支援網頁不跳動焦點。</p>
          </div>
        </div>
        {renderIncomingFriendAlertCard()}
        {renderWorkspaceFileCard()}
        {data.records.length === 0 ? renderNoStudentsCard("新版測驗項目") : null}
        {data.records.length > 0 ? (
          <NewMetricPlayground
            data={data}
            activeMetric={activeMetric}
            setActiveMetric={setActiveMetric}
            scoreFields={scoreFields}
            resolvedItemLabels={resolvedItemLabels}
            updateTableField={updateTableField}
            getMetricRule={getMetricRule}
            getMetricDisplayValue={getMetricDisplayValue}
            getMetricSelectOptions={getMetricSelectOptions}
            getMetricRangeHint={getMetricRangeHint}
            isCloudDirty={isCloudDirty}
            currentCloudFileId={currentCloudFileId}
            handleSaveCurrentCloudFile={handleSaveCurrentCloudFile}
          />
        ) : null}
      </section>
    );
  }

  return null;
}
