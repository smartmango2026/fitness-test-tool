import { useMemo, useState } from "react";
import { useEffect } from "react";
import {
  loadDebugSettings,
  resetDebugSettings,
  saveDebugSettings,
  type DebugSettings,
} from "./debug-settings";
import {
  ensureAbilityRulesConfig,
  resetAbilityRulesConfigInCloud,
  saveAbilityRulesConfigToCloud,
  subscribeToAbilityRulesConfig,
} from "../../domain/ability-cloud";
import {
  defaultAbilityRulesConfig,
  type AbilityGradeProfile,
  type AbilityRulesConfig,
} from "../../domain/ability-settings";
import type {
  AbilityMetricKey,
  NumericAbilityBand,
  RubricAbilityBand,
  SchoolGradeLabel,
} from "../../domain/ability-rules";
import { schoolGradeOptions } from "../../domain/ability-rules";
import { subscribeToAuthState } from "../auth/firebase-auth";
import type { User } from "firebase/auth";

const metricKeys: AbilityMetricKey[] = ["item1", "item2", "item3", "item4", "item5", "item6"];

function cloneConfig(config: AbilityRulesConfig): AbilityRulesConfig {
  return JSON.parse(JSON.stringify(config)) as AbilityRulesConfig;
}

function toInputValue(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }

  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : undefined;
}

function createProfileCopy(profile: AbilityGradeProfile): AbilityGradeProfile {
  return {
    id: crypto.randomUUID(),
    label: `${profile.label} 副本`,
    appliesTo: [...profile.appliesTo],
    rules: JSON.parse(JSON.stringify(profile.rules)) as AbilityGradeProfile["rules"],
  };
}

