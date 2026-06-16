import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { AppData, FitnessField, FitnessRecord, RosterEntry, StudentGradeLabel } from "../types";
import { defaultAppData } from "../sample-data";
import { defaultAbilityRulesConfig, type AbilityRulesConfig } from "../ability-settings";
import {
  subscribeToAbilityRulesConfig,
  ensureAbilityRulesConfig,
} from "../ability-cloud";
import { useAuth } from "./AuthContext";
import { useDiagnostics } from "./DiagnosticContext";

type EditableField = keyof FitnessRecord;

type ActiveCell = {
  recordId: string;
  field: EditableField;
} | null;

type SheetZoomMode = "fit" | 0.8 | 0.9 | 1 | 1.1;
type TableSortKey = "seat" | "grade-desc" | "grade-asc";

const scoreFields: FitnessField[] = [
  "item1",
  "item2",
  "item3",
  "item4",
  "item5",
  "item6",
];

const emptyAppData: AppData = {
  ...defaultAppData,
  rosterName: "",
  rosterEntries: [],
  records: [],
};

function makeEmptyRecord(testDate: string): FitnessRecord {
  return {
    id: crypto.randomUUID(),
    studentName: "",
    height: "",
    weight: "",
    studentGradeLabel: "大班",
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
    studentGradeLabel: "大班",
  };
}

interface FitnessDataContextType {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  selectedId: string;
  setSelectedId: React.Dispatch<React.SetStateAction<string>>;
  draftRecord: FitnessRecord;
  setDraftRecord: React.Dispatch<React.SetStateAction<FitnessRecord>>;
  rosterDraft: RosterEntry[];
  setRosterDraft: React.Dispatch<React.SetStateAction<RosterEntry[]>>;
  rosterActiveCell: { rowIndex: number; columnIndex: number } | null;
  setRosterActiveCell: React.Dispatch<React.SetStateAction<{ rowIndex: number; columnIndex: number } | null>>;
  rosterSizeInput: string;
  setRosterSizeInput: React.Dispatch<React.SetStateAction<string>>;
  activeCell: ActiveCell;
  setActiveCell: React.Dispatch<React.SetStateAction<ActiveCell>>;
  activeMetric: FitnessField;
  setActiveMetric: React.Dispatch<React.SetStateAction<FitnessField>>;
  showIncompleteOnly: boolean;
  setShowIncompleteOnly: React.Dispatch<React.SetStateAction<boolean>>;
  tableSortKey: TableSortKey;
  setTableSortKey: React.Dispatch<React.SetStateAction<TableSortKey>>;
  showTableFilters: boolean;
  setShowTableFilters: React.Dispatch<React.SetStateAction<boolean>>;
  selectedTableGrades: StudentGradeLabel[];
  setSelectedTableGrades: React.Dispatch<React.SetStateAction<StudentGradeLabel[]>>;
  tableZoomMode: SheetZoomMode;
  setTableZoomMode: React.Dispatch<React.SetStateAction<SheetZoomMode>>;
  rosterViewportWidth: number;
  setRosterViewportWidth: React.Dispatch<React.SetStateAction<number>>;
  tableViewportWidth: number;
  setTableViewportWidth: React.Dispatch<React.SetStateAction<number>>;
  metricViewportWidth: number;
  setMetricViewportWidth: React.Dispatch<React.SetStateAction<number>>;
  rosterNaturalWidth: number;
  setRosterNaturalWidth: React.Dispatch<React.SetStateAction<number>>;
  tableNaturalWidth: number;
  setTableNaturalWidth: React.Dispatch<React.SetStateAction<number>>;
  metricNaturalWidth: number;
  setMetricNaturalWidth: React.Dispatch<React.SetStateAction<number>>;
  abilityRulesConfig: AbilityRulesConfig;
  setAbilityRulesConfig: React.Dispatch<React.SetStateAction<AbilityRulesConfig>>;
  resetFitnessData: (nextData?: AppData) => void;
}

const FitnessDataContext = createContext<FitnessDataContextType | undefined>(undefined);

