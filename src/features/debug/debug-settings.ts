export type DebugSettings = {
  sheetVisibleRows: number;
  sheetScrollRightPadding: number;
  summaryFrozenColumnWidth: number;
  showSheetDebug: boolean;
  showFileOpenTrace: boolean;
};

const DEBUG_SETTINGS_KEY = "fitness-test-tool.debug-settings.v1";

export const defaultDebugSettings: DebugSettings = {
  sheetVisibleRows: 8,
  sheetScrollRightPadding: 0,
  summaryFrozenColumnWidth: 124,
  showSheetDebug: false,
  showFileOpenTrace: false,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(nextValue)));
}

export function normalizeDebugSettings(value: unknown): DebugSettings {
  const candidate = typeof value === "object" && value !== null
    ? (value as Partial<DebugSettings>)
    : {};

  return {
    sheetVisibleRows: clampNumber(
      candidate.sheetVisibleRows,
      defaultDebugSettings.sheetVisibleRows,
      4,
      16,
    ),
    sheetScrollRightPadding: clampNumber(
      candidate.sheetScrollRightPadding,
      defaultDebugSettings.sheetScrollRightPadding,
      -240,
      240,
    ),
    summaryFrozenColumnWidth: clampNumber(
      candidate.summaryFrozenColumnWidth,
      defaultDebugSettings.summaryFrozenColumnWidth,
      80,
      220,
    ),
    showSheetDebug: Boolean(candidate.showSheetDebug),
    showFileOpenTrace: Boolean(candidate.showFileOpenTrace),
  };
}

export function loadDebugSettings(): DebugSettings {
  const raw = window.localStorage.getItem(DEBUG_SETTINGS_KEY);
  if (!raw) {
    return defaultDebugSettings;
  }

  try {
    return normalizeDebugSettings(JSON.parse(raw));
  } catch {
    return defaultDebugSettings;
  }
}

export function saveDebugSettings(settings: DebugSettings): void {
  window.localStorage.setItem(DEBUG_SETTINGS_KEY, JSON.stringify(settings));
}

export function resetDebugSettings(): void {
  window.localStorage.removeItem(DEBUG_SETTINGS_KEY);
}
