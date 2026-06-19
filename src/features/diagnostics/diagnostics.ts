import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

const DIAGNOSTIC_STORAGE_KEY = "fitness-test-tool:diagnostic-events";
const DIAGNOSTIC_BROWSER_ID_KEY = "fitness-test-tool:diagnostic-browser-id";
const DIAGNOSTIC_REPORTS_STORAGE_KEY = "fitness-test-tool:diagnostic-report-refs";
const MAX_DIAGNOSTIC_EVENTS = 100;
const MAX_DIAGNOSTIC_REPORT_REFS = 30;
const CLOUDINARY_CLOUD_NAME = "dvqmyafug";
const CLOUDINARY_UPLOAD_PRESET = "fitness_test_tool_diagnostic_unsigned";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

export type DiagnosticReportStatus = "reported" | "received" | "resolved";

export type DiagnosticScreenshotReference = {
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  provider?: "cloudinary";
  publicId?: string;
  width?: number;
  height?: number;
  format?: string;
};

export type BrowserDiagnosticReportReference = {
  reportId: string;
  status: DiagnosticReportStatus;
  statusLabel: string;
  title: string;
  description: string;
  reporterUid: string | null;
  createdAt: string;
  screenshots: DiagnosticScreenshotReference[];
};

export type DiagnosticReportReference = BrowserDiagnosticReportReference & {
  source: "browser" | "account";
  statusUpdatedAt: string;
};

export type DiagnosticReportDetail = {
  reportId: string;
  title: string;
  description: string;
  expected: string;
  actual: string;
  createdAt: string;
  screenshots: DiagnosticScreenshotReference[];
  userActions: DiagnosticEvent[];
  diagnostics: DiagnosticEvent[];
  currentFileSnapshot: Record<string, unknown>;
};

export type DiagnosticEvent = {
  timestamp: string;
  type: string;
  message: string;
  audience?: "user" | "developer";
  label?: string;
  payload?: Record<string, unknown>;
};

function normalizeDiagnosticEvent(value: unknown): DiagnosticEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.timestamp !== "string" ||
    typeof candidate.type !== "string" ||
    typeof candidate.message !== "string"
  ) {
    return null;
  }

  return {
    timestamp: candidate.timestamp,
    type: candidate.type,
    message: candidate.message,
    audience:
      candidate.audience === "user" || candidate.audience === "developer"
        ? candidate.audience
        : undefined,
    label: typeof candidate.label === "string" ? candidate.label : undefined,
    payload:
      candidate.payload && typeof candidate.payload === "object"
        ? (candidate.payload as Record<string, unknown>)
        : undefined,
  };
}

function normalizeDiagnosticEventList(value: unknown): DiagnosticEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeDiagnosticEvent(entry))
    .filter((entry): entry is DiagnosticEvent => Boolean(entry));
}

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
  screenshots?: File[];
  onScreenshotUploadProgress?: (update: DiagnosticScreenshotUploadProgress) => void;
};

export type DiagnosticScreenshotUploadProgress = {
  index: number;
  name: string;
  progressPercent: number;
  state: "queued" | "uploading" | "uploaded" | "failed";
  errorCode?: string;
  errorMessage?: string;
};

type CloudinaryUploadResponse = {
  public_id: string;
  secure_url: string;
  bytes: number;
  format: string;
  width: number;
  height: number;
  resource_type: string;
};

function getDiagnosticStatusLabel(status: DiagnosticReportStatus): string {
  switch (status) {
    case "received":
      return "已收到";
    case "resolved":
      return "已解決";
    case "reported":
    default:
      return "已回報";
  }
}

function isDiagnosticReportStatus(value: unknown): value is DiagnosticReportStatus {
  return value === "reported" || value === "received" || value === "resolved";
}

function timestampLikeToIso(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return "";
}

function normalizeScreenshotReference(
  value: unknown,
): DiagnosticScreenshotReference | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const url = typeof candidate.url === "string" ? candidate.url : "";
  if (!name || !url) {
    return null;
  }

  return {
    name,
    url,
    contentType:
      typeof candidate.contentType === "string"
        ? candidate.contentType
        : "image/png",
    sizeBytes:
      typeof candidate.sizeBytes === "number" && Number.isFinite(candidate.sizeBytes)
        ? candidate.sizeBytes
        : 0,
    provider: candidate.provider === "cloudinary" ? "cloudinary" : undefined,
    publicId:
      typeof candidate.publicId === "string" ? candidate.publicId : undefined,
    width:
      typeof candidate.width === "number" && Number.isFinite(candidate.width)
        ? candidate.width
        : undefined,
    height:
      typeof candidate.height === "number" && Number.isFinite(candidate.height)
        ? candidate.height
        : undefined,
    format:
      typeof candidate.format === "string" ? candidate.format : undefined,
  };
}

