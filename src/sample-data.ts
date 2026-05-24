import type { AppData } from "./types";

export const defaultAppData: AppData = {
  schemaVersion: 3,
  testDate: "2026-04-22",
  academicTerm: "114學年度下學期",
  itemLabels: ["柔軟度", "平衡", "核心", "爆發力", "敏捷", "協調"],
  rosterName: "星星班",
  gradeLabel: "大班",
  rosterEntries: [
    { id: "roster_001", studentName: "王小明", height: "118", weight: "22" },
    { id: "roster_002", studentName: "林小華", height: "121", weight: "23" },
  ],
  records: [
    {
      id: "rec_001",
      studentName: "王小明",
      height: "118",
      weight: "22",
      testDate: "2026-04-22",
      item1: 12,
      item2: 10,
      item3: 14,
      item4: 11,
      item5: 13,
      item6: 15,
      comment: "整體表現穩定",
    },
    {
      id: "rec_002",
      studentName: "林小華",
      height: "121",
      weight: "23",
      testDate: "2026-04-22",
      item1: 9,
      item2: 13,
      item3: 11,
      item4: 15,
      item5: 12,
      item6: 10,
      comment: "爆發力表現突出",
    },
  ],
};
