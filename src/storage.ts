import type { AppData, FitnessRecord, RosterEntry } from "./types";
import { defaultAppData } from "./sample-data";

const STORAGE_KEY = "fitness-test-tool.app-data.v1";

type LegacyAppData = Partial<AppData> & {
  testDate?: string;
  rosterStudents?: string[];
  records?: Array<Partial<FitnessRecord>>;
};

function buildRosterEntries(data: LegacyAppData): RosterEntry[] {
  if (Array.isArray(data.rosterEntries)) {
    return data.rosterEntries.map((entry, index) => ({
      id: entry.id || `roster_${index + 1}`,
      studentName: entry.studentName || "",
      height: entry.height || "",
      weight: entry.weight || "",
    }));
  }

  if (Array.isArray(data.rosterStudents)) {
    return data.rosterStudents.map((studentName, index) => ({
      id: `roster_${index + 1}`,
      studentName,
      height: "",
      weight: "",
    }));
  }

  return defaultAppData.rosterEntries;
}

function migrateRecords(data: LegacyAppData, testDate: string): FitnessRecord[] {
  const records = Array.isArray(data.records) ? data.records : defaultAppData.records;

  return records.map((record, index) => ({
    id: record.id || `rec_${index + 1}`,
    studentName: record.studentName || "",
    height: record.height || "",
    weight: record.weight || "",
    testDate: record.testDate || testDate,
    item1: typeof record.item1 === "number" ? record.item1 : 0,
    item2: typeof record.item2 === "number" ? record.item2 : 0,
    item3: typeof record.item3 === "number" ? record.item3 : 0,
    item4: typeof record.item4 === "number" ? record.item4 : 0,
    item5: typeof record.item5 === "number" ? record.item5 : 0,
    item6: typeof record.item6 === "number" ? record.item6 : 0,
    comment: record.comment || "",
  }));
}

function migrateAppData(data: LegacyAppData): AppData {
  const testDate =
    data.testDate ??
    data.records?.[0]?.testDate ??
    defaultAppData.testDate;
  const rosterEntries = buildRosterEntries(data);
  const records = migrateRecords(data, testDate).map((record) => {
    const matchingRosterEntry = rosterEntries.find(
      (entry) => entry.studentName === record.studentName,
    );

    return matchingRosterEntry
      ? {
          ...record,
          height: record.height || matchingRosterEntry.height,
          weight: record.weight || matchingRosterEntry.weight,
        }
      : record;
  });

  return {
    schemaVersion:
      typeof data.schemaVersion === "number"
        ? data.schemaVersion
        : defaultAppData.schemaVersion,
    testDate,
    academicTerm:
      ("academicTerm" in data && typeof data.academicTerm === "string" && data.academicTerm.trim()
        ? data.academicTerm
        : formatAcademicTermFromDate(testDate)),
    itemLabels:
      Array.isArray(data.itemLabels) && data.itemLabels.length
        ? data.itemLabels
        : defaultAppData.itemLabels,
    rosterName:
      ("rosterName" in data && typeof data.rosterName === "string"
        ? data.rosterName
        : defaultAppData.rosterName),
    gradeLabel:
      ("gradeLabel" in data && typeof data.gradeLabel === "string"
        ? data.gradeLabel
        : defaultAppData.gradeLabel),
    rosterEntries,
    records,
  };
}

function formatAcademicTermFromDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return defaultAppData.academicTerm;
  }

  const year = date.getFullYear() - 1911;
  const month = date.getMonth() + 1;
  const term = month >= 8 || month === 1 ? "上學期" : "下學期";
  const academicYear = month === 1 ? year - 1 : year;
  return `${academicYear}學年度${term}`;
}

export function loadAppData(): AppData | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return migrateAppData(JSON.parse(raw) as LegacyAppData);
  } catch {
    return null;
  }
}

export function saveAppData(data: AppData): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
