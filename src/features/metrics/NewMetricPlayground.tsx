import React, { useState, useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import type { AppData, FitnessRecord, FitnessField } from "../../domain/types";
import {
  aggregateMetricVariantValue,
  getMetricContainerGroups,
  getMetricVariant,
  type MetricInputField,
} from "./test-rule-set";

type EditableField = keyof FitnessRecord;

interface NewMetricPlaygroundProps {
  data: AppData;
  activeMetric: FitnessField;
  setActiveMetric: (metric: FitnessField) => void;
  scoreFields: FitnessField[];
  resolvedItemLabels: string[];
  updateTableField: (recordId: string, field: EditableField, value: string) => void;
  getMetricRule: (field: FitnessField, record: FitnessRecord | null) => any;
  getMetricDisplayValue: (record: FitnessRecord, field: FitnessField) => string;
  getMetricSelectOptions: (field: FitnessField, record: FitnessRecord | null) => Array<{ value: number | string; label: string }>;
  getMetricRangeHint: (field: FitnessField) => string;
  getMetricUnitLabel: (field: FitnessField) => string;
  isCloudDirty: boolean;
  isCloudSaveInProgress?: boolean;
  currentCloudFileId: string | null;
  handleSaveCurrentCloudFile: (data: AppData, msg: string) => Promise<boolean>;
  debugInfo?: ReactNode;
  selectedId?: string;
  selectRecord?: (record: FitnessRecord) => void;
  viewportMaxHeight?: number | string;
  viewportRef?: RefObject<HTMLDivElement | null>;
  tableRef?: RefObject<HTMLTableElement | null>;
}

export default function NewMetricPlayground({
  data,
  activeMetric,
  setActiveMetric,
  scoreFields,
  resolvedItemLabels,
  updateTableField,
  getMetricRule,
  getMetricDisplayValue,
  getMetricSelectOptions,
  getMetricRangeHint,
  getMetricUnitLabel,
  isCloudDirty,
  isCloudSaveInProgress = false,
  currentCloudFileId,
  handleSaveCurrentCloudFile,
  debugInfo,
  selectedId,
  selectRecord,
  viewportMaxHeight,
  viewportRef: externalViewportRef,
  tableRef: externalTableRef,
}: NewMetricPlaygroundProps) {
  // 編輯單元格狀態：紀錄哪個學生的 id 正在編輯
  const [editingCell, setEditingCell] = useState<{
    recordId: string;
    fieldId: keyof FitnessRecord;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const internalViewportRef = useRef<HTMLDivElement>(null);
  const viewportRef = externalViewportRef ?? internalViewportRef;
  const activeInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const internalTableRef = useRef<HTMLTableElement>(null);
  const tableRef = externalTableRef ?? internalTableRef;

  // 取得當前選擇的指標名稱與 index
  const activeMetricIndex = scoreFields.indexOf(activeMetric);
  const activeMetricLabel = resolvedItemLabels[activeMetricIndex] ?? activeMetric;
  const activeMetricUnit = getMetricUnitLabel(activeMetric);
  const metricGroups = getMetricContainerGroups(data.records, activeMetric);

  function renderMetricLabel(label: string): ReactNode {
    const parts = label.split(" / ");
    if (parts.length <= 1) {
      return label;
    }

    return parts.map((part, index) => (
      <span className="nmp-label-line" key={`${label}-${index}`}>
        {part}
      </span>
    ));
  }

  // 1. 當切換編輯儲存格時，將焦點移至輸入元件，並防止瀏覽器畫面產生跳動，同時在行動裝置與電腦上自動全選內容
  useEffect(() => {
    if (editingCell && activeInputRef.current) {
      const element = activeInputRef.current;
      element.focus({ preventScroll: true });
      if (element instanceof HTMLInputElement) {
        // 使用 setTimeout 確保在行動裝置鍵盤與觸碰事件結束後執行全選
        setTimeout(() => {
          element.select();
          try {
            element.setSelectionRange(0, element.value.length);
          } catch (e) {}
        }, 50);
      }
    }
  }, [editingCell]);

  // 2. 點擊儲存格進入編輯，並確保該儲存格不會被左邊凍結的姓名欄遮擋
  const handleCellClick = (
    recordId: string,
    inputField: MetricInputField,
    currentVal: string,
    event: React.MouseEvent<HTMLTableCellElement>
  ) => {
    setEditingCell({ recordId, fieldId: inputField.id });
    setEditValue(currentVal);

    const cellElement = event.currentTarget;
    if (cellElement && viewportRef.current) {
      const viewport = viewportRef.current;
      const stickyWidth = 90; // 姓名欄固定寬度為 90px
      const cellLeft = cellElement.offsetLeft;
      const cellWidth = cellElement.offsetWidth;
      const scrollLeft = viewport.scrollLeft;
      const viewportWidth = viewport.clientWidth;

      // 如果儲存格左側邊緣扣除捲動後小於凍結寬度，代表被遮住了，向左捲動露出
      if (cellLeft - scrollLeft < stickyWidth) {
        viewport.scrollLeft = cellLeft - stickyWidth;
      }
      // 如果儲存格右側超出可見視區，也捲動到能看見的位置
      else if (cellLeft + cellWidth - scrollLeft > viewportWidth) {
        viewport.scrollLeft = cellLeft + cellWidth - viewportWidth;
      }
    }
  };

  // 3. 儲存數值並通知父組件更新
  const commitValue = (
    record: FitnessRecord,
    inputField: MetricInputField,
    val: string,
  ) => {
    updateTableField(record.id, inputField.id, val);

    const variant = getMetricVariant(activeMetric, record.studentGradeLabel);
    if (!variant.aggregateTo || variant.aggregateTo === inputField.id) {
      return;
    }

    const numericValue = Number(val);
    const nextRecord = {
      ...record,
      [inputField.id]: Number.isFinite(numericValue) ? numericValue : 0,
    };
    updateTableField(
      record.id,
      variant.aggregateTo,
      String(aggregateMetricVariantValue(nextRecord, variant)),
    );
  };

  // 4. 處理鍵盤導覽 (Tab / Shift+Tab / Enter / Escape / ArrowUp / ArrowDown)
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    record: FitnessRecord,
    inputField: MetricInputField,
    rowIndex: number,
    groupRecords: FitnessRecord[],
  ) => {
    if (event.key === "Tab") {
      event.preventDefault(); // 攔截預設 Tab focus 切換
      commitValue(record, inputField, editValue);

      // 移動到下一個學生的編輯格
      const isShift = event.shiftKey;
      let nextRowIndex = isShift ? rowIndex - 1 : rowIndex + 1;

      if (nextRowIndex >= 0 && nextRowIndex < groupRecords.length) {
        const nextRecord = groupRecords[nextRowIndex];
        setEditingCell({ recordId: nextRecord.id, fieldId: inputField.id });
        const nextVal = String(nextRecord[inputField.id] || "");
        setEditValue(nextVal);

        // 延遲滾動微調以避免姓名遮擋
        setTimeout(() => {
          const nextCell = document.getElementById(`cell-${nextRecord.id}-${String(inputField.id)}`);
          if (nextCell && viewportRef.current) {
            const viewport = viewportRef.current;
            const stickyWidth = 90;
            const cellLeft = (nextCell as HTMLElement).offsetLeft;
            const cellWidth = (nextCell as HTMLElement).offsetWidth;
            const scrollLeft = viewport.scrollLeft;
            const viewportWidth = viewport.clientWidth;

            if (cellLeft - scrollLeft < stickyWidth) {
              viewport.scrollLeft = cellLeft - stickyWidth;
            } else if (cellLeft + cellWidth - scrollLeft > viewportWidth) {
              viewport.scrollLeft = cellLeft + cellWidth - viewportWidth;
            }
          }
        }, 0);
      } else {
        setEditingCell(null); // 超出邊界，結束編輯
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitValue(record, inputField, editValue);
      setEditingCell(null);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditingCell(null); // 直接放棄修改，不 commit
    } else if (event.key === "ArrowUp") {
      // 僅在 input 或是 select 沒展開時做上下移動（為了防止與 select 本身選項切換衝突）
      if (event.currentTarget.tagName === "INPUT" || event.altKey) {
        event.preventDefault();
        commitValue(record, inputField, editValue);
        if (rowIndex > 0) {
          const nextRecord = groupRecords[rowIndex - 1];
          setEditingCell({ recordId: nextRecord.id, fieldId: inputField.id });
          const nextVal = String(nextRecord[inputField.id] || "");
          setEditValue(nextVal);
        }
      }
    } else if (event.key === "ArrowDown") {
      if (event.currentTarget.tagName === "INPUT" || event.altKey) {
        event.preventDefault();
        commitValue(record, inputField, editValue);
        if (rowIndex < groupRecords.length - 1) {
          const nextRecord = groupRecords[rowIndex + 1];
          setEditingCell({ recordId: nextRecord.id, fieldId: inputField.id });
          const nextVal = String(nextRecord[inputField.id] || "");
          setEditValue(nextVal);
        }
      }
    }
  };

  return (
    <div className="nmp-container">
      {/* 注入元件專用美化樣式 */}
      <style>{`
        .nmp-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        .nmp-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          background: #ffffff;
          padding: 14px 18px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .nmp-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          flex-grow: 1;
        }
        .nmp-pill {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #475569;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          white-space: normal;
          line-height: 1.3;
        }
        .nmp-pill:hover {
          background: #e2e8f0;
          color: #1e293b;
        }
        .nmp-pill.is-active {
          background: #3b82f6;
          border-color: #2563eb;
          color: #ffffff;
          box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
        }
        .nmp-viewport {
          width: 100%;
          max-height: 480px;
          overflow: auto;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .nmp-table {
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          width: 100%;
          font-family: inherit;
        }
        .nmp-table th, .nmp-table td {
          font-size: 16px;
          box-sizing: border-box;
          height: 44px;
          text-align: center;
          vertical-align: middle;
          border-right: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          padding: 6px;
        }
        .nmp-table th {
          position: sticky;
          top: 0;
          background: #f8fafc;
          font-weight: 600;
          z-index: 10;
          color: #475569;
          border-bottom: 2px solid #cbd5e1;
        }
        /* Sticky 學生姓名欄位 */
        .nmp-sticky-name {
          position: sticky;
          left: 0;
          width: 90px;
          background: #ffffff !important;
          z-index: 5;
          text-align: left !important;
          padding-left: 14px !important;
          font-weight: 500;
          color: #1e293b;
        }
        tr:hover td.nmp-sticky-name {
          background: #f8fafc !important;
        }
        th.nmp-sticky-name {
          z-index: 20;
          background: #f8fafc !important;
        }
        /* 輸入與選單樣式 */
        .nmp-input, .nmp-select {
          width: 100%;
          height: 32px;
          border: 2px solid #3b82f6;
          border-radius: 6px;
          outline: none;
          padding: 0 6px;
          box-sizing: border-box;
          font-size: 16px;
          text-align: center;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        .nmp-select {
          text-align-last: center;
        }
        .nmp-cell-interactive {
          cursor: pointer;
          transition: background 0.15s;
        }
        .nmp-cell-interactive:hover {
          background: #eff6ff;
        }
        .nmp-cell-editing {
          padding: 2px !important;
          background: #eff6ff;
        }
        .nmp-hint {
          font-size: 14px;
          color: #64748b;
          margin-top: 4px;
        }
        .nmp-label-line {
          display: block;
        }
        .nmp-header-label {
          display: flex;
          flex-direction: column;
          gap: 2px;
          line-height: 1.25;
        }
        .nmp-header-unit {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
        }
        .nmp-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .nmp-group-heading {
          display: flex;
          align-items: baseline;
          gap: 8px;
          color: #0f172a;
          font-weight: 700;
        }
        .nmp-group-heading small {
          color: #64748b;
          font-weight: 500;
        }
      `}</style>

      {/* 頂部切換與操作工具列 */}
      <div className="nmp-toolbar">
        <div className="nmp-pills" data-testid="metric-item-select">
          {scoreFields.map((field, index) => (
            <button
              className={field === activeMetric ? "nmp-pill is-active" : "nmp-pill"}
              data-testid="metric-item-option"
              key={field}
              onClick={() => {
                setActiveMetric(field);
                setEditingCell(null); // 切換指標時重設編輯狀態
              }}
              type="button"
            >
              {renderMetricLabel(resolvedItemLabels[index])}
            </button>
          ))}
        </div>
      </div>

      <div className="nmp-hint">
        💡 指標範圍提示：<strong>{getMetricRangeHint(activeMetric)}</strong>
      </div>

      {/* 試算表容器 */}
      {debugInfo}
      <div className="nmp-groups" data-testid="metric-sheet">
          {metricGroups.map((group, groupIndex) => {
            const variant = getMetricVariant(activeMetric, group.records[0]?.studentGradeLabel ?? "大班");
            return (
              <div className="nmp-group" key={group.key}>
                {metricGroups.length > 1 ? (
                  <div className="nmp-group-heading">
                    <span>{group.label}</span>
                    <small>{group.grades.join("、")}</small>
                  </div>
                ) : null}
                <div
                  className="nmp-viewport"
                  data-testid="metric-group-viewport"
                  ref={groupIndex === 0 ? viewportRef : undefined}
                  style={viewportMaxHeight ? { maxHeight: viewportMaxHeight } : undefined}
                >
                  <table className="nmp-table" ref={groupIndex === 0 ? tableRef : undefined}>
                    <colgroup>
                      <col style={{ width: "90px" }} />
                      {variant.fields.map((inputField) => (
                        <col key={String(inputField.id)} style={{ width: "150px" }} />
                      ))}
                    </colgroup>

                    <thead>
                      <tr>
                        <th className="nmp-sticky-name">學生姓名</th>
                        {variant.fields.map((inputField) => (
                          <th key={String(inputField.id)}>
                            <span className="nmp-header-label">
                              {renderMetricLabel(
                                variant.fields.length === 1
                                  ? variant.label
                                  : inputField.label,
                              )}
                            </span>
                            {activeMetricUnit ? (
                              <small className="nmp-header-unit">
                                單位：{inputField.unit ?? activeMetricUnit}
                              </small>
                            ) : null}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {group.records.map((record, rIdx) => {
                        const rule = getMetricRule(activeMetric, record);
                        const isRubric = rule?.kind === "rubric" && variant.fields.length === 1;

                        return (
                          <tr
                            className={record.id === selectedId ? "is-selected" : ""}
                            key={record.id}
                            onClick={() => selectRecord?.(record)}
                          >
                            <td className="nmp-sticky-name">
                              {record.studentName}
                            </td>

                            {variant.fields.map((inputField) => {
                              const isEditing =
                                editingCell?.recordId === record.id &&
                                editingCell.fieldId === inputField.id;
                              const rawValue = record[inputField.id];
                              const displayVal =
                                inputField.id === activeMetric
                                  ? getMetricDisplayValue(record, activeMetric)
                                  : typeof rawValue === "number" && rawValue > 0
                                    ? String(rawValue)
                                    : "";

                              return (
                                <td
                                  className={`nmp-cell-interactive ${isEditing ? "nmp-cell-editing" : ""}`}
                                  id={`cell-${record.id}-${String(inputField.id)}`}
                                  key={String(inputField.id)}
                                  onClick={(e) => {
                                    if (!isEditing) {
                                      const nextRawValue = isRubric
                                        ? String(record[activeMetric] || 0)
                                        : String(rawValue || "");
                                      handleCellClick(record.id, inputField, nextRawValue, e);
                                    }
                                  }}
                                >
                                  {isEditing ? (
                                    isRubric ? (
                                      <select
                                        className="nmp-select"
                                        onBlur={() => {
                                          commitValue(record, inputField, editValue);
                                          setEditingCell(null);
                                        }}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) =>
                                          handleKeyDown(e, record, inputField, rIdx, group.records)
                                        }
                                        ref={activeInputRef as React.RefObject<HTMLSelectElement>}
                                        value={editValue}
                                      >
                                        <option value="0">未填寫</option>
                                        {getMetricSelectOptions(activeMetric, record).map((option) => (
                                          <option key={`${activeMetric}-${option.value}`} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        className="nmp-input"
                                        onBlur={() => {
                                          commitValue(record, inputField, editValue);
                                          setEditingCell(null);
                                        }}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onFocus={(e) => {
                                          const target = e.currentTarget;
                                          setTimeout(() => {
                                            target.select();
                                            try {
                                              target.setSelectionRange(0, target.value.length);
                                            } catch (err) {}
                                          }, 50);
                                        }}
                                        onKeyDown={(e) =>
                                          handleKeyDown(e, record, inputField, rIdx, group.records)
                                        }
                                        ref={activeInputRef as React.RefObject<HTMLInputElement>}
                                        type="number"
                                        value={editValue}
                                      />
                                    )
                                  ) : (
                                    displayVal || "—"
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
      </div>

      <div className="button-row">
        <button
          className="primary-button"
          data-testid="metric-save-button"
          disabled={!currentCloudFileId || !isCloudDirty || isCloudSaveInProgress}
          onClick={() => {
            void handleSaveCurrentCloudFile(data, "在測驗項目按下「儲存」。");
          }}
          type="button"
        >
          {isCloudSaveInProgress ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}