export function FitnessDataProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const { updateLoadCheckpoint, pushFrontendIssue } = useDiagnostics();

  const [data, setData] = useState<AppData>(defaultAppData);
  const [selectedId, setSelectedId] = useState<string>(data.records[0]?.id ?? "");
  const [draftRecord, setDraftRecord] = useState<FitnessRecord>(
    data.records[0] ?? makeEmptyRecord(data.testDate),
  );
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
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [activeMetric, setActiveMetric] = useState<FitnessField>("item1");
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [tableSortKey, setTableSortKey] = useState<TableSortKey>("seat");
  const [showTableFilters, setShowTableFilters] = useState(false);
  const [selectedTableGrades, setSelectedTableGrades] = useState<StudentGradeLabel[]>(
    ["幼幼班", "小班", "中班", "大班"],
  );
  const [tableZoomMode, setTableZoomMode] = useState<SheetZoomMode>("fit");

  const [rosterViewportWidth, setRosterViewportWidth] = useState(0);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const [metricViewportWidth, setMetricViewportWidth] = useState(0);
  const [rosterNaturalWidth, setRosterNaturalWidth] = useState(640);
  const [tableNaturalWidth, setTableNaturalWidth] = useState(1120);
  const [metricNaturalWidth, setMetricNaturalWidth] = useState(520);

  const [abilityRulesConfig, setAbilityRulesConfig] = useState<AbilityRulesConfig>(
    defaultAbilityRulesConfig,
  );

  // Sync selectedId and draftRecord when records change
  useEffect(() => {
    if (data.records.length > 0) {
      if (!selectedId || !data.records.some(r => r.id === selectedId)) {
        setSelectedId(data.records[0].id);
      }
    }
  }, [data.records]);

  // Subscribe to Ability Rules when currentUser loads
  useEffect(() => {
    if (!currentUser) {
      setAbilityRulesConfig(defaultAbilityRulesConfig);
      return;
    }

    const unsubscribeAbilityRules = subscribeToAbilityRulesConfig(
      currentUser.uid,
      (config) => {
        setAbilityRulesConfig(config);
        updateLoadCheckpoint("abilityRules", "success", "能力值對應表已載入。");
      },
      (error) => {
        const nextMessage = error instanceof Error ? error.message : "無法訂閱能力值對應表。";
        updateLoadCheckpoint("abilityRules", "error", nextMessage);
        pushFrontendIssue(`能力值對應表載入失敗：${nextMessage}`);
      },
    );

    void ensureAbilityRulesConfig(currentUser.uid).catch((error) => {
      const nextMessage = error instanceof Error ? error.message : "無法載入能力值對應表。";
      updateLoadCheckpoint("abilityRules", "error", nextMessage);
      pushFrontendIssue(`能力值對應表載入失敗：${nextMessage}`);
    });

    return () => {
      unsubscribeAbilityRules();
    };
  }, [currentUser]);

  const resetFitnessData = (nextData: AppData = emptyAppData) => {
    setData(nextData);
    setSelectedId(nextData.records[0]?.id ?? "");
    setDraftRecord(nextData.records[0] ?? makeEmptyRecord(nextData.testDate));
    setRosterDraft(
      nextData.rosterEntries.length ? nextData.rosterEntries : [makeEmptyRosterEntry()],
    );
    setRosterSizeInput(String(nextData.rosterEntries.length || 1));
    setActiveCell(null);
    setRosterActiveCell(null);
  };

  return (
    <FitnessDataContext.Provider
      value={{
        data,
        setData,
        selectedId,
        setSelectedId,
        draftRecord,
        setDraftRecord,
        rosterDraft,
        setRosterDraft,
        rosterActiveCell,
        setRosterActiveCell,
        rosterSizeInput,
        setRosterSizeInput,
        activeCell,
        setActiveCell,
        activeMetric,
        setActiveMetric,
        showIncompleteOnly,
        setShowIncompleteOnly,
        tableSortKey,
        setTableSortKey,
        showTableFilters,
        setShowTableFilters,
        selectedTableGrades,
        setSelectedTableGrades,
        tableZoomMode,
        setTableZoomMode,
        rosterViewportWidth,
        setRosterViewportWidth,
        tableViewportWidth,
        setTableViewportWidth,
        metricViewportWidth,
        setMetricViewportWidth,
        rosterNaturalWidth,
        setRosterNaturalWidth,
        tableNaturalWidth,
        setTableNaturalWidth,
        metricNaturalWidth,
        setMetricNaturalWidth,
        abilityRulesConfig,
        setAbilityRulesConfig,
        resetFitnessData,
      }}
    >
      {children}
    </FitnessDataContext.Provider>
  );
}

export function useFitnessData() {
  const context = useContext(FitnessDataContext);
  if (!context) {
    throw new Error("useFitnessData must be used within a FitnessDataProvider");
  }
  return context;
}
export { makeEmptyRecord, makeEmptyRosterEntry };
