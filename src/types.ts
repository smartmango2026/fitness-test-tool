export type FitnessField =
  | "item1"
  | "item2"
  | "item3"
  | "item4"
  | "item5"
  | "item6";

export type RosterEntry = {
  id: string;
  studentName: string;
  height: string;
  weight: string;
};

export type FitnessRecord = {
  id: string;
  studentName: string;
  height: string;
  weight: string;
  testDate: string;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  comment: string;
};

export type AppData = {
  schemaVersion: number;
  testDate: string;
  academicTerm: string;
  itemLabels: string[];
  rosterName: string;
  gradeLabel: string;
  rosterEntries: RosterEntry[];
  records: FitnessRecord[];
};
