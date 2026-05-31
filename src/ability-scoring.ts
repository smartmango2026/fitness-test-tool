import type { AbilityGradeProfile, AbilityRulesConfig } from "./ability-settings";
import type {
  AbilityMetricKey,
  AbilityRule,
} from "./ability-rules";
import { lowAbilityAdviceByKey } from "./ability-settings";
import type { FitnessRecord } from "./types";

const metricKeys: AbilityMetricKey[] = ["item1", "item2", "item3", "item4", "item5", "item6"];

export type RubricOption = {
  value: number;
  label: string;
};

const abilityAdviceKeyByLabel: Record<string, keyof typeof lowAbilityAdviceByKey> = {
  爆發力: "explosivePower",
  柔軟度: "flexibility",
  平衡力: "balance",
  協調力: "coordination",
  敏捷度: "agility",
  敏捷移動: "agility",
  上肢力量: "upperBodyStrength",
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

function getAbilityReportBand(
  score: number,
  config: AbilityRulesConfig,
) {
  return config.reportBands.find((band) => score >= band.min && score <= band.max) ?? null;
}

function getLeadingSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const firstSentence = trimmed.split("。")[0]?.trim() ?? "";
  return firstSentence ? `${firstSentence}。` : trimmed;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }

  if (labels.length === 2) {
    return `${labels[0]}與${labels[1]}`;
  }

  return `${labels.slice(0, -1).join("、")}與${labels[labels.length - 1]}`;
}

export function generateObservationAndEncouragement(
  record: FitnessRecord | null,
  profile: AbilityGradeProfile | null,
  config: AbilityRulesConfig,
): string {
  if (!record || !profile) {
    return "整體觀察\n尚未選擇學生，請先完成測驗資料後再產生報表。";
  }

  const entries = metricKeys
    .map((field) => {
      const rule = getAbilityRuleForField(profile, field);
      const score = getAbilityScoreFromRawValue(record[field], rule);
      return {
        field,
        score,
        abilityLabel: rule?.abilityLabel ?? field,
      };
    })
    .filter((entry) => entry.score > 0);

  if (entries.length === 0) {
    return "整體觀察\n目前尚未填入足夠的測驗資料，建議完成六項測驗後再查看老師觀察與鼓勵。";
  }

  const averageScore = Math.round(
    entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length,
  );
  const overallBand = getAbilityReportBand(averageScore, config);
  const overallSentence = overallBand
    ? `整體體能表現屬於${overallBand.systemLabel}，${getLeadingSentence(overallBand.parentAdvice)}`
    : "整體體能表現已逐步建立，建議持續透過多元活動累積身體經驗。";

  const strengths = [...entries]
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .filter((entry, index, list) => list.findIndex((candidate) => candidate.abilityLabel === entry.abilityLabel) === index);
  const strengthSentence =
    strengths.length > 0
      ? `${joinLabels(strengths.map((entry) => entry.abilityLabel))}表現較佳，可持續透過日常跑跳、投擲與律動遊戲維持自信與學習動機。`
      : "";

  const lowAbilities = [...entries]
    .filter((entry) => entry.score < config.lowAbilityThreshold)
    .sort((left, right) => left.score - right.score)
    .slice(0, 2);

  const suggestedActivities = lowAbilities
    .flatMap((entry) => {
      const adviceKey = abilityAdviceKeyByLabel[entry.abilityLabel];
      return adviceKey ? lowAbilityAdviceByKey[adviceKey].activities.slice(0, 2) : [];
    })
    .filter((activity, index, list) => list.indexOf(activity) === index)
    .slice(0, 4);

  const lowAbilitySentence =
    lowAbilities.length > 0
      ? suggestedActivities.length > 0
        ? `${joinLabels(lowAbilities.map((entry) => entry.abilityLabel))}較需要持續練習，可多透過${joinLabels(
            suggestedActivities,
          )}等活動累積成功經驗。`
        : `${joinLabels(lowAbilities.map((entry) => entry.abilityLabel))}較需要持續練習，建議安排更多遊戲化身體活動，逐步建立動作經驗與自信。`
      : "六項能力發展大致均衡，建議持續安排多元且有趣的身體活動，幫助孩子穩定累積動作經驗。";

  const sections = [
    `整體觀察\n${overallSentence}`,
    strengthSentence ? `優勢表現\n${strengthSentence}` : "",
    `建議方向\n${lowAbilitySentence}`,
  ].filter(Boolean);

  return sections.join("\n\n");
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
