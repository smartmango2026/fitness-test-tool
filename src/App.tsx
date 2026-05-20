import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ClipboardEvent,
  KeyboardEvent,
} from "react";
import A4CanvasBoard, {
  exportAllReportsPdf,
  type A4CanvasBoardHandle,
} from "./A4CanvasBoard";
import {
  loadDebugSettings,
  type DebugSettings,
} from "./debug-settings";
import RadarChart from "./RadarChart";
import { defaultAppData } from "./sample-data";
import { loadAppData, saveAppData } from "./storage";
import type { AppData, FitnessField, FitnessRecord, RosterEntry } from "./types";

type TabKey =
  | "table"
  | "metric"
  | "editor"
  | "roster"
  | "analysis"
  | "pdf";

type EditableField = keyof FitnessRecord;

type ActiveCell = {
  recordId: string;
  field: EditableField;
} | null;

type SheetZoomMode = "fit" | 0.8 | 0.9 | 1 | 1.1;

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "roster", label: "編輯名冊" },
  { key: "metric", label: "測驗項目" },
  { key: "analysis", label: "檢視能力分析" },
  { key: "table", label: "檢視總表" },
  { key: "pdf", label: "下載PDF" },
];

const scoreFields: FitnessField[] = [
  "item1",
  "item2",
  "item3",
  "item4",
  "item5",
  "item6",
];

const SHEET_ZOOM_OPTIONS: Array<{ label: string; value: SheetZoomMode }> = [
  { label: "符合頁寬", value: "fit" },
  { label: "80%", value: 0.8 },
  { label: "90%", value: 0.9 },
  { label: "100%", value: 1 },
  { label: "110%", value: 1.1 },
];

function hasIncompleteScore(record: FitnessRecord): boolean {
  return scoreFields.some(
    (field) => !Number.isFinite(record[field]) || record[field] <= 0,
  );
}

function makeEmptyRecord(testDate: string): FitnessRecord {
  return {
    id: crypto.randomUUID(),
    studentName: "",
    height: "",
    weight: "",
    testDate,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0,
    comment: "",
  };
}

function makeEmptyRosterEntry(): RosterEntry {
  return {
    id: crypto.randomUUID(),
    studentName: "",
    height: "",
    weight: "",
  };
}

function upsertRecord(records: FitnessRecord[], nextRecord: FitnessRecord) {
  const foundIndex = records.findIndex((record) => record.id === nextRecord.id);
  if (foundIndex === -1) {
    return [nextRecord, ...records];
  }

  return records.map((record) =>
    record.id === nextRecord.id ? nextRecord : record,
  );
}

