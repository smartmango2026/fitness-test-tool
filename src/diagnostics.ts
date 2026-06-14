import {
  addDoc,
  collection,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

const DIAGNOSTIC_STORAGE_KEY = "fitness-test-tool:diagnostic-events";
const DIAGNOSTIC_BROWSER_ID_KEY = "fitness-test-tool:diagnostic-browser-id";
const MAX_DIAGNOSTIC_EVENTS = 100;

export type DiagnosticEvent = {
  timestamp: string;
  type: string;
  message: string;
  audience?: "user" | "developer";
  label?: string;
  payload?: Record<string, unknown>;
};

export type DiagnosticEnvironment = {
  pageUrl: string;
  referrer: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
  };
  device: {
    userAgent: string;
    platform: string;
    language: string;
    isTouchDevice: boolean;
    maxTouchPoints: number;
    orientation: string | null;
    estimatedDeviceType: "desktop" | "tablet" | "mobile";
  };
};

export type DiagnosticReportInput = {
  reporterUid: string | null;
  reporterUsername: string | null;
  reporterDisplayName: string | null;
  userMessage: {
    title: string;
    description: string;
    expected: string;
    actual: string;
  };
  authSnapshot: Record<string, unknown>;
  currentFileSnapshot: Record<string, unknown>;
  frontendIssues: string[];
};

function sanitizeDiagnosticValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeDiagnosticValue);
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (/password|token|cookie|secret/i.test(key)) {
        next[key] = "[redacted]";
        continue;
      }
      next[key] = sanitizeDiagnosticValue(nestedValue);
    }
    return next;
  }

  return String(value);
}

function readStoredEvents(): DiagnosticEvent[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (event): event is DiagnosticEvent =>
        Boolean(event) &&
        typeof event === "object" &&
        typeof event.timestamp === "string" &&
        typeof event.type === "string" &&
        typeof event.message === "string",
    );
  } catch {
    return [];
  }
}

function writeStoredEvents(events: DiagnosticEvent[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      DIAGNOSTIC_STORAGE_KEY,
      JSON.stringify(events.slice(0, MAX_DIAGNOSTIC_EVENTS)),
    );
  } catch {
    // Diagnostic logging should never break the app.
  }
}

export function recordDiagnosticEvent(
  type: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  const event: DiagnosticEvent = {
    timestamp: new Date().toISOString(),
    type,
    message,
    payload: payload ? (sanitizeDiagnosticValue(payload) as Record<string, unknown>) : undefined,
  };
  writeStoredEvents([event, ...readStoredEvents()]);
}

export function recordUserAction(
  label: string,
  payload?: Record<string, unknown>,
): void {
  const event: DiagnosticEvent = {
    timestamp: new Date().toISOString(),
    type: "user.action",
    message: label,
    audience: "user",
    label,
    payload: payload ? (sanitizeDiagnosticValue(payload) as Record<string, unknown>) : undefined,
  };
  writeStoredEvents([event, ...readStoredEvents()]);
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
  return readStoredEvents();
}

export function getUserActionEvents(): DiagnosticEvent[] {
  return readStoredEvents().filter(
    (event) => event.audience === "user" || event.type === "user.action",
  );
}

export function getDiagnosticBrowserId(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  try {
    const existingId = window.localStorage.getItem(DIAGNOSTIC_BROWSER_ID_KEY);
    if (existingId) {
      return existingId;
    }

    const nextId = crypto.randomUUID();
    window.localStorage.setItem(DIAGNOSTIC_BROWSER_ID_KEY, nextId);
    return nextId;
  } catch {
    return "unavailable";
  }
}

function estimateDeviceType(width: number, maxTouchPoints: number): "desktop" | "tablet" | "mobile" {
  if (width <= 767) {
    return "mobile";
  }

  if (width <= 1100 && maxTouchPoints > 0) {
    return "tablet";
  }

  return "desktop";
}

export function getDiagnosticEnvironment(): DiagnosticEnvironment {
  if (typeof window === "undefined") {
    return {
      pageUrl: "",
      referrer: "",
      viewport: { width: 0, height: 0, devicePixelRatio: 1 },
      screen: { width: 0, height: 0, availWidth: 0, availHeight: 0 },
      device: {
        userAgent: "",
        platform: "",
        language: "",
        isTouchDevice: false,
        maxTouchPoints: 0,
        orientation: null,
        estimatedDeviceType: "desktop",
      },
    };
  }

  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  return {
    pageUrl: window.location.href,
    referrer: document.referrer,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
    },
    device: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      isTouchDevice: maxTouchPoints > 0,
      maxTouchPoints,
      orientation: window.screen.orientation?.type ?? null,
      estimatedDeviceType: estimateDeviceType(window.innerWidth, maxTouchPoints),
    },
  };
}

export function installDiagnosticErrorListeners(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleError = (event: ErrorEvent) => {
    recordDiagnosticEvent("frontend.error", "前端發生錯誤。", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack : null,
    });
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error
      ? { message: event.reason.message, stack: event.reason.stack }
      : { message: String(event.reason) };
    recordDiagnosticEvent("frontend.unhandled-rejection", "前端非同步流程失敗。", reason);
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}

export async function submitDiagnosticReport(
  db: Firestore,
  input: DiagnosticReportInput,
): Promise<string> {
  const reportRef = await addDoc(collection(db, "diagnosticReports"), {
    ...input,
    browserId: getDiagnosticBrowserId(),
    environment: getDiagnosticEnvironment(),
    userActions: getUserActionEvents(),
    diagnostics: getDiagnosticEvents(),
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  return reportRef.id;
}
