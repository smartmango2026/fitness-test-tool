import type { AbilityGradeProfile, AbilityRulesConfig } from "./ability-settings";
import type {
  AbilityMetricKey,
  AbilityRule,
} from "./ability-rules";
import type { FitnessRecord } from "./types";

const metricKeys: AbilityMetricKey[] = ["item1", "item2", "item3", "item4", "item5", "item6"];

export type RubricOption = {
  value: number;
  label: string;
};

export function findAbilityGradeProfile(
  config: AbilityRulesConfig,
  gradeLabel: string,
): AbilityGradeProfile | null {
  const normalizedGradeLabel = gradeLabel.trim();
  if (!normalizedGradeLabel) {
    return config.gradeProfiles[0] ?? null;
  }

  return (
    config.gradeProfiles.find((profile) => profile.label.trim() === normalizedGradeLabel) ??
    config.gradeProfiles[0] ??
    null
  );
}

export function getAbilityRuleForField(
  profile: AbilityGradeProfile | null,
  field: AbilityMetricKey,
): AbilityRule | null {
  return profile?.rules[field] ?? null;
}

export function getRubricOptions(rule: AbilityRule | null): RubricOption[] {
  if (!rule || rule.kind !== "rubric") {
    return [];
  }

  return rule.bands.map((band) => ({
    value: band.score,
    label: band.label,
  }));
}

function matchNumericBand(value: number, rule: AbilityRule): number {
  if (rule.kind !== "numeric") {
    return 0;
  }

  for (const band of rule.bands) {
    const minOk = band.min === undefined || value >= band.min;
    const maxOk = band.max === undefined || value <= band.max;
    if (minOk && maxOk) {
      return band.score;
    }
  }

  return 0;
}

function matchRubricBand(value: number, rule: AbilityRule): number {
  if (rule.kind !== "rubric") {
    return 0;
  }

  const directMatch = rule.bands.find((band) => band.score === value);
  if (directMatch) {
    return directMatch.score;
  }

  if (Number.isInteger(value) && value >= 1 && value <= rule.bands.length) {
    const legacyIndex = rule.bands.length - value;
    return rule.bands[legacyIndex]?.score ?? 0;
  }

  return 0;
}

export function getAbilityScoreFromRawValue(
  rawValue: number,
  rule: AbilityRule | null,
): number {
  if (!rule || !Number.isFinite(rawValue) || rawValue <= 0) {
    return 0;
  }

  return rule.kind === "numeric"
    ? matchNumericBand(rawValue, rule)
    : matchRubricBand(rawValue, rule);
}

export function getAbilityScores(
  record: FitnessRecord | null,
  profile: AbilityGradeProfile | null,
): number[] {
  if (!record) {
    return [0, 0, 0, 0, 0, 0];
  }

  return metricKeys.map((field) =>
    getAbilityScoreFromRawValue(record[field], getAbilityRuleForField(profile, field)),
  );
}

export function getAbilityBandLabel(
  score: number,
  config: AbilityRulesConfig,
): string {
  const matchedBand = config.reportBands.find(
    (band) => score >= band.min && score <= band.max,
  );
  return matchedBand?.systemLabel ?? "未分級";
}

export function getDisplayValueForField(
  rawValue: number,
  rule: AbilityRule | null,
): string {
  if (!rule) {
    return String(rawValue || "") || "—";
  }

  if (rule.kind === "rubric") {
    const direct = rule.bands.find((band) => band.score === rawValue);
    if (direct) {
      return direct.label;
    }

    if (rawValue <= 0) {
      return "—";
    }
  }

  return String(rawValue || "") || "—";
}