function normalizeNumber(value: string): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((row) => row.split("\t"));
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadAppData() ?? defaultAppData);
  const [activeTab, setActiveTab] = useState<TabKey>("roster");
  const [selectedId, setSelectedId] = useState<string>(data.records[0]?.id ?? "");
  const [draftRecord, setDraftRecord] = useState<FitnessRecord>(
    data.records[0] ?? makeEmptyRecord(data.testDate),
  );
  const [message, setMessage] = useState("已載入本機資料。");
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [activeMetric, setActiveMetric] = useState<FitnessField>("item1");
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [rosterDraft, setRosterDraft] = useState<RosterEntry[]>(() =>
    data.rosterEntries.length ? data.rosterEntries : [makeEmptyRosterEntry()],
  );
  const [rosterActiveCell, setRosterActiveCell] = useState<{
    rowIndex: number;
    columnIndex: number;
  } | null>(null);
  const [rosterSizeInput, setRosterSizeInput] = useState(() =>
    String(data.rosterEntries.length || 1),
  );
  const [rosterZoomMode, setRosterZoomMode] = useState<SheetZoomMode>("fit");
  const [tableZoomMode, setTableZoomMode] = useState<SheetZoomMode>("fit");
  const [metricZoomMode, setMetricZoomMode] = useState<SheetZoomMode>("fit");
  const [rosterViewportWidth, setRosterViewportWidth] = useState(0);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const [metricViewportWidth, setMetricViewportWidth] = useState(0);
  const [rosterNaturalWidth, setRosterNaturalWidth] = useState(640);
  const [tableNaturalWidth, setTableNaturalWidth] = useState(1120);
  const [metricNaturalWidth, setMetricNaturalWidth] = useState(520);
  const [debugSettings, setDebugSettings] = useState<DebugSettings>(() =>
    loadDebugSettings(),
  );
  const rosterViewportRef = useRef<HTMLDivElement | null>(null);
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const metricViewportRef = useRef<HTMLDivElement | null>(null);
  const rosterTableRef = useRef<HTMLTableElement | null>(null);
  const tableTableRef = useRef<HTMLTableElement | null>(null);
  const metricTableRef = useRef<HTMLTableElement | null>(null);
  const previousRosterScaleRef = useRef(1);
  const previousTableScaleRef = useRef(1);
  const previousMetricScaleRef = useRef(1);
  useEffect(() => {
    saveAppData(data);
  }, [data]);

  useEffect(() => {
    setRosterDraft(data.rosterEntries.length ? data.rosterEntries : [makeEmptyRosterEntry()]);
  }, [data.rosterEntries]);

  useEffect(() => {
    setRosterSizeInput(String(Math.max(rosterDraft.length, 1)));
  }, [rosterDraft.length]);

  useEffect(() => {
    const reloadDebugSettings = () => {
      setDebugSettings(loadDebugSettings());
    };

    window.addEventListener("focus", reloadDebugSettings);
    window.addEventListener("storage", reloadDebugSettings);

    return () => {
      window.removeEventListener("focus", reloadDebugSettings);
      window.removeEventListener("storage", reloadDebugSettings);
    };
  }, []);

  const selectedRecord = useMemo(
    () => data.records.find((record) => record.id === selectedId) ?? null,
    [data.records, selectedId],
  );
  const selectedSeatNumber = useMemo(() => {
    const index = data.records.findIndex((record) => record.id === selectedId);
    return index >= 0 ? index + 1 : null;
  }, [data.records, selectedId]);
  const pdfCanvasRef = useRef<A4CanvasBoardHandle | null>(null);

  useEffect(() => {
    if (selectedRecord) {
      setDraftRecord(selectedRecord);
    }
  }, [selectedRecord]);

  const tableRecords = useMemo(() => {
    return showIncompleteOnly
      ? data.records.filter((record) => hasIncompleteScore(record))
      : data.records;
  }, [data.records, showIncompleteOnly]);

  const activeMetricIndex = scoreFields.indexOf(activeMetric);
  const activeMetricLabel = data.itemLabels[activeMetricIndex] ?? activeMetric;
  const currentEditableRecords = useMemo(() => {
    if (activeTab === "table") {
      return tableRecords;
    }

    if (activeTab === "metric") {
      return data.records;
    }

    return data.records;
  }, [activeTab, data.records, tableRecords]);

  useEffect(() => {
    const nextViewport = rosterViewportRef.current;
    const nextTable = rosterTableRef.current;
    if (!nextViewport || !nextTable) {
      return;
    }

    const measureRosterWidth = () => {
      setRosterViewportWidth(nextViewport.clientWidth);
      setRosterNaturalWidth(nextTable.offsetWidth);
    };

    const resizeObserver = new ResizeObserver(() => {
      measureRosterWidth();
    });
    resizeObserver.observe(nextViewport);
    resizeObserver.observe(nextTable);
    measureRosterWidth();

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeTab, rosterDraft, rosterZoomMode]);

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
  }, [activeTab, tableRecords, tableZoomMode, data.itemLabels]);

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
  }, [activeTab, data.records, activeMetric, metricZoomMode, activeMetricLabel]);

  function selectRecord(record: FitnessRecord): void {
    setSelectedId(record.id);
    setDraftRecord(record);
  }

  function updateDraftField(
    field: keyof FitnessRecord,
    value: string | number,
  ): void {
    setDraftRecord((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function saveDraft(): void {
    if (!draftRecord.studentName.trim()) {
      setMessage("請先輸入學生姓名。");
      return;
    }

    const normalized = {
      ...draftRecord,
      studentName: draftRecord.studentName.trim(),
      testDate: data.testDate,
    };

    const nextRecords = upsertRecord(data.records, normalized);
    setData((current) => ({ ...current, records: nextRecords }));
    setSelectedId(normalized.id);
    setDraftRecord(normalized);
    setActiveTab("table");
    setMessage("資料已儲存。");
  }

  function deleteSelected(): void {
    if (!selectedRecord) {
      setMessage("目前沒有可刪除的資料。");
      return;
    }

    const nextRecords = data.records.filter(
      (record) => record.id !== selectedRecord.id,
    );
    setData((current) => ({ ...current, records: nextRecords }));
    setSelectedId(nextRecords[0]?.id ?? "");
    setDraftRecord(nextRecords[0] ?? makeEmptyRecord(data.testDate));
    setMessage("資料已刪除。");
  }

  function addTableRow(): void {
    const nextRecord = makeEmptyRecord(data.testDate);
    setData((current) => ({
      ...current,
      records: [nextRecord, ...current.records],
    }));
    setSelectedId(nextRecord.id);
    setDraftRecord(nextRecord);
    setMessage("已新增一筆空白資料。");
  }

  function updateTableField(
    recordId: string,
    field: EditableField,
    value: string,
  ): void {
    setData((current) => ({
      ...current,
      records: current.records.map((record) => {
        if (record.id !== recordId) {
          return record;
        }

        if (scoreFields.includes(field as FitnessField)) {
          return {
            ...record,
            [field]: normalizeNumber(value),
          };
        }

        return {
          ...record,
          [field]: value,
        };
      }),
    }));
  }

  function updateSharedTestDate(nextDate: string): void {
    setData((current) => ({
      ...current,
      testDate: nextDate,
      records: current.records.map((record) => ({
        ...record,
        testDate: nextDate,
      })),
    }));
  }

  function updateRosterName(nextName: string): void {
    setData((current) => ({
      ...current,
      rosterName: nextName,
    }));
  }

  function updateRosterDraftCell(
    rowIndex: number,
    columnIndex: number,
    value: string,
  ): void {
    const rosterFields: Array<keyof Omit<RosterEntry, "id">> = [
      "studentName",
      "height",
      "weight",
    ];
    const targetField = rosterFields[columnIndex];
    if (!targetField) {
      return;
    }

    setRosterDraft((current) =>
      current.map((entry, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? {
              ...entry,
              [targetField]: value,
            }
          : entry,
      ),
    );
  }

  function addRosterRow(): void {
    setRosterDraft((current) => [...current, makeEmptyRosterEntry()]);
  }

  function applyRosterSize(): void {
    const nextCount = Math.max(1, Math.floor(Number(rosterSizeInput) || 0));
    const currentCount = rosterDraft.length;

    if (nextCount === currentCount) {
      setRosterSizeInput(String(nextCount));
      return;
    }

    if (nextCount > currentCount) {
      setRosterDraft((current) => [
        ...current,
        ...Array.from({ length: nextCount - currentCount }, () => makeEmptyRosterEntry()),
      ]);
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
    setRosterActiveCell((current) => {
      if (!current) {
        return null;
      }

      return current.rowIndex >= nextCount ? null : current;
    });
    setRosterSizeInput(String(nextCount));
  }

  function applyGridPaste(
    current: string[][],
    startRowIndex: number,
    startColumnIndex: number,
    clipboardText: string,
  ): string[][] {
    const pastedGrid = parseClipboardGrid(clipboardText);
    if (!pastedGrid.length) {
      return current;
    }

    return current.map((row, rowIndex) =>
      row.map((cell, columnIndex) => {
        const pastedRow = pastedGrid[rowIndex - startRowIndex];
        if (!pastedRow) {
          return cell;
        }

        const pastedCell = pastedRow[columnIndex - startColumnIndex];
        return pastedCell === undefined ? cell : pastedCell;
      }),
    );
  }

  function applyRosterPaste(
    startRowIndex: number,
    startColumnIndex: number,
    clipboardText: string,
  ): void {
    const rosterRows = rosterDraft.map((entry) => [
      entry.studentName,
      entry.height,
      entry.weight,
    ]);
    const nextRows = applyGridPaste(
      rosterRows,
      startRowIndex,
      startColumnIndex,
      clipboardText,
    );

    setRosterDraft((current) =>
      current.map((entry, rowIndex) => ({
        ...entry,
        studentName: nextRows[rowIndex]?.[0] ?? entry.studentName,
        height: nextRows[rowIndex]?.[1] ?? entry.height,
        weight: nextRows[rowIndex]?.[2] ?? entry.weight,
      })),
    );
  }

  function handleRosterPaste(
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
  ): void {
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!clipboardText.includes("\t") && !clipboardText.includes("\n")) {
      return;
    }

    event.preventDefault();
    applyRosterPaste(rowIndex, columnIndex, clipboardText);
  }

  function handleRosterKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
  ): void {
    if (event.key === "Enter") {
      event.preventDefault();
      const nextRowIndex = Math.max(
        0,
        Math.min(rosterDraft.length - 1, rowIndex + (event.shiftKey ? -1 : 1)),
      );
      setRosterActiveCell({ rowIndex: nextRowIndex, columnIndex });
    }
  }

  function importRosterToRecords(): void {
    const normalizedRosterEntries = rosterDraft
      .map((entry) => ({
        ...entry,
        studentName: entry.studentName.trim(),
        height: entry.height.trim(),
        weight: entry.weight.trim(),
      }))
      .filter((entry) => entry.studentName);

    if (!normalizedRosterEntries.length) {
      setMessage("目前名冊是空的。");
      return;
    }

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
          testDate: data.testDate,
        };
      }

      return {
        ...makeEmptyRecord(data.testDate),
        studentName: entry.studentName,
        height: entry.height,
        weight: entry.weight,
      };
    });

    setData((current) => ({
      ...current,
      rosterEntries: normalizedRosterEntries,
      records: nextRecords,
    }));
    setRosterDraft(normalizedRosterEntries);
    setSelectedId(nextRecords[0]?.id ?? "");
    setDraftRecord(nextRecords[0] ?? makeEmptyRecord(data.testDate));
    setMessage("已將名冊匯入目前資料。");
  }

  function beginCellEdit(recordId: string, field: EditableField): void {
    setActiveCell({ recordId, field });
  }

  function stopCellEdit(): void {
    setActiveCell(null);
  }

  function moveTableActiveCell(
    recordId: string,
    field: EditableField,
    rowOffset: number,
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

    setSelectedId(nextRecord.id);
    setDraftRecord(nextRecord);
    setActiveCell({ recordId: nextRecord.id, field });
  }

  async function handleDownloadCurrentPdf(): Promise<void> {
    if (!selectedRecord) {
      setMessage("請先選擇一位學生。");
      return;
    }

    await pdfCanvasRef.current?.downloadCurrentPdf();
    setMessage(`已下載 ${selectedRecord.studentName} 的報告。`);
  }

  async function handleDownloadAllPdfs(): Promise<void> {
    await exportAllReportsPdf({
      labels: data.itemLabels,
      records: data.records,
      rosterName: data.rosterName,
      testDate: data.testDate,
    });
    setMessage(`已下載 ${data.rosterName || "本班"} 全班報告。`);
  }

  function updateScore(field: FitnessField, value: string): void {
    updateDraftField(field, normalizeNumber(value));
  }

  function getTopLabel(record: FitnessRecord): string {
    const values = [
      record.item1,
      record.item2,
      record.item3,
      record.item4,
      record.item5,
      record.item6,
    ];
    const maxValue = Math.max(...values);
    const maxIndex = values.indexOf(maxValue);
    return data.itemLabels[maxIndex] ?? "未設定";
  }

  function renderTableCell(
    record: FitnessRecord,
    field: EditableField,
    value: string | number,
    options?: {
      inputType?: "text" | "number";
      min?: number;
      step?: number;
      className?: string;
    },
  ) {
    const isEditing =
      activeCell?.recordId === record.id && activeCell.field === field;

    if (isEditing) {
      return (
        <input
          autoFocus
          className={options?.className}
          min={options?.min}
          onFocus={(event) => event.currentTarget.select()}
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
              );
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
        {String(value || "") || "—"}
      </button>
    );
  }

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

  function preserveViewportPosition(
    viewport: HTMLDivElement | null,
    previousScale: number,
    nextScale: number,
  ): void {
    if (!viewport) {
      return;
    }

    const previousScrollableWidth = viewport.scrollWidth;
    const maxScrollLeft = Math.max(0, previousScrollableWidth - viewport.clientWidth);
    const scrollRatio = maxScrollLeft > 0 ? viewport.scrollLeft / maxScrollLeft : 0;

    requestAnimationFrame(() => {
      const nextMaxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollLeft = nextMaxScrollLeft * scrollRatio;
    });

    if (previousScale === nextScale) {
      return;
    }
  }

  function clampViewportScroll(
    viewport: HTMLDivElement | null,
    scaledWidth: number,
  ): void {
    if (!viewport) {
      return;
    }

    const maxScrollLeft = Math.max(
      0,
      scaledWidth + debugSettings.sheetScrollRightPadding - viewport.clientWidth,
    );
    if (viewport.scrollLeft > maxScrollLeft) {
      viewport.scrollLeft = maxScrollLeft;
    }
  }

  function handleViewportScroll(
    viewport: HTMLDivElement | null,
    scaledWidth: number,
  ): void {
    clampViewportScroll(viewport, scaledWidth);
  }

  const rosterScale = resolveSheetScale(
    rosterZoomMode,
    rosterViewportWidth,
    rosterNaturalWidth,
  );
  const tableScale = resolveSheetScale(
    tableZoomMode,
    tableViewportWidth,
    tableNaturalWidth,
  );
  const metricScale = resolveSheetScale(
    metricZoomMode,
    metricViewportWidth,
    metricNaturalWidth,
  );

  useEffect(() => {
    preserveViewportPosition(
      rosterViewportRef.current,
      previousRosterScaleRef.current,
      rosterScale,
    );
    previousRosterScaleRef.current = rosterScale;
  }, [rosterScale]);

  useEffect(() => {
    preserveViewportPosition(
      tableViewportRef.current,
      previousTableScaleRef.current,
      tableScale,
    );
    previousTableScaleRef.current = tableScale;
  }, [tableScale]);

  useEffect(() => {
    preserveViewportPosition(
      metricViewportRef.current,
      previousMetricScaleRef.current,
      metricScale,
    );
    previousMetricScaleRef.current = metricScale;
  }, [metricScale]);

  function renderSheetZoomToolbar(
    currentMode: SheetZoomMode,
    onChange: (nextMode: SheetZoomMode) => void,
  ) {
    return (
      <div className="sheet-toolbar" role="group" aria-label="表格縮放">
        {SHEET_ZOOM_OPTIONS.map((option) => (
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

  function renderSheetDebugInfo(values: {
    viewportWidth: number;
    naturalWidth: number;
    scale: number;
    scrollLeft: number;
  }) {
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
  }

  function getViewportMaxHeight(rowHeight: number): string {
    const headerHeight = 54;
    const rowsHeight = rowHeight * debugSettings.sheetVisibleRows;
    return `${headerHeight + rowsHeight}px`;
  }

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
          <p className="eyebrow">新北市運動遊戲體育協會</p>
          <h1>體適能測驗管理工具</h1>
          <p className="hero-copy">
            第一版以網頁為唯一正式編輯來源，Excel 僅用於檢視、備份、列印與攜帶。
          </p>
          <div className="hero-meta">
            <label className="shared-date-field">
              班級名稱
              <input
                onChange={(event) => updateRosterName(event.target.value)}
                value={data.rosterName}
              />
            </label>
            <label className="shared-date-field">
              本次測驗日期
              <input
                onChange={(event) => updateSharedTestDate(event.target.value)}
                type="date"
                value={data.testDate}
              />
            </label>
          </div>
        </div>
      </header>

      <nav className="tab-bar" aria-label="主要功能">
        {tabs.map((tab) => (
          <button
            className={tab.key === activeTab ? "tab is-active" : "tab"}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="panel-grid">
        {activeTab === "table" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>檢視總表</h2>
                  <p>這一頁預設是列表檢視，點一下儲存格再就地編輯，也能直接選取學生供能力分析使用。</p>
                </div>
                <div className="button-row">
                  <label className="filter-toggle">
                    <input
                      checked={showIncompleteOnly}
                      onChange={(event) => setShowIncompleteOnly(event.target.checked)}
                      type="checkbox"
                    />
                    只看未完成學生
                  </label>
                  <button
                    className="primary-button"
                    onClick={addTableRow}
                    type="button"
                  >
                    新增列
                  </button>
                </div>
              </div>
              <div className="sheet-shell">
                {renderSheetZoomToolbar(tableZoomMode, setTableZoomMode)}
                {debugSettings.showSheetDebug
                  ? renderSheetDebugInfo({
                      viewportWidth: tableViewportWidth,
                      naturalWidth: tableNaturalWidth,
                      scale: tableScale,
                      scrollLeft: tableViewportRef.current?.scrollLeft ?? 0,
                    })
                  : null}
                <div
                  className="sheet-viewport sheet-viewport-capped table-wrap"
                  onScroll={() =>
                    handleViewportScroll(
                      tableViewportRef.current,
                      tableNaturalWidth * tableScale,
                    )
                  }
                  ref={tableViewportRef}
                  style={{ maxHeight: getViewportMaxHeight(54) }}
                >
                  <div
                    className="sheet-zoom-stage"
                    style={{
                      width: `${tableNaturalWidth * tableScale}px`,
                      height: "100%",
                    }}
                  >
                    <table
                      className="table-editor sheet-playground summary-sheet"
                      ref={tableTableRef}
                      style={{
                        transform: `scale(${tableScale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <thead>
                        <tr>
                          <th className="is-frozen-column">學生姓名</th>
                          <th>身高</th>
                          <th>體重</th>
                          <th>{data.itemLabels[0]}</th>
                          <th>{data.itemLabels[1]}</th>
                          <th>{data.itemLabels[2]}</th>
                          <th>{data.itemLabels[3]}</th>
                          <th>{data.itemLabels[4]}</th>
                          <th>{data.itemLabels[5]}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRecords.map((record) => (
                          <tr
                            className={record.id === selectedId ? "is-selected" : ""}
                            key={record.id}
                            onClick={() => selectRecord(record)}
                          >
                            <td className="is-frozen-column">
                              {renderTableCell(record, "studentName", record.studentName)}
                            </td>
                            <td>{renderTableCell(record, "height", record.height)}</td>
                            <td>{renderTableCell(record, "weight", record.weight)}</td>
                            {scoreFields.map((field) => (
                              <td key={field}>
                                {renderTableCell(record, field, record[field], {
                                  inputType: "number",
                                  min: 0,
                                  step: 1,
                                  className: "cell-input-number",
                                })}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "metric" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>測驗項目</h2>
                  <p>一次只處理一個測驗欄位，適合全班統一補分或修分。</p>
                </div>
              </div>

              <div className="metric-toolbar">
                {scoreFields.map((field, index) => (
                  <button
                    className={field === activeMetric ? "metric-pill is-active" : "metric-pill"}
                    key={field}
                    onClick={() => setActiveMetric(field)}
                    type="button"
                  >
                    {data.itemLabels[index]}
                  </button>
                ))}
              </div>

              <div className="sheet-shell">
                {renderSheetZoomToolbar(metricZoomMode, setMetricZoomMode)}
                {debugSettings.showSheetDebug
                  ? renderSheetDebugInfo({
                      viewportWidth: metricViewportWidth,
                      naturalWidth: metricNaturalWidth,
                      scale: metricScale,
                      scrollLeft: metricViewportRef.current?.scrollLeft ?? 0,
                    })
                  : null}
                <div
                  className="sheet-viewport sheet-viewport-capped table-wrap"
                  onScroll={() =>
                    handleViewportScroll(
                      metricViewportRef.current,
                      metricNaturalWidth * metricScale,
                    )
                  }
                  ref={metricViewportRef}
                  style={{ maxHeight: getViewportMaxHeight(54) }}
                >
                  <div
                    className="sheet-zoom-stage"
                    style={{
                      width: `${metricNaturalWidth * metricScale}px`,
                      height: "100%",
                    }}
                  >
                    <table
                      className="table-editor metric-editor sheet-playground summary-sheet"
                      ref={metricTableRef}
                      style={{
                        transform: `scale(${metricScale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <thead>
                        <tr>
                          <th className="is-frozen-column">學生姓名</th>
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
                            <td className="is-frozen-column">{record.studentName}</td>
                            <td>
                              {renderTableCell(record, activeMetric, record[activeMetric], {
                                inputType: "number",
                                min: 0,
                                step: 1,
                                className: "cell-input-number",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "editor" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>單筆編輯</h2>
                  <p>適合針對單一學生做完整填寫與調整。</p>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  學生姓名
                  <input
                    onChange={(event) =>
                      updateDraftField("studentName", event.target.value)
                    }
                    value={draftRecord.studentName}
                  />
                </label>
                <label>
                  身高
                  <input
                    onChange={(event) => updateDraftField("height", event.target.value)}
                    value={draftRecord.height}
                  />
                </label>
                <label>
                  體重
                  <input
                    onChange={(event) => updateDraftField("weight", event.target.value)}
                    value={draftRecord.weight}
                  />
                </label>
                {scoreFields.map((field, index) => (
                  <label key={field}>
                    {data.itemLabels[index]}
                    <input
                      min="0"
                      onChange={(event) => updateScore(field, event.target.value)}
                      step="1"
                      type="number"
                      value={draftRecord[field]}
                    />
                  </label>
                ))}
                <label className="full-span">
                  評語
                  <textarea
                    onChange={(event) =>
                      updateDraftField("comment", event.target.value)
                    }
                    rows={4}
                    value={draftRecord.comment}
                  />
                </label>
              </div>
              <div className="button-row">
                <button className="primary-button" onClick={saveDraft} type="button">
                  儲存資料
                </button>
                <button className="danger-button" onClick={deleteSelected} type="button">
                  刪除目前選取
                </button>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "roster" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>編輯名冊</h2>
                  <p>這裡只管理一份目前名冊。若要切換班級，直接匯入那個班先前的資料即可。</p>
                </div>
              </div>

              <div className="roster-editor">
                <div className="roster-settings">
                  <label className="metric-label-editor">
                    班級人數
                    <input
                      inputMode="numeric"
                      min="1"
                      onChange={(event) => setRosterSizeInput(event.target.value)}
                      type="number"
                      value={rosterSizeInput}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    onClick={applyRosterSize}
                    type="button"
                  >
                    套用人數
                  </button>
                </div>

                <div className="roster-hint">
                  減少人數時會先提醒你，因為之後儲存名冊可能刪除超出人數的學生資料。
                </div>

                <div className="sheet-shell">
                  {renderSheetZoomToolbar(rosterZoomMode, setRosterZoomMode)}
                  {debugSettings.showSheetDebug
                    ? renderSheetDebugInfo({
                        viewportWidth: rosterViewportWidth,
                        naturalWidth: rosterNaturalWidth,
                        scale: rosterScale,
                        scrollLeft: rosterViewportRef.current?.scrollLeft ?? 0,
                      })
                    : null}
                  <div
                    className="sheet-viewport sheet-viewport-capped table-wrap"
                    onScroll={() =>
                      handleViewportScroll(
                        rosterViewportRef.current,
                        rosterNaturalWidth * rosterScale,
                      )
                    }
                    ref={rosterViewportRef}
                    style={{ maxHeight: getViewportMaxHeight(50) }}
                  >
                    <div
                      className="sheet-zoom-stage"
                      style={{
                        width: `${rosterNaturalWidth * rosterScale}px`,
                        height: "100%",
                      }}
                    >
                      <table
                        className="sheet-playground roster-sheet"
                        ref={rosterTableRef}
                        style={{
                          transform: `scale(${rosterScale})`,
                          transformOrigin: "top left",
                        }}
                      >
                        <thead>
                          <tr>
                            <th className="is-frozen-column">#</th>
                            <th className="is-frozen-column-secondary">姓名</th>
                            <th>身高</th>
                            <th>體重</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rosterDraft.map((entry, index) => (
                            <tr key={entry.id}>
                              <td className="is-frozen-column">{index + 1}</td>
                              <td className="is-frozen-column-secondary">
                                {rosterActiveCell?.rowIndex === index &&
                                rosterActiveCell?.columnIndex === 0 ? (
                                  <input
                                    autoFocus
                                    className="sheet-input"
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={() => setRosterActiveCell(null)}
                                    onChange={(event) =>
                                      updateRosterDraftCell(index, 0, event.target.value)
                                    }
                                    onKeyDown={(event) =>
                                      handleRosterKeyDown(event, index, 0)
                                    }
                                    onPaste={(event) =>
                                      handleRosterPaste(event, index, 0)
                                    }
                                    value={entry.studentName}
                                  />
                                ) : (
                                  <button
                                    className="sheet-cell"
                                    onClick={() =>
                                      setRosterActiveCell({ rowIndex: index, columnIndex: 0 })
                                    }
                                    type="button"
                                  >
                                    {entry.studentName || "—"}
                                  </button>
                                )}
                              </td>
                              <td>
                                {rosterActiveCell?.rowIndex === index &&
                                rosterActiveCell?.columnIndex === 1 ? (
                                  <input
                                    autoFocus
                                    className="sheet-input"
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={() => setRosterActiveCell(null)}
                                    onChange={(event) =>
                                      updateRosterDraftCell(index, 1, event.target.value)
                                    }
                                    onKeyDown={(event) =>
                                      handleRosterKeyDown(event, index, 1)
                                    }
                                    onPaste={(event) =>
                                      handleRosterPaste(event, index, 1)
                                    }
                                    value={entry.height}
                                  />
                                ) : (
                                  <button
                                    className="sheet-cell"
                                    onClick={() =>
                                      setRosterActiveCell({ rowIndex: index, columnIndex: 1 })
                                    }
                                    type="button"
                                  >
                                    {entry.height || "—"}
                                  </button>
                                )}
                              </td>
                              <td>
                                {rosterActiveCell?.rowIndex === index &&
                                rosterActiveCell?.columnIndex === 2 ? (
                                  <input
                                    autoFocus
                                    className="sheet-input"
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={() => setRosterActiveCell(null)}
                                    onChange={(event) =>
                                      updateRosterDraftCell(index, 2, event.target.value)
                                    }
                                    onKeyDown={(event) =>
                                      handleRosterKeyDown(event, index, 2)
                                    }
                                    onPaste={(event) =>
                                      handleRosterPaste(event, index, 2)
                                    }
                                    value={entry.weight}
                                  />
                                ) : (
                                  <button
                                    className="sheet-cell"
                                    onClick={() =>
                                      setRosterActiveCell({ rowIndex: index, columnIndex: 2 })
                                    }
                                    type="button"
                                  >
                                    {entry.weight || "—"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button
                    className="secondary-button"
                    onClick={addRosterRow}
                    type="button"
                  >
                    新增列
                  </button>
                  <button
                    className="primary-button"
                    onClick={importRosterToRecords}
                    type="button"
                  >
                    儲存
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "analysis" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>檢視能力分析</h2>
                  <p>快速查看單一學生六項測驗分布。</p>
                </div>
                <label className="shared-date-field">
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
                    {data.records.map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.studentName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <RadarChart labels={data.itemLabels} record={selectedRecord} />
            </section>
          </>
        ) : null}

        {activeTab === "pdf" ? (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>下載PDF</h2>
                  <p>這裡直接整合 A4 報表畫布與 PDF 輸出，適合整理學生能力分析並產出正式報表。</p>
                </div>
                <label className="shared-date-field">
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
              </div>
              <A4CanvasBoard
                ref={pdfCanvasRef}
                labels={data.itemLabels}
                record={selectedRecord}
                rosterName={data.rosterName}
                seatNumber={selectedSeatNumber}
                testDate={data.testDate}
              />
              <div className="callout">
                除了直接下載 PDF，你也可以在這裡同步處理 Excel 備份與重新匯入。
              </div>
              <div className="button-row">
                <button className="secondary-button" onClick={handleDownloadCurrentPdf} type="button">
                  下載目前學生 PDF
                </button>
                <button className="primary-button" onClick={handleDownloadAllPdfs} type="button">
                  下載全班 PDF
                </button>
              </div>
            </section>
            <section className="panel side-panel">
              <h2>目前能力</h2>
              <ul className="plain-list">
                <li>會直接帶入目前選到學生的雷達圖與基本資訊。</li>
                <li>可以再往上疊文字與圖片圖層。</li>
                <li>可直接下載真正的 PDF 檔。</li>
                <li>Excel 仍然保留給備份、搬移與重新匯入使用。</li>
                <li>若匯入的 Excel 缺少 `_system` 工作表，系統會拒絕載入。</li>
              </ul>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
