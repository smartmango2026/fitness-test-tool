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
  splitMixedAge?: boolean;
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
      label: "立定跳遠",
      defaultFields: [{ id: "item1", label: "立定跳遠" }],
    },
    {
      id: "item2",
      label: "坐姿體前彎",
      defaultFields: [{ id: "item2", label: "坐姿體前彎" }],
    },
    {
      id: "item3",
      label: "擲遠",
      defaultFields: [{ id: "item3", label: "擲遠" }],
    },
    {
      id: "item4",
      label: "協調 / 敏捷移動",
      defaultFields: [{ id: "item4", label: "測驗數值" }],
      splitMixedAge: true,
      variants: [
        {
          id: "junior-directional-crawl",
          label: "6 公尺定向爬行",
          appliesToGrades: ["幼幼班", "小班"],
          containerGroup: "junior",
          fields: [{ id: "item4", label: "6 公尺定向爬行" }],
          aggregateTo: "item4",
          aggregation: "single",
        },
        {
          id: "middle-senior-forward-roll",
          label: "前滾翻",
          appliesToGrades: ["中班", "大班"],
          containerGroup: "middle-senior",
          fields: [{ id: "item4", label: "前滾翻" }],
          aggregateTo: "item4",
          aggregation: "single",
        },
      ],
    },
    {
      id: "item5",
      label: "平衡 / 敏捷",
      defaultFields: [{ id: "item5", label: "測驗數值" }],
      splitMixedAge: true,
      variants: [
        {
          id: "junior-balance-walk",
          label: "平衡走",
          appliesToGrades: ["幼幼班", "小班"],
          containerGroup: "junior",
          fields: [{ id: "item5", label: "平衡走" }],
          aggregateTo: "item5",
          aggregation: "single",
        },
        {
          id: "middle-senior-side-touch",
          label: "側併摸地",
          appliesToGrades: ["中班", "大班"],
          containerGroup: "middle-senior",
          fields: [{ id: "item5", label: "側併摸地" }],
          aggregateTo: "item5",
          aggregation: "single",
        },
      ],
    },
    {
      id: "item6",
      label: "跳躍能力",
      defaultFields: [{ id: "item6", label: "測驗數值" }],
      splitMixedAge: true,
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

export function getMixedAgeMetricGroupKey(
  record: FitnessRecord,
  fields: FitnessField[],
): string {
  const keys = fields
    .map((field) => getMetricVariant(field, record.studentGradeLabel).containerGroup)
    .filter((key) => key !== "default");

  return keys[0] ?? "default";
}

export function getMixedAgeMetricGroups(
  records: FitnessRecord[],
  fields: FitnessField[],
): Array<{ key: string; label: string; grades: StudentGradeLabel[]; records: FitnessRecord[] }> {
  const groups = new Map<
    string,
    { key: string; label: string; grades: StudentGradeLabel[]; records: FitnessRecord[] }
  >();

  records.forEach((record) => {
    const key = getMixedAgeMetricGroupKey(record, fields);
    const current = groups.get(key) ?? {
      key,
      label: key === "middle-senior" ? "中班、大班" : key === "junior" ? "幼幼班、小班" : "測驗資料",
      grades: [],
      records: [],
    };

    if (!current.grades.includes(record.studentGradeLabel)) {
      current.grades.push(record.studentGradeLabel);
    }

    current.records.push(record);
    groups.set(key, current);
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
