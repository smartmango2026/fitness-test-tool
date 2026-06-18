import { useEffect } from "react";
import type { ReactNode, RefObject } from "react";
import type { FitnessField, FitnessRecord } from "./types";
import { getMetricContainerGroups, getMetricVariant } from "./test-rule-set";

type EditableField = keyof FitnessRecord;

type ActiveCell = {
  recordId: string;
  field: EditableField;
} | null;

type SummaryMetricColumn = {
  field: EditableField;
  label: string;
  displayField: FitnessField | null;
};

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
    if (!activeCell) {
      return;
    }

    const cell = document.querySelector<HTMLElement>(
      `[data-summary-cell="${activeCell.recordId}:${activeCell.field}"]`,
    );
    if (!cell) {
      return;
    }

    const viewport = cell.closest<HTMLDivElement>(".fixed-sheet-viewport");
    if (!viewport) {
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
  }, [activeCell, isMixedAgeClass]);

  const summaryGroups = getMetricContainerGroups(records, "item6");
  const baseScoreFields = scoreFields.filter((field) => field !== "item6");

  return (
    <div className="sheet-shell">
      {debugInfo}
      <div data-testid="summary-sheet">
        {summaryGroups.map((group, groupIndex) => {
          const variant = getMetricVariant("item6", group.records[0]?.studentGradeLabel ?? "大班");
          const metricColumns: SummaryMetricColumn[] = [
            ...baseScoreFields.map((field) => ({
              field,
              label: resolvedItemLabels[scoreFields.indexOf(field)] ?? field,
              displayField: field,
            })),
            ...variant.fields.map((inputField) => ({
              field: inputField.id,
              label:
                variant.fields.length === 1
                  ? variant.label
                  : inputField.label,
              displayField: inputField.id === "item6" ? ("item6" as FitnessField) : null,
            })),
          ];
          const navigationFields = [
            "studentName",
            ...(isMixedAgeClass ? ["studentGradeLabel"] : []),
            "height",
            "weight",
            ...metricColumns.map((column) => column.field),
          ] as Array<keyof FitnessRecord>;

          return (
            <div className="nmp-group" key={group.key}>
              {summaryGroups.length > 1 ? (
                <div className="nmp-group-heading">
                  <span>{group.label}</span>
                  <small>{group.grades.join("、")}</small>
                </div>
              ) : null}
              <div
                className="fixed-sheet-viewport table-wrap"
                data-testid="summary-group-viewport"
                ref={groupIndex === 0 ? viewportRef : undefined}
                style={{ maxHeight: viewportMaxHeight }}
              >
                <table className="fixed-sheet-table" ref={groupIndex === 0 ? tableRef : undefined}>
                  <colgroup>
                    <col style={{ width: "90px" }} />
                    {isMixedAgeClass ? <col style={{ width: "90px" }} /> : null}
                    <col style={{ width: "70px" }} />
                    <col style={{ width: "70px" }} />
                    {metricColumns.map((column) => (
                      <col key={String(column.field)} style={{ width: "80px" }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="sticky-left-0">姓名</th>
                      {isMixedAgeClass ? <th>年級</th> : null}
                      <th>身高</th>
                      <th>體重</th>
                      {metricColumns.map((column) => (
                        <th key={String(column.field)}>
                          <span className="metric-header-title">
                            {column.label}
                          </span>
                          {column.displayField ? (
                            <small className="metric-header-range">
                              {getMetricRangeHint(column.displayField)}
                            </small>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((record) => (
                      <tr
                        className={record.id === selectedId ? "is-selected" : ""}
                        key={record.id}
                        onClick={() => selectRecord(record)}
                      >
                        <td className="sticky-left-0" data-summary-cell={`${record.id}:studentName`}>
                          {renderTableCell(record, "studentName", record.studentName, {
                            navigationFields,
                          })}
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
                                  navigationFields,
                                  selectOptions: studentGradeOptions.map((grade) => ({
                                    label: grade,
                                    value: grade,
                                  })),
                              },
                            )}
                          </td>
                        ) : null}
                        <td data-summary-cell={`${record.id}:height`}>
                          {renderTableCell(record, "height", record.height, {
                            navigationFields,
                          })}
                        </td>
                        <td data-summary-cell={`${record.id}:weight`}>
                          {renderTableCell(record, "weight", record.weight, {
                            navigationFields,
                          })}
                        </td>
                        {metricColumns.map((column) => {
                          const value = record[column.field];
                          const fitnessField = column.displayField;
                          return (
                            <td data-summary-cell={`${record.id}:${String(column.field)}`} key={String(column.field)}>
                              {renderTableCell(record, column.field, typeof value === "number" ? value : 0, {
                                className: "cell-input-number",
                                displayValue: fitnessField
                                  ? getMetricDisplayValue(record, fitnessField)
                                  : typeof value === "number" && value > 0
                                    ? String(value)
                                    : "—",
                                inputType:
                                  fitnessField && getMetricSelectOptions(fitnessField, record).length > 0
                                    ? "select"
                                    : "number",
                                min: 0,
                                navigationFields,
                                selectOptions: fitnessField
                                  ? getMetricSelectOptions(fitnessField, record)
                                  : [],
                                step: 1,
                              })}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
