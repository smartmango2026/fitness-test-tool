import type { SchoolId } from "./schools";

export type FitnessField =
  | "item1"
  | "item2"
  | "item3"
  | "item4"
  | "item5"
  | "item6";

export type StudentGradeLabel = "幼幼班" | "小班" | "中班" | "大班";

export type RosterEntry = {
  id: string;
  studentName: string;
  height: string;
  weight: string;
  studentGradeLabel: StudentGradeLabel;
};

export type FitnessRecord = {
  id: string;
  studentName: string;
  height: string;
  weight: string;
  studentGradeLabel: StudentGradeLabel;
  testDate: string;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  item6Left?: number;
  item6Right?: number;
  comment: string;
};

export type AppData = {
  schemaVersion: number;
  testDate: string;
  academicTerm: string;
  schoolId?: SchoolId | "";
  schoolNameSnapshot?: string;
  schoolBranchNameSnapshot?: string;
  schoolLogoSnapshotUrl?: string;
  itemLabels: string[];
  rosterName: string;
  gradeLabel: string;
  rosterEntries: RosterEntry[];
  records: FitnessRecord[];
};
