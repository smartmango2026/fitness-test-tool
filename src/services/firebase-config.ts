export type FitnessRuntime = "production" | "e2e";

export type FitnessFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

declare global {
  interface Window {
    __FITNESS_TEST_RUNTIME__?: FitnessRuntime;
  }
}

const productionFirebaseConfig: FitnessFirebaseConfig = {
  apiKey: "AIzaSyB092-jPGNKofKu51vQaayZC1qXwCmC_8g",
  authDomain: "fitness-test-tool-42789.firebaseapp.com",
  projectId: "fitness-test-tool-42789",
  storageBucket: "fitness-test-tool-42789.firebasestorage.app",
  messagingSenderId: "953175047502",
  appId: "1:953175047502:web:1912d2f9ce23cbf83bf21f",
};

const e2eFirebaseConfig: FitnessFirebaseConfig = {
  // Use optional chaining so this module can be safely imported in Node.js
  // (e.g. by Playwright test files), where import.meta.env is undefined.
  apiKey: import.meta.env?.VITE_E2E_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env?.VITE_E2E_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env?.VITE_E2E_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env?.VITE_E2E_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env?.VITE_E2E_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env?.VITE_E2E_FIREBASE_APP_ID ?? "",
};

const e2ePlaceholderFirebaseConfig: FitnessFirebaseConfig = {
  apiKey: "e2e-test-firebase-not-configured",
  authDomain: "e2e-test-firebase-not-configured.firebaseapp.com",
  projectId: "e2e-test-firebase-not-configured",
  storageBucket: "e2e-test-firebase-not-configured.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:e2e-not-configured",
};

export function getFitnessRuntime(): FitnessRuntime {
  if (typeof window !== "undefined") {
    if (window.__FITNESS_TEST_RUNTIME__ === "e2e") {
      return "e2e";
    }

    if (window.location.pathname.includes("/e2e/")) {
      return "e2e";
    }
  }

  return "production";
}

export function isFirebaseConfigComplete(config: FitnessFirebaseConfig): boolean {
  return Object.values(config).every((value) => value.trim().length > 0);
}

export function resolveFirebaseConfig(runtime = getFitnessRuntime()): FitnessFirebaseConfig {
  if (runtime !== "e2e") {
    return productionFirebaseConfig;
  }

  return isFirebaseConfigComplete(e2eFirebaseConfig)
    ? e2eFirebaseConfig
    : e2ePlaceholderFirebaseConfig;
}

export function getFirebaseRuntimeInfo(runtime = getFitnessRuntime()): {
  isConfigured: boolean;
  projectId: string;
  runtime: FitnessRuntime;
} {
  const config = runtime === "e2e" ? e2eFirebaseConfig : productionFirebaseConfig;

  return {
    isConfigured: isFirebaseConfigComplete(config),
    projectId: config.projectId || e2ePlaceholderFirebaseConfig.projectId,
    runtime,
  };
}
