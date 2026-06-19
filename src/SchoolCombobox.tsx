import { useMemo, useState } from "react";
import { getSchoolName, SCHOOL_OPTIONS } from "./schools";
import type { SchoolId } from "./schools";

export type SchoolComboboxValue = {
  schoolId: SchoolId | "";
  schoolName: string;
};

type SchoolSuggestion = {
  id: SchoolId | "";
  name: string;
  detail?: string;
};

type SchoolComboboxProps = {
  disabled?: boolean;
  label: string;
  placeholder?: string;
  value: SchoolComboboxValue;
  variant?: "dropdown" | "chip";
  extraSuggestions?: string[];
  onChange: (value: SchoolComboboxValue) => void;
};

function buildSuggestions(extraSuggestions: string[] = []): SchoolSuggestion[] {
  const knownSuggestions = SCHOOL_OPTIONS.map((school) => ({
    id: school.id,
    name: school.name,
    detail: "已知建議學校",
  }));
  const knownNames = new Set(knownSuggestions.map((school) => school.name));
  const customSuggestions = extraSuggestions
    .filter((schoolName) => schoolName.trim() && !knownNames.has(schoolName.trim()))
    .map((schoolName) => ({
      id: "" as const,
      name: schoolName.trim(),
      detail: "可作為自訂學校名稱",
    }));

  return [...knownSuggestions, ...customSuggestions];
}

function resolveExactSchool(value: string): SchoolComboboxValue {
  const trimmedValue = value.trim();
  const matchedKnownSchool = SCHOOL_OPTIONS.find((school) => school.name === trimmedValue);

  if (matchedKnownSchool) {
    return {
      schoolId: matchedKnownSchool.id,
      schoolName: matchedKnownSchool.name,
    };
  }

  return {
    schoolId: "",
    schoolName: value,
  };
}

export function getSchoolComboboxValue(
  schoolId: SchoolId | "" | null | undefined,
  schoolName: string | null | undefined,
): SchoolComboboxValue {
  const normalizedSchoolId = schoolId ?? "";
  const knownName = getSchoolName(normalizedSchoolId);

  return {
    schoolId: normalizedSchoolId,
    schoolName: schoolName?.trim() || knownName,
  };
}

export default function SchoolCombobox({
  disabled = false,
  label,
  placeholder = "輸入學校名稱，或選擇建議",
  value,
  variant = "dropdown",
  extraSuggestions = [],
  onChange,
}: SchoolComboboxProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const suggestions = useMemo(() => buildSuggestions(extraSuggestions), [extraSuggestions]);
  const normalizedQuery = value.schoolName.trim().toLocaleLowerCase();
  const matches = useMemo(() => {
    if (!normalizedQuery) {
      return suggestions.slice(0, 6);
    }

    return suggestions
      .filter((school) => school.name.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 6);
  }, [normalizedQuery, suggestions]);
  const shouldShowCustom =
    normalizedQuery.length > 0 &&
    !matches.some((school) => school.name === value.schoolName.trim());

  function pickSchool(nextValue: SchoolComboboxValue): void {
    onChange(nextValue);
    setIsMenuOpen(false);
  }

  return (
    <div className={`school-combobox school-combobox--${variant}`}>
      <label className="school-combobox-field school-combobox-field--floating">
        <strong>{label}</strong>
        <input
          disabled={disabled}
          onBlur={() => setIsMenuOpen(false)}
          onChange={(event) => {
            onChange(resolveExactSchool(event.target.value));
            setIsMenuOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setIsMenuOpen(true);
            }
          }}
          placeholder={placeholder}
          type="text"
          value={value.schoolName}
        />
        {isMenuOpen && !disabled ? (
          <div className="school-combobox-menu">
            {matches.map((school) => (
              <button
                key={`${school.id || "custom"}-${school.name}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  pickSchool({
                    schoolId: school.id,
                    schoolName: school.name,
                  })
                }
                type="button"
              >
                <span>{school.name}</span>
                {school.detail ? <small>{school.detail}</small> : null}
              </button>
            ))}
            {matches.length === 0 ? (
              <p className="school-combobox-empty">
                找不到相符的建議，可以直接使用輸入內容。
              </p>
            ) : null}
            {shouldShowCustom ? (
              <button
                className="school-combobox-custom"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  pickSchool({
                    schoolId: "",
                    schoolName: value.schoolName.trim(),
                  })
                }
                type="button"
              >
                <span>使用「{value.schoolName.trim()}」</span>
                <small>自訂學校名稱</small>
              </button>
            ) : null}
          </div>
        ) : null}
      </label>
      {variant === "chip" ? (
        <div className="school-combobox-chip-row">
          {value.schoolName.trim() ? (
            <span className="school-combobox-chip">{value.schoolName.trim()}</span>
          ) : (
            <span className="school-combobox-chip school-combobox-chip--muted">
              尚未設定
            </span>
          )}
          {!disabled && value.schoolName.trim() ? (
            <button
              onClick={() =>
                onChange({
                  schoolId: "",
                  schoolName: "",
                })
              }
              type="button"
            >
              清除
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
