import { useMemo, useState } from "react";

const schoolSuggestions = [
  "何嘉仁",
  "吉的堡",
  "聰明動",
  "臺北市私立星星幼兒園",
  "新北市小太陽幼兒園",
  "桃園快樂森林幼兒園",
  "台中彩虹幼兒園",
  "高雄海豚幼兒園",
  "Taiwan Bilingual Kindergarten",
  "Taichung Little Tree Preschool",
];

function getMatchedSchools(query: string): string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return schoolSuggestions.slice(0, 6);
  }

  return schoolSuggestions
    .filter((school) => school.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, 6);
}

function ResultPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="school-combobox-preview">
      <span>{label}</span>
      <strong>{value || "尚未輸入"}</strong>
    </div>
  );
}

function SuggestionButtons({
  query,
  onPick,
}: {
  query: string;
  onPick: (schoolName: string) => void;
}) {
  const matches = useMemo(() => getMatchedSchools(query), [query]);
  const trimmedQuery = query.trim();
  const shouldShowCustom =
    trimmedQuery.length > 0 && !matches.some((school) => school === trimmedQuery);

  return (
    <div className="school-combobox-menu">
      {matches.map((school) => (
        <button
          key={school}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(school)}
          type="button"
        >
          {school}
        </button>
      ))}
      {matches.length === 0 ? (
        <p className="school-combobox-empty">找不到相符的建議，可以直接使用輸入內容。</p>
      ) : null}
      {shouldShowCustom ? (
        <button
          className="school-combobox-custom"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(trimmedQuery)}
          type="button"
        >
          使用「{trimmedQuery}」
        </button>
      ) : null}
    </div>
  );
}

export default function SchoolComboboxLab() {
  const [nativeValue, setNativeValue] = useState("");
  const [dropdownValue, setDropdownValue] = useState("");
  const [chipValue, setChipValue] = useState("");
  const [cardValue, setCardValue] = useState("");
  const [activeDropdown, setActiveDropdown] = useState<"dropdown" | "chip" | null>(null);

  const cardMatches = useMemo(() => getMatchedSchools(cardValue), [cardValue]);

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>學校欄位測試</h2>
            <p>
              這個頁面用來比較「可輸入、可選建議」的學校欄位。所有內容都只存在這個
              lab，不會寫入雲端。
            </p>
          </div>
        </div>

        <div className="tab-lab-grid school-combobox-grid">
          <article className="tab-lab-card school-combobox-card">
            <div className="tab-lab-card-head">
              <h3>方案 A：原生 datalist</h3>
              <p>最輕量，瀏覽器內建下拉建議，但樣式與手機體驗較難控制。</p>
            </div>
            <label className="school-combobox-field">
              學校名稱
              <input
                list="school-lab-native-list"
                onChange={(event) => setNativeValue(event.target.value)}
                placeholder="輸入 Ta、星星、何嘉仁..."
                value={nativeValue}
              />
            </label>
            <datalist id="school-lab-native-list">
              {schoolSuggestions.map((school) => (
                <option key={school} value={school} />
              ))}
            </datalist>
            <ResultPreview label="目前內容" value={nativeValue} />
          </article>

          <article className="tab-lab-card school-combobox-card">
            <div className="tab-lab-card-head">
              <h3>方案 B：客製建議清單</h3>
              <p>最接近正式功能，可以控制提示、空結果與「使用自訂名稱」。</p>
            </div>
            <label className="school-combobox-field school-combobox-field--floating">
              學校名稱
              <input
                onBlur={() => setActiveDropdown(null)}
                onChange={(event) => {
                  setDropdownValue(event.target.value);
                  setActiveDropdown("dropdown");
                }}
                onFocus={() => setActiveDropdown("dropdown")}
                placeholder="輸入部分名稱後選擇"
                value={dropdownValue}
              />
              {activeDropdown === "dropdown" ? (
                <SuggestionButtons query={dropdownValue} onPick={setDropdownValue} />
              ) : null}
            </label>
            <ResultPreview label="目前內容" value={dropdownValue} />
          </article>

          <article className="tab-lab-card school-combobox-card">
            <div className="tab-lab-card-head">
              <h3>方案 C：選取後變成標籤</h3>
              <p>適合讓使用者清楚知道目前已選哪間學校，也容易加上「已驗證」狀態。</p>
            </div>
            <label className="school-combobox-field school-combobox-field--floating">
              學校名稱
              <input
                onBlur={() => setActiveDropdown(null)}
                onChange={(event) => {
                  setChipValue(event.target.value);
                  setActiveDropdown("chip");
                }}
                onFocus={() => setActiveDropdown("chip")}
                placeholder="搜尋或輸入學校"
                value={chipValue}
              />
              {activeDropdown === "chip" ? (
                <SuggestionButtons query={chipValue} onPick={setChipValue} />
              ) : null}
            </label>
            <div className="school-combobox-chip-row">
              {chipValue.trim() ? (
                <span className="school-combobox-chip">{chipValue.trim()}</span>
              ) : (
                <span className="school-combobox-chip school-combobox-chip--muted">
                  尚未選擇
                </span>
              )}
              <button onClick={() => setChipValue("")} type="button">
                清除
              </button>
            </div>
          </article>

          <article className="tab-lab-card school-combobox-card school-combobox-card--wide">
            <div className="tab-lab-card-head">
              <h3>方案 D：手機友善卡片式</h3>
              <p>下拉選單改成大按鈕卡片，手機比較好點，但佔用高度較多。</p>
            </div>
            <label className="school-combobox-field">
              學校名稱
              <input
                onChange={(event) => setCardValue(event.target.value)}
                placeholder="輸入後篩選下方卡片"
                value={cardValue}
              />
            </label>
            <div className="school-combobox-card-list">
              {cardMatches.map((school) => (
                <button
                  className={cardValue === school ? "is-selected" : ""}
                  key={school}
                  onClick={() => setCardValue(school)}
                  type="button"
                >
                  <strong>{school}</strong>
                  <span>
                    {schoolSuggestions.indexOf(school) < 3
                      ? "已知建議學校"
                      : "可作為自訂學校名稱"}
                  </span>
                </button>
              ))}
            </div>
            <ResultPreview label="目前內容" value={cardValue} />
          </article>
        </div>
      </section>

      <section className="panel side-panel">
        <h2>觀察重點</h2>
        <ul className="plain-list">
          <li>是否能讓老師直覺知道「可以選，也可以自己打」。</li>
          <li>手機上是否容易點選，不會因下拉太小而難操作。</li>
          <li>未來是否能標示已驗證學校、學校 Logo、或同名學校提醒。</li>
          <li>若使用者輸入未知學校，資料應先存成文字快照，不要阻擋建立檔案。</li>
        </ul>
      </section>
    </>
  );
}
