import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import {
  defaultAbilityRulesConfig,
  normalizeAbilityRulesConfig,
  type AbilityRulesConfig,
} from "./ability-settings";

const ABILITY_SETTINGS_DOC_ID = "abilityRules";

function cloneConfig(config: AbilityRulesConfig): AbilityRulesConfig {
  return JSON.parse(JSON.stringify(config)) as AbilityRulesConfig;
}

function getAbilitySettingsRef(uid: string) {
  return doc(db, "users", uid, "settings", ABILITY_SETTINGS_DOC_ID);
}

export async function ensureAbilityRulesConfig(uid: string): Promise<AbilityRulesConfig> {
  const settingsRef = getAbilitySettingsRef(uid);
  const snapshot = await getDoc(settingsRef);

  if (!snapshot.exists()) {
    const defaults = cloneConfig(defaultAbilityRulesConfig);
    await setDoc(settingsRef, {
      ...defaults,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return defaults;
  }

  return normalizeAbilityRulesConfig(snapshot.data());
}

export function subscribeToAbilityRulesConfig(
  uid: string,
  callback: (config: AbilityRulesConfig) => void,
  onError?: (error: unknown) => void,
): () => void {
  const settingsRef = getAbilitySettingsRef(uid);

  return onSnapshot(
    settingsRef,
    async (snapshot) => {
      try {
        if (!snapshot.exists()) {
          const defaults = await ensureAbilityRulesConfig(uid);
          callback(defaults);
          return;
        }

        callback(normalizeAbilityRulesConfig(snapshot.data()));
      } catch (error) {
        onError?.(error);
      }
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function saveAbilityRulesConfigToCloud(
  uid: string,
  config: AbilityRulesConfig,
): Promise<void> {
  const nextConfig = normalizeAbilityRulesConfig(config);
  await setDoc(
    getAbilitySettingsRef(uid),
    {
      ...nextConfig,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function resetAbilityRulesConfigInCloud(uid: string): Promise<AbilityRulesConfig> {
  const defaults = cloneConfig(defaultAbilityRulesConfig);
  await setDoc(
    getAbilitySettingsRef(uid),
    {
      ...defaults,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return defaults;
}
