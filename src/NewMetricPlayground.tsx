import React, { useState, useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import type { AppData, FitnessRecord, FitnessField } from "./types";

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
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
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
    if (editingRecordId && activeInputRef.current) {
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
  }, [editingRecordId]);

  // 2. 點擊儲存格進入編輯，並確保該儲存格不會被左邊凍結的姓名欄遮擋
  const handleCellClick = (
    recordId: string,
    currentVal: string,
    event: React.MouseEvent<HTMLTableCellElement>
  ) => {
    setEditingRecordId(recordId);
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
  const commitValue = (recordId: string, val: string) => {
    updateTableField(recordId, activeMetric, val);
  };

  // 4. 處理鍵盤導覽 (Tab / Shift+Tab / Enter / Escape / ArrowUp / ArrowDown)
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    recordId: string,
    rowIndex: number
  ) => {
    if (event.key === "Tab") {
      event.preventDefault(); // 攔截預設 Tab focus 切換
      commitValue(recordId, editValue);

      // 移動到下一個學生的編輯格
      const isShift = event.shiftKey;
      let nextRowIndex = isShift ? rowIndex - 1 : rowIndex + 1;

      if (nextRowIndex >= 0 && nextRowIndex < data.records.length) {
        const nextRecord = data.records[nextRowIndex];
        setEditingRecordId(nextRecord.id);
        
        // 取得該指標的展示值作為編輯預設值
        const displayVal = getMetricDisplayValue(nextRecord, activeMetric);
        // 如果是下拉選單，對應到數值
        const rule = getMetricRule(activeMetric, nextRecord);
        const nextVal = rule?.kind === "rubric" ? String(nextRecord[activeMetric] || 0) : String(nextRecord[activeMetric] || "");
        setEditValue(nextVal);

        // 延遲滾動微調以避免姓名遮擋
        setTimeout(() => {
          const nextCell = document.getElementById(`cell-${nextRecord.id}`);
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
        setEditingRecordId(null); // 超出邊界，結束編輯
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitValue(recordId, editValue);
      setEditingRecordId(null);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditingRecordId(null); // 直接放棄修改，不 commit
    } else if (event.key === "ArrowUp") {
      // 僅在 input 或是 select 沒展開時做上下移動（為了防止與 select 本身選項切換衝突）
      if (event.currentTarget.tagName === "INPUT" || event.altKey) {
        event.preventDefault();
        commitValue(recordId, editValue);
        if (rowIndex > 0) {
          const nextRecord = data.records[rowIndex - 1];
          setEditingRecordId(nextRecord.id);
          const rule = getMetricRule(activeMetric, nextRecord);
          const nextVal = rule?.kind === "rubric" ? String(nextRecord[activeMetric] || 0) : String(nextRecord[activeMetric] || "");
          setEditValue(nextVal);
        }
      }
    } else if (event.key === "ArrowDown") {
      if (event.currentTarget.tagName === "INPUT" || event.altKey) {
        event.preventDefault();
        commitValue(recordId, editValue);
        if (rowIndex < data.records.length - 1) {
          const nextRecord = data.records[rowIndex + 1];
          setEditingRecordId(nextRecord.id);
          const rule = getMetricRule(activeMetric, nextRecord);
          const nextVal = rule?.kind === "rubric" ? String(nextRecord[activeMetric] || 0) : String(nextRecord[activeMetric] || "");
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
      `}</style>

      {/* 頂部切換與操作工具列 */}
      <div className="nmp-toolbar">
        <div className="nmp-pills">
          {scoreFields.map((field, index) => (
            <button
              className={field === activeMetric ? "nmp-pill is-active" : "nmp-pill"}
              key={field}
              onClick={() => {
                setActiveMetric(field);
                setEditingRecordId(null); // 切換指標時重設編輯狀態
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
        <div
          className="nmp-viewport"
          ref={viewportRef}
          style={viewportMaxHeight ? { maxHeight: viewportMaxHeight } : undefined}
        >
          <table className="nmp-table" ref={tableRef}>
          <colgroup>
            <col style={{ width: "90px" }} />
            <col style={{ width: "150px" }} />
          </colgroup>

          <thead>
            <tr>
              <th className="nmp-sticky-name">學生姓名</th>
              <th>
                <span className="nmp-header-label">
                  {renderMetricLabel(activeMetricLabel)}
                </span>
                {activeMetricUnit ? (
                  <small className="nmp-header-unit">單位：{activeMetricUnit}</small>
                ) : null}
              </th>
            </tr>
          </thead>

          <tbody>
            {data.records.map((record, rIdx) => {
              const isEditing = editingRecordId === record.id;
              const rule = getMetricRule(activeMetric, record);
              const isRubric = rule?.kind === "rubric";
              const displayVal = getMetricDisplayValue(record, activeMetric);

              return (
                <tr
                  className={record.id === selectedId ? "is-selected" : ""}
                  key={record.id}
                  onClick={() => selectRecord?.(record)}
                >
                  {/* Column 1: 學生姓名 (唯讀) */}
                  <td className="nmp-sticky-name">
                    {record.studentName}
                  </td>

                  {/* Column 2: 測驗分數/評分 (可編輯) */}
                  <td
                    className={`nmp-cell-interactive ${isEditing ? "nmp-cell-editing" : ""}`}
                    id={`cell-${record.id}`}
                    onClick={(e) => {
                      if (!isEditing) {
                        // 編輯時使用實際儲存格數值而非顯示用文字 (例如評分對應的數字)
                        const rawVal = isRubric ? String(record[activeMetric] || 0) : String(record[activeMetric] || "");
                        handleCellClick(record.id, rawVal, e);
                      }
                    }}
                  >
                    {isEditing ? (
                      isRubric ? (
                        <select
                          className="nmp-select"
                          onBlur={() => {
                            commitValue(record.id, editValue);
                            setEditingRecordId(null);
                          }}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, record.id, rIdx)}
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
                            commitValue(record.id, editValue);
                            setEditingRecordId(null);
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
                          onKeyDown={(e) => handleKeyDown(e, record.id, rIdx)}
                          ref={activeInputRef as React.RefObject<HTMLInputElement>}
                          type="number"
                          value={editValue}
                        />
                      )
                    ) : (
                      displayVal
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="button-row">
        <button
          className="primary-button"
          disabled={!currentCloudFileId || !isCloudDirty}
          onClick={() => {
            void handleSaveCurrentCloudFile(data, "在測驗項目按下「儲存」。");
          }}
          type="button"
        >
          儲存
        </button>
      </div>
    </div>
  );
}
