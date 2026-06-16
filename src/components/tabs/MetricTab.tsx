import React, { useMemo, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useFiles } from "../../context/FileContext";
import { useFitnessData } from "../../context/FitnessDataContext";
import { useFriends } from "../../context/FriendContext";
import { useIdSpreadsheetGrid } from "../../hooks/useSpreadsheetGrid";
import { findAbilityGradeProfile } from "../../ability-scoring";
import { getAbilityRuleForField, getDisplayValueForField, getRubricOptions } from "../../ability-scoring";
import { abilityRulesByGradeGroup } from "../../ability-rules";
import { FriendRequestRecord } from "../../friendships";
import type { StudentGradeLabel, FitnessField, FitnessRecord } from "../../types";
import type { DebugSettings } from "../../debug-settings";

interface MetricTabProps {
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

function isMixedAgeClass(gradeLabel: string): boolean {
  return gradeLabel === "混齡班";
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

function getEditableFieldLabel(
  field: string,
  resolvedItemLabels: string[],
): string {
  if (field === "studentName") return "學生姓名";
  if (field === "height") return "身高";
  if (field === "weight") return "體重";
  if (field === "studentGradeLabel") return "年級";
  if (field === "comment") return "評語";
  const scoreIndex = scoreFields.indexOf(field as FitnessField);
  return scoreIndex >= 0 ? resolvedItemLabels[scoreIndex] ?? field : field;
}

export default function MetricTab({ setMessage, debugSettings, handleTabChange }: MetricTabProps) {
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
    setSelectedId,
    activeCell,
    setActiveCell,
    activeMetric,
    setActiveMetric,
    metricViewportWidth,
    setMetricViewportWidth,
    metricNaturalWidth,
    setMetricNaturalWidth,
    abilityRulesConfig,
    setDraftRecord,
  } = useFitnessData();

  const metricViewportRef = useRef<HTMLDivElement | null>(null);
  const metricTableRef = useRef<HTMLTableElement | null>(null);
  const previousMetricScaleRef = useRef(1);
  const metricZoomMode = 1.1;

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
      if (juniorLabel && middleSeniorLabel && juniorLabel !== middleSeniorLabel) {
        return `${middleSeniorLabel} / ${juniorLabel}`;
      }
      return middleSeniorLabel ?? juniorLabel ?? data.itemLabels[index] ?? field;
    });
  }, [currentAbilityProfile, data.gradeLabel, data.itemLabels]);

  const activeMetricIndex = scoreFields.indexOf(activeMetric);
  const activeMetricLabel = resolvedItemLabels[activeMetricIndex] ?? activeMetric;

  const metricScale = useMemo(() => {
    if (!metricViewportWidth) {
      return 1.1;
    }
    return Math.max(0.6, Math.min(1.1, metricViewportWidth / metricNaturalWidth));
  }, [metricViewportWidth, metricNaturalWidth]);

  // Viewport resize observer
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
  }, [data.records, activeMetric, activeMetricLabel]);

  // Maintain position on scale change
  useEffect(() => {
    const viewport = metricViewportRef.current;
    if (!viewport) {
      return;
    }

    const previousScale = previousMetricScaleRef.current;
    const nextScale = metricScale;
    previousMetricScaleRef.current = nextScale;

    const previousScrollableWidth = viewport.scrollWidth;
    const maxScrollLeft = Math.max(0, previousScrollableWidth - viewport.clientWidth);
    const scrollRatio = maxScrollLeft > 0 ? viewport.scrollLeft / maxScrollLeft : 0;

    requestAnimationFrame(() => {
      const nextMaxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollLeft = nextMaxScrollLeft * scrollRatio;
    });
  }, [metricScale]);

  const selectRecord = (record: FitnessRecord): void => {
    setSelectedId(record.id);
    setDraftRecord({ ...record });
  };

  const updateTableField = (
    recordId: string,
    field: FitnessField,
    value: string,
  ): void => {
    const targetRecord = data.records.find((record) => record.id === recordId);
    setData((current) => ({
      ...current,
      records: current.records.map((record) => {
        if (record.id !== recordId) {
          return record;
        }
        return {
          ...record,
          [field]: normalizeNumber(value),
        };
      }),
    }));
  };

  const stopCellEdit = (): void => {
    setActiveCell(null);
  };

  const beginCellEdit = (recordId: string, field: FitnessField): void => {
    setActiveCell({ recordId, field });
  };

  const { moveActiveCell, handleKeyDown } = useIdSpreadsheetGrid({
    records: data.records,
    fields: [activeMetric],
    activeCell,
    setActiveCell,
    onSelectRecord: selectRecord,
  });

  const getViewportMaxHeight = (rowHeight: number): string => {
    const headerHeight = 54;
    const rowsHeight = rowHeight * debugSettings.sheetVisibleRows;
    return `${headerHeight + rowsHeight}px`;
  };

  const renderSheetDebugInfo = (values: {
    viewportWidth: number;
    naturalWidth: number;
    scale: number;
    scrollLeft: number;
  }) => {
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
  };

  const renderTableCell = (
    record: FitnessRecord,
    field: FitnessField,
    value: string | number,
    options?: {
      inputType?: "text" | "number" | "select";
      min?: number;
      step?: number;
      className?: string;
      displayValue?: string;
      selectOptions?: Array<{ value: number | string; label: string }>;
    },
  ) => {
    const isEditing = activeCell?.recordId === record.id && activeCell.field === field;

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
                moveActiveCell(record.id, field, event.shiftKey ? -1 : 1, 0);
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
          onFocus={(event) => {
            const target = event.currentTarget;
            setTimeout(() => {
              target.select();
              try {
                target.setSelectionRange(0, target.value.length);
              } catch (err) {}
            }, 50);
          }}
          onBlur={stopCellEdit}
          onChange={(event) =>
            updateTableField(record.id, field, event.target.value)
          }
          onKeyDown={(event) => handleKeyDown(event, record.id, field, stopCellEdit)}
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
            <button
              className="primary-button"
              disabled={!currentCloudFileId || !isCloudDirty}
              onClick={() => {
                void handleSaveCurrentCloudFile(data, "在測驗項目按下「儲存目前檔案」。");
              }}
              type="button"
            >
              儲存目前檔案
            </button>
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
              className="fixed-sheet-viewport table-wrap"
              ref={metricViewportRef}
              style={{ maxHeight: getViewportMaxHeight(54) }}
            >
              <table
                className="fixed-sheet-table"
                ref={metricTableRef}
              >
                <colgroup>
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "100px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="sticky-left-0">學生姓名</th>
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
                      <td className="sticky-left-0">{record.studentName}</td>
                      <td>
                        {renderTableCell(record, activeMetric, record[activeMetric], {
                          inputType:
                            getMetricRule(activeMetric, record)?.kind === "rubric"
                              ? "select"
                              : "number",
                          min: 0,
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
        </>
      ) : null}
    </section>
  );
}