function normalizeScreenshotReferences(value: unknown): DiagnosticScreenshotReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeScreenshotReference(entry))
    .filter(
      (entry): entry is DiagnosticScreenshotReference => Boolean(entry),
    )
    .slice(0, 6);
}

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

export function getBrowserDiagnosticReportReferences(): BrowserDiagnosticReportReference[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DIAGNOSTIC_REPORTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((reference) =>
        normalizeDiagnosticReportReference("browser", reference),
      )
      .filter(
        (reference): reference is DiagnosticReportReference => Boolean(reference),
      )
      .map(({ source, statusUpdatedAt, ...reference }) => ({
        ...reference,
        screenshots: reference.screenshots ?? [],
      }));
  } catch {
    return [];
  }
}

function normalizeDiagnosticReportReference(
  source: "browser" | "account",
  data: Partial<BrowserDiagnosticReportReference> & {
    reportId?: unknown;
    status?: unknown;
    statusLabel?: unknown;
    title?: unknown;
    description?: unknown;
    reporterUid?: unknown;
    createdAt?: unknown;
    statusUpdatedAt?: unknown;
  },
): DiagnosticReportReference | null {
  const reportId = typeof data.reportId === "string" ? data.reportId : "";
  if (!reportId) {
    return null;
  }

  const status = isDiagnosticReportStatus(data.status) ? data.status : "reported";
  return {
    reportId,
    status,
    statusLabel:
      typeof data.statusLabel === "string"
        ? data.statusLabel
        : getDiagnosticStatusLabel(status),
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    reporterUid: typeof data.reporterUid === "string" ? data.reporterUid : null,
    createdAt: timestampLikeToIso(data.createdAt),
    statusUpdatedAt: timestampLikeToIso(data.statusUpdatedAt),
    screenshots: normalizeScreenshotReferences(
      (data as { screenshots?: unknown }).screenshots,
    ),
    source,
  };
}

export async function fetchBrowserDiagnosticReportStatuses(
  db: Firestore,
): Promise<DiagnosticReportReference[]> {
  const localReferences = getBrowserDiagnosticReportReferences();
  const results = await Promise.all(
    localReferences.map(async (reference) => {
      const snapshot = await getDoc(doc(db, "diagnosticReportStatuses", reference.reportId));
      if (!snapshot.exists()) {
        return normalizeDiagnosticReportReference("browser", reference);
      }

      return normalizeDiagnosticReportReference("browser", {
        ...reference,
        ...snapshot.data(),
        reportId: reference.reportId,
      });
    }),
  );

  return results.filter((reference): reference is DiagnosticReportReference => Boolean(reference));
}

export async function fetchUserDiagnosticReportReferences(
  db: Firestore,
  uid: string,
): Promise<DiagnosticReportReference[]> {
  const snapshot = await getDocs(collection(db, "users", uid, "diagnosticReports"));
  return snapshot.docs
    .map((documentSnapshot) =>
      normalizeDiagnosticReportReference("account", {
        ...documentSnapshot.data(),
        reportId: documentSnapshot.id,
      }),
    )
    .filter((reference): reference is DiagnosticReportReference => Boolean(reference));
}

export async function fetchVisibleDiagnosticReportReferences(
  db: Firestore,
  uid: string | null,
): Promise<DiagnosticReportReference[]> {
  const [browserReports, accountReports] = await Promise.all([
    fetchBrowserDiagnosticReportStatuses(db),
    uid ? fetchUserDiagnosticReportReferences(db, uid) : Promise.resolve([]),
  ]);
  const merged = new Map<string, DiagnosticReportReference>();

  for (const report of [...accountReports, ...browserReports]) {
    const existing = merged.get(report.reportId);
    merged.set(report.reportId, {
      ...report,
      source:
        existing && existing.source !== report.source
          ? "account"
          : report.source,
      description: report.description || existing?.description || "",
      title: report.title || existing?.title || "",
      createdAt: report.createdAt || existing?.createdAt || "",
      statusUpdatedAt: report.statusUpdatedAt || existing?.statusUpdatedAt || "",
    });
  }

  const reportsWithFreshStatuses = await Promise.all(
    [...merged.values()].map(async (report) => {
      const snapshot = await getDoc(doc(db, "diagnosticReportStatuses", report.reportId));
      if (!snapshot.exists()) {
        return report;
      }

      return normalizeDiagnosticReportReference(report.source, {
        ...report,
        ...snapshot.data(),
        reportId: report.reportId,
      }) ?? report;
    }),
  );

  return reportsWithFreshStatuses.sort((left, right) =>
    (right.createdAt || right.statusUpdatedAt).localeCompare(
      left.createdAt || left.statusUpdatedAt,
    ),
  );
}

