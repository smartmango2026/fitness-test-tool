import * as XLSX from "xlsx";
import type { AppData, FitnessRecord, StudentGradeLabel } from "../../domain/types";

const VISIBLE_SHEET_NAME = "Records";
const SYSTEM_SHEET_NAME = "_system";

type SystemSheetMap = Record<string, string>;

function isStudentGradeLabel(value: unknown): value is StudentGradeLabel {
  return value === "幼幼班" || value === "小班" || value === "中班" || value === "大班";
}

function inferStudentGradeLabel(fileGradeLabel: string, value: unknown): StudentGradeLabel {
  if (isStudentGradeLabel(value)) {
    return value;
  }

  if (isStudentGradeLabel(fileGradeLabel)) {
    return fileGradeLabel;
  }

  return "中班";
}

function buildVisibleSheet(data: AppData): XLSX.WorkSheet {
  const headerRow = [
    "姓名",
    "學生年級",
    "身高",
    "體重",
    data.itemLabels[0] ?? "測驗項目 1",
    data.itemLabels[1] ?? "測驗項目 2",
    data.itemLabels[2] ?? "測驗項目 3",
    data.itemLabels[3] ?? "測驗項目 4",
    data.itemLabels[4] ?? "測驗項目 5",
    data.itemLabels[5] ?? "測驗項目 6",
    "評語",
  ];
  const recordRows = data.records.map((record) => [
    record.studentName,
    record.studentGradeLabel,
    record.height,
    record.weight,
    record.item1,
    record.item2,
    record.item3,
    record.item4,
    record.item5,
    record.item6,
    record.comment,
  ]);
  const rows = [
    ["班級名稱", data.rosterName],
    ["年級", data.gradeLabel],
    ["學期", data.academicTerm],
    ["測驗日期", data.testDate],
    [],
    headerRow,
    ...recordRows,
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  sheet["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 24 },
  ];

  return sheet;
}

function buildSystemRows(data: AppData): string[][] {
  return [
    ["key", "value"],
    ["schemaVersion", String(data.schemaVersion)],
    ["exportedAt", new Date().toISOString()],
    ["toolName", "fitness-test-tool"],
    ["toolVersion", "0.1.0"],
    ["testDate", data.testDate],
    ["academicTerm", data.academicTerm],
    ["itemLabels", JSON.stringify(data.itemLabels)],
    ["rosterName", data.rosterName],
    ["gradeLabel", data.gradeLabel],
    ["rosterEntriesJson", JSON.stringify(data.rosterEntries)],
    ["recordsJson", JSON.stringify(data.records)],
  ];
}

function systemRowsToMap(rows: unknown[][]): SystemSheetMap {
  const entries = rows
    .slice(1)
    .filter((row): row is [string, string] => {
      return typeof row[0] === "string" && typeof row[1] === "string";
    })
    .map(([key, value]) => [key, value] as const);

  return Object.fromEntries(entries);
}

function parseRecordsJson(recordsJson: string): FitnessRecord[] {
  const parsed = JSON.parse(recordsJson) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Embedded records data is not an array.");
  }

  return parsed as FitnessRecord[];
}

export function exportWorkbook(data: AppData): void {
  const workbook = XLSX.utils.book_new();
  const visibleSheet = buildVisibleSheet(data);
  const systemSheet = XLSX.utils.aoa_to_sheet(buildSystemRows(data));

  XLSX.utils.book_append_sheet(workbook, visibleSheet, VISIBLE_SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, systemSheet, SYSTEM_SHEET_NAME);
  workbook.Workbook = {
    Sheets: [
      { name: VISIBLE_SHEET_NAME, Hidden: 0 },
      { name: SYSTEM_SHEET_NAME, Hidden: 1 },
    ],
  };

  XLSX.writeFile(workbook, "fitness-records.xlsx");
}

export async function importWorkbook(file: File): Promise<AppData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const systemSheet = workbook.Sheets[SYSTEM_SHEET_NAME];

  if (!systemSheet) {
    throw new Error("This Excel file does not contain the required system data.");
  }

  const rows = XLSX.utils.sheet_to_json(systemSheet, {
    header: 1,
    raw: false,
  }) as unknown[][];
  const values = systemRowsToMap(rows);

  if (!values.schemaVersion || !values.itemLabels || !values.recordsJson) {
    throw new Error("The embedded system data is incomplete or invalid.");
  }

  const records = parseRecordsJson(values.recordsJson).map((record) => ({
    ...record,
    studentGradeLabel: inferStudentGradeLabel(values.gradeLabel, record.studentGradeLabel),
    height: record.height || "",
    weight: record.weight || "",
    testDate: values.testDate || record.testDate,
  }));

  return {
    schemaVersion: Number(values.schemaVersion),
    testDate: values.testDate || records[0]?.testDate || new Date().toISOString().slice(0, 10),
    academicTerm: values.academicTerm || "尚未設定",
    itemLabels: JSON.parse(values.itemLabels) as string[],
    rosterName: values.rosterName || "星星班",
    gradeLabel: values.gradeLabel || "未設定",
    rosterEntries: values.rosterEntriesJson
      ? (JSON.parse(values.rosterEntriesJson) as AppData["rosterEntries"])
      : records.map((record, index) => ({
          id: `roster_${index + 1}`,
          studentName: record.studentName,
          studentGradeLabel: inferStudentGradeLabel(values.gradeLabel, record.studentGradeLabel),
          height: record.height,
          weight: record.weight,
        })),
    records,
  };
}
