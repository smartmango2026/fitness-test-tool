export type SchoolId = "hess" | "kid-castle" | "smart-sport";

export type SchoolOption = {
  id: SchoolId;
  name: string;
};

export const SMART_SPORT_SCHOOL_ID: SchoolId = "smart-sport";

export const SCHOOL_OPTIONS: SchoolOption[] = [
  { id: "hess", name: "何嘉仁" },
  { id: "kid-castle", name: "吉的堡" },
  { id: SMART_SPORT_SCHOOL_ID, name: "聰明動" },
];

export function isSchoolId(value: unknown): value is SchoolId {
  return (
    value === "hess" ||
    value === "kid-castle" ||
    value === SMART_SPORT_SCHOOL_ID
  );
}

export function normalizeSchoolId(value: unknown): SchoolId | "" {
  return isSchoolId(value) ? value : "";
}

export function getSchoolName(schoolId: SchoolId | "" | null | undefined): string {
  if (!schoolId) {
    return "";
  }

  return SCHOOL_OPTIONS.find((school) => school.id === schoolId)?.name ?? "";
}

export function isSmartSportSchool(
  schoolId: SchoolId | "" | null | undefined,
): boolean {
  return schoolId === SMART_SPORT_SCHOOL_ID;
}
