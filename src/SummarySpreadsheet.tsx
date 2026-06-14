import { useEffect } from "react";
import type { ReactNode, RefObject } from "react";
import type { FitnessField, FitnessRecord } from "./types";

type EditableField = keyof FitnessRecord;

type ActiveCell = {
  recordId: string;
  field: EditableField;
} | null;

interface SummarySpreadsheetProps {
  records: FitnessRecord[];
  scoreFields: FitnessField[];
  resolvedItemLabels: string[];
  selectedId: string;
  isMixedAgeClass: boolean;
  studentGradeOptions: string[];
  selectRecord: (record: FitnessRecord) => void;
  getMetricRangeHint: (field: FitnessField) => string;
  renderTableCell: (
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
  ) => ReactNode;
  getMetricDisplayValue: (record: FitnessRecord, field: FitnessField) => string;
  getMetricSelectOptions: (
    field: FitnessField,
    record: FitnessRecord | null,
  ) => Array<{ value: number | string; label: string }>;
  activeCell: ActiveCell;
  viewportRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLTableElement | null>;
  viewportMaxHeight: number | string;
  debugInfo?: ReactNode;
}

export default function SummarySpreadsheet({
  records,
  scoreFields,
  resolvedItemLabels,
  selectedId,
  isMixedAgeClass,
  studentGradeOptions,
  selectRecord,
  getMetricRangeHint,
  renderTableCell,
  getMetricDisplayValue,
  getMetricSelectOptions,
  activeCell,
  viewportRef,
  tableRef,
  viewportMaxHeight,
  debugInfo,
}: SummarySpreadsheetProps) {
  useEffect(() => {
    if (!activeCell || !viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current;
    const cell = document.querySelector<HTMLElement>(
      `[data-summary-cell="${activeCell.recordId}:${activeCell.field}"]`,
    );
    if (!cell) {
      return;
    }

    const stickyWidth = isMixedAgeClass ? 180 : 90;
    const cellLeft = cell.offsetLeft;
    const cellWidth = cell.offsetWidth;
    const scrollLeft = viewport.scrollLeft;
    const viewportWidth = viewport.clientWidth;

    if (cellLeft - scrollLeft < stickyWidth) {
      viewport.scrollLeft = Math.max(0, cellLeft - stickyWidth);
    } else if (cellLeft + cellWidth - scrollLeft > viewportWidth) {
      viewport.scrollLeft = cellLeft + cellWidth - viewportWidth;
    }
  }, [activeCell, isMixedAgeClass, viewportRef]);

  return (
    <div className="sheet-shell">
      {debugInfo}
      <div
        className="fixed-sheet-viewport table-wrap"
        ref={viewportRef}
        style={{ maxHeight: viewportMaxHeight }}
      >
        <table className="fixed-sheet-table" ref={tableRef}>
          <colgroup>
            <col style={{ width: "90px" }} />
            {isMixedAgeClass ? <col style={{ width: "90px" }} /> : null}
            <col style={{ width: "70px" }} />
            <col style={{ width: "70px" }} />
            {scoreFields.map((field) => (
              <col key={field} style={{ width: "80px" }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky-left-0">姓名</th>
              {isMixedAgeClass ? <th>年級</th> : null}
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
            {records.map((record) => (
              <tr
                className={record.id === selectedId ? "is-selected" : ""}
                key={record.id}
                onClick={() => selectRecord(record)}
              >
                <td className="sticky-left-0" data-summary-cell={`${record.id}:studentName`}>
                  {renderTableCell(record, "studentName", record.studentName)}
                </td>
                {isMixedAgeClass ? (
                  <td data-summary-cell={`${record.id}:studentGradeLabel`}>
                    {renderTableCell(
                      record,
                      "studentGradeLabel",
                      record.studentGradeLabel,
                        {
                          inputType: "select",
                          displayValue: record.studentGradeLabel,
                          selectOptions: studentGradeOptions.map((grade) => ({
                            label: grade,
                            value: grade,
                          })),
                      },
                    )}
                  </td>
                ) : null}
                <td data-summary-cell={`${record.id}:height`}>
                  {renderTableCell(record, "height", record.height)}
                </td>
                <td data-summary-cell={`${record.id}:weight`}>
                  {renderTableCell(record, "weight", record.weight)}
                </td>
                {scoreFields.map((field) => (
                  <td data-summary-cell={`${record.id}:${field}`} key={field}>
                    {renderTableCell(record, field, record[field], {
                      className: "cell-input-number",
                      displayValue: getMetricDisplayValue(record, field),
                      inputType:
                        getMetricSelectOptions(field, record).length > 0
                          ? "select"
                          : "number",
                      min: 0,
                      selectOptions: getMetricSelectOptions(field, record),
                      step: 1,
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
