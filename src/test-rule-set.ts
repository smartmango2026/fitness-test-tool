import type { FitnessField, FitnessRecord, StudentGradeLabel } from "./types";

export type MetricInputField = {
  id: keyof FitnessRecord;
  label: string;
  unit?: string;
};

export type MetricVariant = {
  id: string;
  label: string;
  appliesToGrades: StudentGradeLabel[];
  containerGroup: string;
  fields: MetricInputField[];
  aggregateTo?: FitnessField;
  aggregation?: "single" | "average";
};

export type MetricRuleDefinition = {
  id: FitnessField;
  label: string;
  defaultFields: MetricInputField[];
  variants?: MetricVariant[];
};

export type TestRuleSet = {
  id: string;
  name: string;
  metrics: MetricRuleDefinition[];
};

export const builtInTestRuleSet: TestRuleSet = {
  id: "sgpea-built-in-v1",
  name: "協會內建測驗規則",
  metrics: [
    {
      id: "item1",
      label: "測驗項目 1",
      defaultFields: [{ id: "item1", label: "測驗數值" }],
    },
    {
      id: "item2",
      label: "測驗項目 2",
      defaultFields: [{ id: "item2", label: "測驗數值" }],
    },
    {
      id: "item3",
      label: "測驗項目 3",
      defaultFields: [{ id: "item3", label: "測驗數值" }],
    },
    {
      id: "item4",
      label: "測驗項目 4",
      defaultFields: [{ id: "item4", label: "測驗數值" }],
    },
    {
      id: "item5",
      label: "測驗項目 5",
      defaultFields: [{ id: "item5", label: "測驗數值" }],
    },
    {
      id: "item6",
      label: "跳躍能力",
      defaultFields: [{ id: "item6", label: "測驗數值" }],
      variants: [
        {
          id: "junior-two-foot-jump",
          label: "雙腳跳",
          appliesToGrades: ["幼幼班", "小班"],
          containerGroup: "junior",
          fields: [{ id: "item6", label: "雙腳跳" }],
          aggregateTo: "item6",
          aggregation: "single",
        },
        {
          id: "middle-senior-single-foot-jump",
          label: "單腳跳",
          appliesToGrades: ["中班", "大班"],
          containerGroup: "middle-senior",
          fields: [
            { id: "item6Left", label: "左腳" },
            { id: "item6Right", label: "右腳" },
          ],
          aggregateTo: "item6",
          aggregation: "average",
        },
      ],
    },
  ],
};

export function getMetricRuleDefinition(field: FitnessField): MetricRuleDefinition {
  return builtInTestRuleSet.metrics.find((metric) => metric.id === field) ??
    { id: field, label: field, defaultFields: [{ id: field, label: "測驗數值" }] };
}

export function getMetricVariant(
  field: FitnessField,
  grade: StudentGradeLabel,
): MetricVariant {
  const definition = getMetricRuleDefinition(field);
  const variant = definition.variants?.find((candidate) =>
    candidate.appliesToGrades.includes(grade),
  );

  if (variant) {
    return variant;
  }

  return {
    id: `${field}-default`,
    label: definition.label,
    appliesToGrades: [grade],
    containerGroup: "default",
    fields: definition.defaultFields,
    aggregateTo: field,
    aggregation: "single",
  };
}

export function getMetricContainerGroups(
  records: FitnessRecord[],
  field: FitnessField,
): Array<{ key: string; label: string; grades: StudentGradeLabel[]; records: FitnessRecord[] }> {
  const groups = new Map<
    string,
    { key: string; label: string; grades: StudentGradeLabel[]; records: FitnessRecord[] }
  >();

  records.forEach((record) => {
    const variant = getMetricVariant(field, record.studentGradeLabel);
    const current = groups.get(variant.containerGroup) ?? {
      key: variant.containerGroup,
      label: variant.label,
      grades: [],
      records: [],
    };

    if (!current.grades.includes(record.studentGradeLabel)) {
      current.grades.push(record.studentGradeLabel);
    }

    current.records.push(record);
    groups.set(variant.containerGroup, current);
  });

  return Array.from(groups.values());
}

export function aggregateMetricVariantValue(
  record: FitnessRecord,
  variant: MetricVariant,
): number {
  if (!variant.aggregateTo || variant.aggregation === "single") {
    const firstField = variant.fields[0]?.id;
    return typeof firstField === "string" && typeof record[firstField] === "number"
      ? record[firstField]
      : 0;
  }

  const values = variant.fields
    .map((field) => record[field.id])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return 0;
  }

  if (variant.aggregation === "average") {
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  return values[0] ?? 0;
}