export async function fetchDiagnosticReportDetail(
  db: Firestore,
  reportId: string,
): Promise<DiagnosticReportDetail | null> {
  const snapshot = await getDoc(doc(db, "diagnosticReports", reportId));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as Record<string, unknown>;
  const userMessage =
    data.userMessage && typeof data.userMessage === "object"
      ? (data.userMessage as Record<string, unknown>)
      : {};
  const currentFileSnapshot =
    data.currentFileSnapshot && typeof data.currentFileSnapshot === "object"
      ? (data.currentFileSnapshot as Record<string, unknown>)
      : {};

  return {
    reportId,
    title: typeof userMessage.title === "string" ? userMessage.title : "",
    description:
      typeof userMessage.description === "string"
        ? userMessage.description
        : "",
    expected: typeof userMessage.expected === "string" ? userMessage.expected : "",
    actual: typeof userMessage.actual === "string" ? userMessage.actual : "",
    createdAt: timestampLikeToIso(data.createdAt),
    screenshots: normalizeScreenshotReferences(data.screenshots),
    userActions: normalizeDiagnosticEventList(data.userActions),
    diagnostics: normalizeDiagnosticEventList(data.diagnostics),
    currentFileSnapshot,
  };
}

function saveBrowserDiagnosticReportReference(
  reference: BrowserDiagnosticReportReference,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const nextReferences = [
      reference,
      ...getBrowserDiagnosticReportReferences().filter(
        (current) => current.reportId !== reference.reportId,
      ),
    ].slice(0, MAX_DIAGNOSTIC_REPORT_REFS);
    window.localStorage.setItem(
      DIAGNOSTIC_REPORTS_STORAGE_KEY,
      JSON.stringify(nextReferences),
    );
  } catch {
    // Local report references are a convenience only.
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
  const {
    screenshots: screenshotFiles = [],
    onScreenshotUploadProgress,
    ...persistedInput
  } = input;
  const reportRef = doc(collection(db, "diagnosticReports"));
  const status: DiagnosticReportStatus = "reported";
  const statusLabel = getDiagnosticStatusLabel(status);
  const browserId = getDiagnosticBrowserId();
  const nowIso = new Date().toISOString();
  const screenshots = await uploadDiagnosticScreenshots(
    reportRef.id,
    browserId,
    screenshotFiles,
    onScreenshotUploadProgress,
  );
  const reportData = {
    ...persistedInput,
    browserId,
    status,
    statusLabel,
    screenshots,
    environment: getDiagnosticEnvironment(),
    userActions: getUserActionEvents(),
    diagnostics: getDiagnosticEvents(),
    createdAt: serverTimestamp(),
    statusUpdatedAt: serverTimestamp(),
    schemaVersion: 1,
  };
  const batch = writeBatch(db);
  batch.set(reportRef, reportData);
  batch.set(doc(db, "diagnosticReportStatuses", reportRef.id), {
    reportId: reportRef.id,
    browserId,
    reporterUid: input.reporterUid,
    status,
    statusLabel,
    title: input.userMessage.title,
    description: input.userMessage.description,
    screenshots,
    createdAt: serverTimestamp(),
    statusUpdatedAt: serverTimestamp(),
    schemaVersion: 1,
  });

  if (input.reporterUid) {
    batch.set(doc(db, "users", input.reporterUid, "diagnosticReports", reportRef.id), {
      reportId: reportRef.id,
      reporterUid: input.reporterUid,
      status,
      statusLabel,
      title: input.userMessage.title,
      description: input.userMessage.description,
      screenshots,
      createdAt: serverTimestamp(),
      statusUpdatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  }

  await batch.commit();
  saveBrowserDiagnosticReportReference({
    reportId: reportRef.id,
    status,
    statusLabel,
    title: input.userMessage.title,
    description: input.userMessage.description,
    reporterUid: input.reporterUid,
    createdAt: nowIso,
    screenshots,
  });
  return reportRef.id;
}

async function uploadDiagnosticScreenshots(
  reportId: string,
  browserId: string,
  screenshots: File[],
  onProgress?: (update: DiagnosticScreenshotUploadProgress) => void,
): Promise<DiagnosticScreenshotReference[]> {
  if (!screenshots.length) {
    return [];
  }

  screenshots.slice(0, 3).forEach((file, index) => {
    onProgress?.({
      index,
      name: file.name,
      progressPercent: 0,
      state: "queued",
    });
  });

  const uploads = screenshots.slice(0, 3).map(async (file, index) => {
    const result = await uploadScreenshotToCloudinary(
      file,
      index,
      reportId,
      browserId,
      onProgress,
    );

    onProgress?.({
      index,
      name: file.name,
      progressPercent: 100,
      state: "uploaded",
    });

    return {
      name: file.name,
      url: result.secure_url,
      contentType: file.type || `image/${result.format || "jpeg"}`,
      sizeBytes: result.bytes || file.size,
      provider: "cloudinary" as const,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    };
  });

  return Promise.all(uploads);
}

async function uploadScreenshotToCloudinary(
  file: File,
  index: number,
  reportId: string,
  browserId: string,
  onProgress?: (update: DiagnosticScreenshotUploadProgress) => void,
): Promise<CloudinaryUploadResponse> {
  return await new Promise<CloudinaryUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timeoutId = window.setTimeout(() => {
      xhr.abort();
      const message = `上傳截圖「${file.name}」逾時，請確認網路連線後再試一次。`;
      onProgress?.({
        index,
        name: file.name,
        progressPercent: 0,
        state: "failed",
        errorCode: "cloudinary-upload-timeout",
        errorMessage: message,
      });
      reject(new Error(message));
    }, 45_000);

    xhr.upload.onprogress = (event) => {
      const progressPercent = event.lengthComputable
        ? Math.min(100, Math.round((event.loaded / event.total) * 100))
        : 0;
      onProgress?.({
        index,
        name: file.name,
        progressPercent,
        state: "uploading",
      });
    };

    xhr.onload = () => {
      window.clearTimeout(timeoutId);
      const payload = parseCloudinaryUploadResponse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && payload.ok) {
        resolve(payload.value);
        return;
      }

      const message = !payload.ok
        ? payload.errorMessage
        : `Cloudinary upload failed with HTTP ${xhr.status}.`;
      onProgress?.({
        index,
        name: file.name,
        progressPercent: 0,
        state: "failed",
        errorCode: `cloudinary-${xhr.status || "unknown"}`,
        errorMessage: message,
      });
      reject(new Error(message));
    };

    xhr.onerror = () => {
      window.clearTimeout(timeoutId);
      const message = `Cloudinary upload network error for「${file.name}」。`;
      onProgress?.({
        index,
        name: file.name,
        progressPercent: 0,
        state: "failed",
        errorCode: "cloudinary-network-error",
        errorMessage: message,
      });
      reject(new Error(message));
    };

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    form.append("folder", "diagnostic-reports");
    form.append("context", `report_id=${reportId}|browser_id=${browserId}`);

    xhr.open("POST", CLOUDINARY_UPLOAD_URL);
    xhr.send(form);
  });
}

function parseCloudinaryUploadResponse(
  responseText: string,
): { ok: true; value: CloudinaryUploadResponse } | { ok: false; errorMessage: string } {
  try {
    const payload = JSON.parse(responseText) as Partial<CloudinaryUploadResponse> & {
      error?: { message?: string };
    };
    if (
      typeof payload.public_id === "string" &&
      typeof payload.secure_url === "string"
    ) {
      return {
        ok: true,
        value: {
          public_id: payload.public_id,
          secure_url: payload.secure_url,
          bytes: typeof payload.bytes === "number" ? payload.bytes : 0,
          format: typeof payload.format === "string" ? payload.format : "",
          width: typeof payload.width === "number" ? payload.width : 0,
          height: typeof payload.height === "number" ? payload.height : 0,
          resource_type:
            typeof payload.resource_type === "string" ? payload.resource_type : "image",
        },
      };
    }

    return {
      ok: false,
      errorMessage: payload.error?.message || "Cloudinary upload response was incomplete.",
    };
  } catch {
    return {
      ok: false,
      errorMessage: "Cloudinary upload response was not valid JSON.",
    };
  }
}
