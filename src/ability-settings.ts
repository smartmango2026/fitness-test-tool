import {
  LOW_ABILITY_THRESHOLD,
  abilityReportBands,
  abilityRulesByGradeGroup,
  gradeGroupLabels,
  lowAbilityAdviceByKey,
  type AbilityMetricKey,
  type AbilityReportBand,
  type AbilityRule,
  type GradeGroupKey,
} from "./ability-rules";

export type AbilityGradeProfile = {
  id: string;
  label: string;
  rules: Record<AbilityMetricKey, AbilityRule>;
};

export type AbilityRulesConfig = {
  lowAbilityThreshold: number;
  reportBands: AbilityReportBand[];
  gradeProfiles: AbilityGradeProfile[];
};

const ABILITY_RULES_KEY = "fitness-test-tool.ability-rules.v2";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDefaultProfiles(): AbilityGradeProfile[] {
  return (Object.keys(abilityRulesByGradeGroup) as GradeGroupKey[]).map((gradeKey) => ({
    id: gradeKey,
    label: gradeGroupLabels[gradeKey],
    rules: deepClone(abilityRulesByGradeGroup[gradeKey]),
  }));
}

export const defaultAbilityRulesConfig: AbilityRulesConfig = {
  lowAbilityThreshold: LOW_ABILITY_THRESHOLD,
  reportBands: deepClone(abilityReportBands),
  gradeProfiles: createDefaultProfiles(),
};

function normalizeReportBand(band: AbilityReportBand): AbilityReportBand {
  return {
    min: Number(band.min),
    max: Number(band.max),
    systemLabel: String(band.systemLabel),
    parentAdvice: String(band.parentAdvice),
  };
}

function isAbilityMetricKey(value: string): value is AbilityMetricKey {
  return ["item1", "item2", "item3", "item4", "item5", "item6"].includes(value);
}

function normalizeAbilityRule(value: unknown, fallback: AbilityRule): AbilityRule {
  if (!value || typeof value !== "object") {
    return deepClone(fallback);
  }

  const candidate = value as AbilityRule;
  if (candidate.kind !== "numeric" && candidate.kind !== "rubric") {
    return deepClone(fallback);
  }

  return deepClone(candidate);
}

function normalizeGradeProfile(value: unknown, fallback: AbilityGradeProfile): AbilityGradeProfile {
  if (!value || typeof value !== "object") {
    return deepClone(fallback);
  }

  const candidate = value as Partial<AbilityGradeProfile>;
  const nextProfile = deepClone(fallback);

  if (typeof candidate.id === "string" && candidate.id.trim()) {
    nextProfile.id = candidate.id;
  }

  if (typeof candidate.label === "string" && candidate.label.trim()) {
    nextProfile.label = candidate.label;
  }

  if (candidate.rules && typeof candidate.rules === "object") {
    Object.entries(candidate.rules).forEach(([metricKey, rule]) => {
      if (!isAbilityMetricKey(metricKey)) {
        return;
      }

      nextProfile.rules[metricKey] = normalizeAbilityRule(rule, fallback.rules[metricKey]);
    });
  }

  return nextProfile;
}

export function normalizeAbilityRulesConfig(value: unknown): AbilityRulesConfig {
  const base = deepClone(defaultAbilityRulesConfig);

  if (!value || typeof value !== "object") {
    return base;
  }

  const candidate = value as Partial<AbilityRulesConfig> & {
    gradeRules?: Partial<Record<GradeGroupKey, Record<AbilityMetricKey, AbilityRule>>>;
  };

  if (typeof candidate.lowAbilityThreshold === "number" && Number.isFinite(candidate.lowAbilityThreshold)) {
    base.lowAbilityThreshold = Math.max(0, Math.min(100, Math.round(candidate.lowAbilityThreshold)));
  }

  if (Array.isArray(candidate.reportBands)) {
    base.reportBands = candidate.reportBands.map((band) =>
      normalizeReportBand(band as AbilityReportBand),
    );
  }

  if (Array.isArray(candidate.gradeProfiles) && candidate.gradeProfiles.length > 0) {
    base.gradeProfiles = candidate.gradeProfiles.map((profile, index) => {
      const fallback =
        defaultAbilityRulesConfig.gradeProfiles[index] ?? defaultAbilityRulesConfig.gradeProfiles[0];
      return normalizeGradeProfile(profile, fallback);
    });
    return base;
  }

  if (candidate.gradeRules && typeof candidate.gradeRules === "object") {
    base.gradeProfiles = (Object.keys(candidate.gradeRules) as GradeGroupKey[]).map((gradeKey) =>
      normalizeGradeProfile(
        {
          id: gradeKey,
          label: gradeGroupLabels[gradeKey] ?? gradeKey,
          rules: candidate.gradeRules?.[gradeKey],
        },
        {
          id: gradeKey,
          label: gradeGroupLabels[gradeKey] ?? gradeKey,
          rules: abilityRulesByGradeGroup[gradeKey],
        },
      ),
    );
  }

  return base;
}

export function loadAbilityRulesConfig(): AbilityRulesConfig {
  const raw = window.localStorage.getItem(ABILITY_RULES_KEY);
  if (!raw) {
    return deepClone(defaultAbilityRulesConfig);
  }

  try {
    return normalizeAbilityRulesConfig(JSON.parse(raw));
  } catch {
    return deepClone(defaultAbilityRulesConfig);
  }
}

export function saveAbilityRulesConfig(config: AbilityRulesConfig): void {
  window.localStorage.setItem(ABILITY_RULES_KEY, JSON.stringify(config));
}

export function resetAbilityRulesConfig(): void {
  window.localStorage.removeItem(ABILITY_RULES_KEY);
}

export { lowAbilityAdviceByKey };

