import React, { useMemo, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useFiles } from "../../context/FileContext";
import { useFitnessData } from "../../context/FitnessDataContext";
import { useFriends } from "../../context/FriendContext";
import { findAbilityGradeProfile } from "../../ability-scoring";
import { getAbilityRuleForField, getDisplayValueForField, getRubricOptions } from "../../ability-scoring";
import { abilityRulesByGradeGroup } from "../../ability-rules";
import { FriendRequestRecord } from "../../friendships";
import type { StudentGradeLabel, FitnessField, FitnessRecord } from "../../types";
import type { DebugSettings } from "../../debug-settings";

type EditableField = keyof FitnessRecord;
type SheetZoomMode = "fit" | 0.8 | 0.9 | 1 | 1.1;
type TableSortKey = "seat" | "grade-desc" | "grade-asc";

interface TableTabProps {
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

const tableEditableFields: EditableField[] = [
  "studentName",
  "height",
  "weight",
  "studentGradeLabel",
  ...scoreFields,
];

const TABLE_SHEET_ZOOM_OPTIONS: Array<{ label: string; value: SheetZoomMode }> = [
  { label: "符合頁寬", value: "fit" },
  { label: "100%", value: 1 },
];

const TABLE_SORT_OPTIONS: Array<{ value: TableSortKey; label: string }> = [
  { value: "seat", label: "依號碼排序" },
  { value: "grade-desc", label: "依年級排序（大到小）" },
  { value: "grade-asc", label: "依年級排序（小到大）" },
];

const TABLE_GRADE_CHECKBOX_OPTIONS: StudentGradeLabel[] = ["幼幼班", "小班", "中班", "大班"];
const STUDENT_GRADE_OPTIONS: StudentGradeLabel[] = ["幼幼班", "小班", "中班", "大班"];

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

function hasIncompleteScore(record: FitnessRecord): boolean {
  return scoreFields.some(
    (field) => !Number.isFinite(record[field]) || record[field] <= 0,
  );
}

function normalizeNumber(value: string): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

export default function TableTab({ setMessage, debugSettings, handleTabChange }: TableTabProps) {
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
    setDraftRecord,
    activeCell,
    setActiveCell,
    showIncompleteOnly,
    setShowIncompleteOnly,
    tableSortKey,
    setTableSortKey,
    showTableFilters,
    setShowTableFilters,
    selectedTableGrades,
    setSelectedTableGrades,
    tableZoomMode,
    setTableZoomMode,
    tableViewportWidth,
    setTableViewportWidth,
    tableNaturalWidth,
    setTableNaturalWidth,
    abilityRulesConfig,
  } = useFitnessData();

  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const tableTableRef = useRef<HTMLTableElement | null>(null);
  const previousTableScaleRef = useRef(1);

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
  }, [data.records, data.gradeLabel, showIncompleteOnly, selectedTableGrades, tableSortKey]);

  const currentEditableRecords = useMemo(() => {
    return tableRecords;
  }, [tableRecords]);

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

  const tableScale = useMemo(() => {
    return resolveSheetScale(
      tableZoomMode,
      tableViewportWidth,
      tableNaturalWidth,
    );
  }, [tableZoomMode, tableViewportWidth, tableNaturalWidth]);

  // Viewport resize observer
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
  }, [tableRecords, data.gradeLabel, resolvedItemLabels]);

  // Maintain position on scale change
  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) {
      return;
    }

    const previousScale = previousTableScaleRef.current;
    const nextScale = tableScale;
    previousTableScaleRef.current = nextScale;

    const previousScrollableWidth = viewport.scrollWidth;
    const maxScrollLeft = Math.max(0, previousScrollableWidth - viewport.clientWidth);
    const scrollRatio = maxScrollLeft > 0 ? viewport.scrollLeft / maxScrollLeft : 0;

    requestAnimationFrame(() => {
      const nextMaxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollLeft = nextMaxScrollLeft * scrollRatio;
    });
  }, [tableScale]);

  const selectRecord = (record: FitnessRecord): void => {
    setSelectedId(record.id);
    setDraftRecord({ ...record });
  };

  const stopCellEdit = (): void => {
    setActiveCell(null);
  };

  const beginCellEdit = (recordId: string, field: EditableField): void => {
    setActiveCell({ recordId, field });
  };

  const updateTableField = (
    recordId: string,
    field: EditableField,
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

  function renderSheetZoomToolbar(
    currentMode: SheetZoomMode,
    onChange: (nextMode: SheetZoomMode) => void,
    options: Array<{ label: string; value: SheetZoomMode }> = TABLE_SHEET_ZOOM_OPTIONS,
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

  return (
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
        <button
          className="primary-button"
          disabled={!currentCloudFileId || !isCloudDirty}
          onClick={() => {
            void handleSaveCurrentCloudFile(data, "在測驗總表按下「儲存目前檔案」。");
          }}
          type="button"
        >
          儲存目前檔案
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
            className="fixed-sheet-viewport table-wrap"
            ref={tableViewportRef}
            style={{ maxHeight: getViewportMaxHeight(54) }}
          >
            <table
              className="fixed-sheet-table"
              ref={tableTableRef}
            >
              <colgroup>
                <col style={{ width: "90px" }} />
                {isMixedAgeClass(data.gradeLabel) ? <col style={{ width: "90px" }} /> : null}
                <col style={{ width: "70px" }} />
                <col style={{ width: "70px" }} />
                {scoreFields.map((field) => (
                  <col key={field} style={{ width: "80px" }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky-left-0">學生姓名</th>
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
                    <td className="sticky-left-0">
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
      ) : null}
    </section>
  );
}
