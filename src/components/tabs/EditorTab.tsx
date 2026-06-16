import React, { useMemo } from "react";
import { useFiles } from "../../context/FileContext";
import { useFitnessData, makeEmptyRecord } from "../../context/FitnessDataContext";
import { findAbilityGradeProfile, getAbilityRuleForField, getRubricOptions } from "../../ability-scoring";
import { abilityRulesByGradeGroup } from "../../ability-rules";
import type { StudentGradeLabel, FitnessField, FitnessRecord } from "../../types";

interface EditorTabProps {
  setMessage: (msg: string) => void;
  handleTabChange: (tab: string) => void;
}

const scoreFields: FitnessField[] = [
  "item1",
  "item2",
  "item3",
  "item4",
  "item5",
  "item6",
];

const STUDENT_GRADE_OPTIONS: StudentGradeLabel[] = ["幼幼班", "小班", "中班", "大班"];

function isStudentGradeLabel(value: string): value is StudentGradeLabel {
  return value === "幼幼班" || value === "小班" || value === "中班" || value === "大班";
}

function resolveStudentGradeLabel(
  fileGradeLabel: string,
  studentGradeLabel: string,
): StudentGradeLabel {
  if (isStudentGradeLabel(studentGradeLabel)) {
    return studentGradeLabel;
  }
  if (isStudentGradeLabel(fileGradeLabel)) {
    return fileGradeLabel;
  }
  return "中班";
}

function isMixedAgeClass(gradeLabel: string): boolean {
  return gradeLabel === "混齡班";
}

function normalizeNumber(value: string): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

function upsertRecord(records: FitnessRecord[], nextRecord: FitnessRecord) {
  const foundIndex = records.findIndex((record) => record.id === nextRecord.id);
  if (foundIndex === -1) {
    return [nextRecord, ...records];
  }
  return records.map((record, index) =>
    index === foundIndex ? nextRecord : record,
  );
}

export default function EditorTab({ setMessage, handleTabChange }: EditorTabProps) {
  const {
    data,
    setData,
    selectedId,
    setSelectedId,
    draftRecord,
    setDraftRecord,
    abilityRulesConfig,
  } = useFitnessData();

  const selectedRecord = useMemo(
    () => data.records.find((record) => record.id === selectedId) ?? null,
    [data.records, selectedId],
  );

  const currentAbilityProfile = useMemo(
    () => findAbilityGradeProfile(abilityRulesConfig, resolveStudentGradeLabel(data.gradeLabel, selectedRecord?.studentGradeLabel || "")),
    [abilityRulesConfig, data.gradeLabel, selectedRecord],
  );

  const getRecordGradeLabel = (record: FitnessRecord | null): string => {
    if (!record) {
      return data.gradeLabel;
    }
    return resolveStudentGradeLabel(data.gradeLabel, record.studentGradeLabel);
  };

  const getProfileForRecord = (record: FitnessRecord | null) => {
    return findAbilityGradeProfile(abilityRulesConfig, getRecordGradeLabel(record));
  };

  const getMetricRule = (field: FitnessField, record: FitnessRecord | null) => {
    return getAbilityRuleForField(getProfileForRecord(record), field);
  };

  const getMetricSelectOptions = (field: FitnessField, record: FitnessRecord | null) => {
    return getRubricOptions(getMetricRule(field, record));
  };

  const resolvedItemLabels = useMemo(() => {
    if (!isMixedAgeClass(data.gradeLabel)) {
      return scoreFields.map(
        (field, index) =>
          getAbilityRuleForField(currentAbilityProfile, field)?.metricLabel ??
          data.itemLabels[index] ??
          field,
      );
    }

    const juniorRules = abilityRulesByGradeGroup.junior;
    const middleSeniorRules = abilityRulesByGradeGroup.middleSenior;

    return scoreFields.map((field, index) => {
      const juniorLabel = juniorRules[field]?.metricLabel;
      const middleSeniorLabel = middleSeniorRules[field]?.metricLabel;
      if (juniorLabel && middleSeniorLabel && juniorLabel !== middleSeniorLabel) {
        return `${middleSeniorLabel} / ${juniorLabel}`;
      }
      return middleSeniorLabel ?? juniorLabel ?? data.itemLabels[index] ?? field;
    });
  }, [currentAbilityProfile, data.gradeLabel, data.itemLabels]);

  const updateDraftField = (
    field: keyof FitnessRecord,
    value: string | number,
  ): void => {
    setDraftRecord((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateScore = (field: FitnessField, value: string): void => {
    updateDraftField(field, normalizeNumber(value));
  };

  const saveDraft = (): void => {
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
    handleTabChange("table");
    setMessage("資料已儲存。");
  };

  const deleteSelected = (): void => {
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
  };

  return (
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
        {isMixedAgeClass(data.gradeLabel) ? (
          <label>
            學生年級
            <select
              onChange={(event) =>
                updateDraftField("studentGradeLabel", event.target.value)
              }
              value={draftRecord.studentGradeLabel}
            >
              {STUDENT_GRADE_OPTIONS.map((grade) => (
                <option key={`draft-${grade}`} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {scoreFields.map((field, index) => (
          <label key={field}>
            {getMetricRule(field, draftRecord)?.metricLabel ?? resolvedItemLabels[index]}
            {getMetricRule(field, draftRecord)?.kind === "rubric" ? (
              <select
                onChange={(event) => updateScore(field, event.target.value)}
                value={draftRecord[field]}
              >
                <option value="0">未填寫</option>
                {getMetricSelectOptions(field, draftRecord).map((option) => (
                  <option key={`${field}-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                min="0"
                onChange={(event) => updateScore(field, event.target.value)}
                step="1"
                type="number"
                value={draftRecord[field]}
              />
            )}
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
  );
}