export default function DebugPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [draft, setDraft] = useState<AbilityRulesConfig>(defaultAbilityRulesConfig);
  const [message, setMessage] = useState("登入後會從 Firebase 載入這份能力值對應表設定。");
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    defaultAbilityRulesConfig.gradeProfiles[0]?.id ?? "",
  );
  const [selectedMetricKey, setSelectedMetricKey] = useState<AbilityMetricKey>("item1");
  const [isLoading, setIsLoading] = useState(true);
  const [localDebugSettings, setLocalDebugSettings] = useState<DebugSettings>(() =>
    loadDebugSettings(),
  );

  const selectedProfile = useMemo(
    () =>
      draft.gradeProfiles.find((profile) => profile.id === selectedProfileId) ??
      draft.gradeProfiles[0] ??
      null,
    [draft.gradeProfiles, selectedProfileId],
  );

  const selectedRule = selectedProfile?.rules[selectedMetricKey] ?? null;

  useEffect(() => subscribeToAuthState(setCurrentUser), []);

  useEffect(() => {
    setLocalDebugSettings(loadDebugSettings());
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setDraft(cloneConfig(defaultAbilityRulesConfig));
      setSelectedProfileId(defaultAbilityRulesConfig.gradeProfiles[0]?.id ?? "");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToAbilityRulesConfig(currentUser.uid, (config) => {
      setDraft(config);
      setSelectedProfileId((current) => current || config.gradeProfiles[0]?.id || "");
      setIsLoading(false);
      setMessage("目前顯示的是 Firebase 雲端設定。");
    });

    ensureAbilityRulesConfig(currentUser.uid).catch((error) => {
      setMessage(error instanceof Error ? error.message : "無法初始化雲端能力值設定。");
      setIsLoading(false);
    });

    return unsubscribe;
  }, [currentUser]);

  function withSelectedProfile(mutator: (profile: AbilityGradeProfile) => void): void {
    setDraft((current) => {
      const next = cloneConfig(current);
      const profile = next.gradeProfiles.find((item) => item.id === (selectedProfile?.id ?? ""));
      if (!profile) {
        return current;
      }
      mutator(profile);
      return next;
    });
  }

  function updateLowScoreThreshold(rawValue: string): void {
    setDraft((current) => {
      const next = cloneConfig(current);
      const nextValue = Number(rawValue);
      if (Number.isFinite(nextValue)) {
        next.lowAbilityThreshold = nextValue;
      }
      return next;
    });
  }

  function updateProfileLabel(rawValue: string): void {
    withSelectedProfile((profile) => {
      profile.label = rawValue;
    });
  }

  function toggleProfileGrade(grade: SchoolGradeLabel): void {
    setDraft((current) => {
      const next = cloneConfig(current);
      const profile = next.gradeProfiles.find((item) => item.id === (selectedProfile?.id ?? ""));
      if (!profile) {
        return current;
      }

      if (profile.appliesTo.includes(grade)) {
        if (profile.appliesTo.length <= 1) {
          return current;
        }
        profile.appliesTo = profile.appliesTo.filter((item) => item !== grade);
        return next;
      }

      next.gradeProfiles.forEach((item) => {
        item.appliesTo = item.appliesTo.filter((assignedGrade) => assignedGrade !== grade);
      });
      profile.appliesTo = [...profile.appliesTo, grade];
      return next;
    });
  }

  function duplicateProfile(): void {
    setDraft((current) => {
      const next = cloneConfig(current);
      const source =
        next.gradeProfiles.find((profile) => profile.id === (selectedProfile?.id ?? "")) ??
        next.gradeProfiles[0];
      if (!source) {
        return current;
      }

      const newProfile = createProfileCopy(source);
      next.gradeProfiles.push(newProfile);
      setSelectedProfileId(newProfile.id);
      return next;
    });
    setMessage("已新增一份新的設定檔，你可以直接改名稱與區間。");
  }

  function removeProfile(): void {
    if (!selectedProfile) {
      return;
    }

    if (draft.gradeProfiles.length <= 1) {
      setMessage("至少要保留一份設定檔。");
      return;
    }

    setDraft((current) => {
      const next = cloneConfig(current);
      const nextProfiles = next.gradeProfiles.filter((profile) => profile.id !== selectedProfile.id);
      next.gradeProfiles = nextProfiles;
      setSelectedProfileId(nextProfiles[0]?.id ?? "");
      return next;
    });
    setMessage("設定檔已移除。");
  }

  function updateMetricLabel(rawValue: string): void {
    withSelectedProfile((profile) => {
      profile.rules[selectedMetricKey].metricLabel = rawValue;
    });
  }

  function updateAbilityLabel(rawValue: string): void {
    withSelectedProfile((profile) => {
      profile.rules[selectedMetricKey].abilityLabel = rawValue;
    });
  }

  function updateNumericBand(
    bandIndex: number,
    field: keyof NumericAbilityBand,
    rawValue: string,
  ): void {
    withSelectedProfile((profile) => {
      const rule = profile.rules[selectedMetricKey];
      if (rule.kind !== "numeric") {
        return;
      }

      if (field === "score") {
        const nextScore = Number(rawValue);
        if (Number.isFinite(nextScore)) {
          rule.bands[bandIndex].score = nextScore as NumericAbilityBand["score"];
        }
        return;
      }

      rule.bands[bandIndex][field] = parseOptionalNumber(rawValue);
    });
  }

  function addNumericBand(): void {
    withSelectedProfile((profile) => {
      const rule = profile.rules[selectedMetricKey];
      if (rule.kind !== "numeric") {
        return;
      }

      rule.bands.push({ min: undefined, max: undefined, score: 10 });
    });
  }

  function removeNumericBand(bandIndex: number): void {
    withSelectedProfile((profile) => {
      const rule = profile.rules[selectedMetricKey];
      if (rule.kind !== "numeric" || rule.bands.length <= 1) {
        return;
      }

      rule.bands.splice(bandIndex, 1);
    });
  }

  function updateRubricBand(
    bandIndex: number,
    field: keyof RubricAbilityBand,
    rawValue: string,
  ): void {
    withSelectedProfile((profile) => {
      const rule = profile.rules[selectedMetricKey];
      if (rule.kind !== "rubric") {
        return;
      }

      if (field === "score") {
        const nextScore = Number(rawValue);
        if (Number.isFinite(nextScore)) {
          rule.bands[bandIndex].score = nextScore as RubricAbilityBand["score"];
        }
        return;
      }

      if (field === "label") {
        rule.bands[bandIndex].label = rawValue;
      }
    });
  }

  function addRubricBand(): void {
    withSelectedProfile((profile) => {
      const rule = profile.rules[selectedMetricKey];
      if (rule.kind !== "rubric") {
        return;
      }

      rule.bands.push({
        key: `custom_${crypto.randomUUID().slice(0, 8)}` as RubricAbilityBand["key"],
        label: "新等級",
        score: 20,
      });
    });
  }

  function removeRubricBand(bandIndex: number): void {
    withSelectedProfile((profile) => {
      const rule = profile.rules[selectedMetricKey];
      if (rule.kind !== "rubric" || rule.bands.length <= 1) {
        return;
      }

      rule.bands.splice(bandIndex, 1);
    });
  }

  function saveDraft(): void {
    if (!currentUser) {
      setMessage("請先登入，才能儲存雲端設定。");
      return;
    }

    void saveAbilityRulesConfigToCloud(currentUser.uid, draft)
      .then(() => {
        setMessage("能力值對應表已儲存到 Firebase。");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "儲存能力值對應表失敗。");
      });
  }

  function restoreDefaults(): void {
    if (!currentUser) {
      setMessage("請先登入，才能重設雲端設定。");
      return;
    }

    void resetAbilityRulesConfigInCloud(currentUser.uid)
      .then((nextDefaults) => {
        setDraft(nextDefaults);
        setSelectedProfileId(nextDefaults.gradeProfiles[0]?.id ?? "");
        setSelectedMetricKey("item1");
        setMessage("已恢復 Firebase 上的預設能力值對應表。");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "重設能力值對應表失敗。");
      });
  }

  function updateLocalDebugSetting<K extends keyof DebugSettings>(
    key: K,
    value: DebugSettings[K],
  ) {
    setLocalDebugSettings((current) => {
      const next = {
        ...current,
        [key]: value,
      };
      saveDebugSettings(next);
      return next;
    });
    setMessage("本機除錯顯示設定已更新。");
  }

  function resetLocalDebugSettings() {
    resetDebugSettings();
    setLocalDebugSettings(loadDebugSettings());
    setMessage("本機除錯顯示設定已恢復預設。");
  }

  return (
    <div className="debug-shell">
      <header className="debug-hero">
        <div>
          <p className="eyebrow">Debug</p>
          <h1>能力值對應表維護</h1>
          <p className="hero-copy">
            這個頁面目前只保留能力值對應表維護，可新增設定檔、切換項目並調整區間。
          </p>
        </div>
        <a className="secondary-button debug-link" href="../">
          回主頁
        </a>
      </header>

      <main className="debug-stack">
        {!currentUser ? (
          <section className="panel">
            <h2>需要登入</h2>
            <p className="debug-message">
              這個頁面現在會直接讀寫 Firebase 雲端設定。請先登入老師帳號後再進行維護。
            </p>
          </section>
        ) : null}

        {currentUser ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>整體設定</h2>
              <p>低於門檻時可視為需要帶出能力建議文字。</p>
            </div>
          </div>

          <div className="form-grid debug-form-grid">
            <label>
              低分提醒門檻
              <input
                max="100"
                min="0"
                onChange={(event) => updateLowScoreThreshold(event.target.value)}
                type="number"
                value={draft.lowAbilityThreshold}
              />
            </label>
            <label>
              本機除錯顯示
              <div className="file-share-current-list">
                <label className="file-share-current-item">
                  <span>顯示表格除錯資訊</span>
                  <input
                    checked={localDebugSettings.showSheetDebug}
                    onChange={(event) =>
                      updateLocalDebugSetting("showSheetDebug", event.target.checked)
                    }
                    type="checkbox"
                  />
                </label>
                <label className="file-share-current-item">
                  <span>顯示切換檔案除錯資訊</span>
                  <input
                    checked={localDebugSettings.showFileOpenTrace}
                    onChange={(event) =>
                      updateLocalDebugSetting("showFileOpenTrace", event.target.checked)
                    }
                    type="checkbox"
                  />
                </label>
              </div>
            </label>
          </div>

          <div className="button-row">
            <button className="primary-button" onClick={saveDraft} type="button">
              儲存設定
            </button>
            <button className="secondary-button" onClick={restoreDefaults} type="button">
              恢復預設
            </button>
            <button
              className="secondary-button"
              onClick={resetLocalDebugSettings}
              type="button"
            >
              重設本機除錯設定
            </button>
          </div>

          <p className="debug-message">{message}</p>
        </section>
        ) : null}

        {currentUser ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>設定檔與項目</h2>
              <p>先選設定檔，再選其中一個測驗項目維護。</p>
            </div>
          </div>

          <div className="debug-selector-grid">
            <label>
              設定檔
              <select
                onChange={(event) => setSelectedProfileId(event.target.value)}
                value={selectedProfile?.id ?? ""}
              >
                {draft.gradeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              項目
              <select
                onChange={(event) => setSelectedMetricKey(event.target.value as AbilityMetricKey)}
                value={selectedMetricKey}
              >
                {metricKeys.map((metricKey) => {
                  const label = selectedProfile?.rules[metricKey]?.metricLabel ?? metricKey;
                  return (
                    <option key={metricKey} value={metricKey}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

            <div className="button-row">
              <button className="secondary-button" onClick={duplicateProfile} type="button">
                新增設定檔
              </button>
            <button className="secondary-button" onClick={removeProfile} type="button">
              刪除目前設定檔
            </button>
            </div>
          </section>
        ) : null}

        {currentUser && !isLoading && selectedProfile && selectedRule ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>目前編輯內容</h2>
                <p>這裡可以改設定檔名稱、項目名稱、能力向度名稱，以及項目中的分數區間。</p>
              </div>
            </div>

            <div className="debug-selector-grid">
              <label>
                設定檔名稱
                <input onChange={(event) => updateProfileLabel(event.target.value)} type="text" value={selectedProfile.label} />
              </label>

              <label>
                適用年級
                <div className="file-share-current-list">
                  {schoolGradeOptions.map((grade) => (
                    <label className="file-share-current-item" key={grade}>
                      <span>{grade}</span>
                      <input
                        checked={selectedProfile.appliesTo.includes(grade)}
                        onChange={() => toggleProfileGrade(grade)}
                        type="checkbox"
                      />
                    </label>
                  ))}
                </div>
              </label>

              <label>
                項目名稱
                <input onChange={(event) => updateMetricLabel(event.target.value)} type="text" value={selectedRule.metricLabel} />
              </label>

              <label>
                能力向度名稱
                <input onChange={(event) => updateAbilityLabel(event.target.value)} type="text" value={selectedRule.abilityLabel} />
              </label>
            </div>

            {selectedRule.kind === "numeric" ? (
              <>
                <table className="ability-band-table">
                  <thead>
                    <tr>
                      <th>最低值</th>
                      <th>最高值</th>
                      <th>能力值</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRule.bands.map((band, bandIndex) => (
                      <tr key={`${selectedMetricKey}-${bandIndex}`}>
                        <td>
                          <input
                            onChange={(event) => updateNumericBand(bandIndex, "min", event.target.value)}
                            type="number"
                            value={toInputValue(band.min)}
                          />
                        </td>
                        <td>
                          <input
                            onChange={(event) => updateNumericBand(bandIndex, "max", event.target.value)}
                            type="number"
                            value={toInputValue(band.max)}
                          />
                        </td>
                        <td>
                          <input
                            onChange={(event) => updateNumericBand(bandIndex, "score", event.target.value)}
                            step="10"
                            type="number"
                            value={String(band.score)}
                          />
                        </td>
                        <td>
                          <button
                            className="ghost-button"
                            onClick={() => removeNumericBand(bandIndex)}
                            type="button"
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="button-row">
                  <button className="secondary-button" onClick={addNumericBand} type="button">
                    新增區間
                  </button>
                  <button className="primary-button" onClick={saveDraft} type="button">
                    儲存這份設定
                  </button>
                </div>
              </>
            ) : (
              <>
                <table className="ability-band-table">
                  <thead>
                    <tr>
                      <th>等級名稱</th>
                      <th>能力值</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRule.bands.map((band, bandIndex) => (
                      <tr key={`${selectedMetricKey}-${bandIndex}`}>
                        <td>
                          <input
                            onChange={(event) => updateRubricBand(bandIndex, "label", event.target.value)}
                            type="text"
                            value={band.label}
                          />
                        </td>
                        <td>
                          <input
                            onChange={(event) => updateRubricBand(bandIndex, "score", event.target.value)}
                            step="10"
                            type="number"
                            value={String(band.score)}
                          />
                        </td>
                        <td>
                          <button
                            className="ghost-button"
                            onClick={() => removeRubricBand(bandIndex)}
                            type="button"
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="button-row">
                  <button className="secondary-button" onClick={addRubricBand} type="button">
                    新增等級
                  </button>
                  <button className="primary-button" onClick={saveDraft} type="button">
                    儲存這份設定
                  </button>
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
