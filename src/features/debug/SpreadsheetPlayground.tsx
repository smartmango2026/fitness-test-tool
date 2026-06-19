import React, { useState, useEffect, useRef } from "react";

type RowData = {
  id: string;
  seq: number;
  name: string;
  scores: string[];
};

export default function SpreadsheetPlayground() {
  // 1. 初始化資料：20 筆學生，每筆有 13 個測驗欄位（預設值為隨機數值 20~30 方便測試）
  const [data, setData] = useState<RowData[]>(() => {
    const rows: RowData[] = [];
    for (let i = 1; i <= 20; i += 1) {
      const scores: string[] = [];
      for (let j = 1; j <= 13; j += 1) {
        scores.push(String(20 + (i + j) % 11)); // 模擬體能測驗分數
      }
      rows.push({
        id: `student-${i}`,
        seq: i,
        name: `學生 ${i}`,
        scores,
      });
    }
    return rows;
  });

  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 2. 當切換編輯儲存格時，將焦點移至 input，並防止瀏覽器自動滾動
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [editingCell]);

  // 3. 儲存數值邏輯
  const saveValue = (rowIndex: number, colIndex: number, val: string) => {
    setData((currentData) =>
      currentData.map((row, rIdx) => {
        if (rIdx === rowIndex) {
          if (colIndex === 1) {
            return { ...row, name: val };
          } else if (colIndex >= 2 && colIndex <= 14) {
            const nextScores = [...row.scores];
            nextScores[colIndex - 2] = val;
            return { ...row, scores: nextScores };
          }
        }
        return row;
      })
    );
  };

  // 4. 點擊儲存格進入編輯，並確保該儲存格不會被左邊凍結欄遮擋
  const handleCellClick = (
    rowIndex: number,
    colIndex: number,
    currentVal: string,
    event: React.MouseEvent<HTMLTableCellElement>
  ) => {
    setEditingCell({ rowIndex, colIndex });
    setEditValue(currentVal);

    const cellElement = event.currentTarget;
    if (cellElement && viewportRef.current) {
      const viewport = viewportRef.current;
      const stickyWidth = 140; // 序號 40px + 姓名 100px = 140px
      const cellLeft = cellElement.offsetLeft;
      const cellWidth = cellElement.offsetWidth;
      const scrollLeft = viewport.scrollLeft;
      const viewportWidth = viewport.clientWidth;

      // 如果儲存格左側邊緣扣除捲動後，小於凍結寬度，代表被遮住了，需要水平滾動過來
      if (cellLeft - scrollLeft < stickyWidth) {
        viewport.scrollLeft = cellLeft - stickyWidth;
      }
      // 如果儲存格右側超出可見視區，也滾動到能看見的位置
      else if (cellLeft + cellWidth - scrollLeft > viewportWidth) {
        viewport.scrollLeft = cellLeft + cellWidth - viewportWidth;
      }
    }
  };

  // 5. 輸入框的按鍵導覽與 Tab 鍵處理
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    if (event.key === "Tab") {
      event.preventDefault(); // 攔截預設 Tab focus
      saveValue(rowIndex, colIndex, editValue);

      // 計算下一格：可編輯格為姓名 (colIndex=1) 與 分數 (colIndex=2~14)
      let nextRow = rowIndex;
      let nextCol = colIndex + 1;

      if (nextCol > 14) {
        nextCol = 1; // 換行回姓名
        nextRow = rowIndex + 1;
      }

      if (nextRow < data.length) {
        setEditingCell({ rowIndex: nextRow, colIndex: nextCol });
        const nextRowData = data[nextRow];
        const nextVal = nextCol === 1 ? nextRowData.name : nextRowData.scores[nextCol - 2];
        setEditValue(nextVal);

        // 延遲取得下一個儲存格元素以控制滾動，避免被凍結欄遮擋
        setTimeout(() => {
          const nextCellId = `cell-${nextRow}-${nextCol}`;
          const nextCell = document.getElementById(nextCellId);
          if (nextCell && viewportRef.current) {
            const viewport = viewportRef.current;
            const stickyWidth = 140;
            const cellLeft = (nextCell as HTMLElement).offsetLeft;
            const cellWidth = (nextCell as HTMLElement).offsetWidth;
            const scrollLeft = viewport.scrollLeft;
            const viewportWidth = viewport.clientWidth;

            if (cellLeft - scrollLeft < stickyWidth) {
              viewport.scrollLeft = cellLeft - stickyWidth;
            } else if (cellLeft + cellWidth - scrollLeft > viewportWidth) {
              viewport.scrollLeft = cellLeft + cellWidth - viewportWidth;
            }
          }
        }, 0);
      } else {
        setEditingCell(null); // 已是最後一格，結束編輯
      }
    } else if (event.key === "Enter") {
      saveValue(rowIndex, colIndex, editValue);
      setEditingCell(null);
    } else if (event.key === "Escape") {
      setEditingCell(null);
    }
  };

  // 6. 測試按鈕功能
  const scrollToRight = () => {
    if (viewportRef.current) {
      const viewport = viewportRef.current;
      viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
    }
  };

  const enterEditFarCell = () => {
    const rowIndex = 9; // 模擬第 10 列
    const colIndex = 14; // 模擬最後一個測驗指標（測驗 13）

    // 滾動到定位
    const cellId = `cell-${rowIndex}-${colIndex}`;
    const cellElement = document.getElementById(cellId);
    if (cellElement && viewportRef.current) {
      const viewport = viewportRef.current;
      const cellLeft = (cellElement as HTMLElement).offsetLeft;
      const cellWidth = (cellElement as HTMLElement).offsetWidth;
      viewport.scrollLeft = cellLeft + cellWidth - viewport.clientWidth;
    }

    setEditingCell({ rowIndex, colIndex });
    setEditValue(data[rowIndex].scores[colIndex - 2]);
  };

  return (
    <section className="panel">
      {/* 元件專屬樣式，確保不影響外部架構 */}
      <style>{`
        .pg-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        .pg-toolbar {
          display: flex;
          gap: 12px;
          align-items: center;
          background: #f8fafc;
          padding: 12px;
          border-radius: 8px;
          border: 1px dashed #cbd5e1;
        }
        .pg-viewport {
          width: 100%;
          height: 480px;
          overflow: auto;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
        }
        .pg-table {
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          width: 100%;
          font-family: sans-serif;
        }
        .pg-table th, .pg-table td {
          font-size: 16px;
          box-sizing: border-box;
          height: 40px;
          text-align: center;
          vertical-align: middle;
          border-right: 1px solid #cbd5e1;
          border-bottom: 1px solid #cbd5e1;
          padding: 4px;
        }
        /* Sticky 表頭 */
        .pg-table th {
          position: sticky;
          top: 0;
          background: #f1f5f9;
          font-weight: 600;
          z-index: 10;
          color: #334155;
        }
        /* Sticky 凍結欄 (序號與姓名) */
        .pg-sticky-seq {
          position: sticky;
          left: 0;
          width: 40px;
          background: #f8fafc !important;
          z-index: 5;
        }
        .pg-sticky-name {
          position: sticky;
          left: 40px;
          width: 100px;
          background: #f8fafc !important;
          z-index: 5;
          text-align: left !important;
          padding-left: 8px !important;
        }
        /* 當 th 為 sticky 欄位時，z-index 需要更高以覆蓋 td 的 sticky */
        th.pg-sticky-seq {
          z-index: 20;
          background: #e2e8f0 !important;
        }
        th.pg-sticky-name {
          z-index: 20;
          background: #e2e8f0 !important;
        }
        /* 輸入框樣式 */
        .pg-input {
          width: 100%;
          height: 32px;
          border: 2px solid #3b82f6;
          border-radius: 4px;
          outline: none;
          padding: 0 4px;
          box-sizing: border-box;
          font-size: 16px;
          text-align: center;
        }
        .pg-cell-interactive {
          cursor: pointer;
          transition: background 0.15s;
        }
        .pg-cell-interactive:hover {
          background: #eff6ff;
        }
        .pg-cell-editing {
          padding: 0 !important;
          background: #eff6ff;
        }
        .pg-hint-list {
          margin: 8px 0 0 0;
          padding-left: 20px;
          font-size: 14px;
          color: #64748b;
          line-height: 1.6;
        }
      `}</style>

      <div className="panel-header">
        <div>
          <h2>試算表元件 Playground</h2>
          <p>此頁面用來驗證體適能測驗表格的核心行為：凍結欄位、固定寬度與字型、Focus 防跳動與 Tab 鍵連鎖編輯。</p>
        </div>
      </div>

      <div className="pg-container">
        {/* 測試按鈕操作區 */}
        <div className="pg-toolbar">
          <strong>測試操作：</strong>
          <button className="secondary-button" onClick={scrollToRight} type="button">
            1. 捲動到最右側
          </button>
          <button className="primary-button" onClick={enterEditFarCell} type="button">
            2. 進入最右側格子編輯
          </button>
          <span style={{ fontSize: "14px", color: "64748b" }}>
            （點擊任意格子後按 <strong>Tab</strong> 鍵可向右切換並自動編輯）
          </span>
        </div>

        {/* 表格捲動視區 */}
        <div className="pg-viewport" ref={viewportRef}>
          <table className="pg-table">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "100px" }} />
              {/* 13 個測驗欄位，固定寬度 80px */}
              {Array.from({ length: 13 }).map((_, i) => (
                <col key={i} style={{ width: "80px" }} />
              ))}
            </colgroup>

            <thead>
              <tr>
                <th className="pg-sticky-seq">#</th>
                <th className="pg-sticky-name">學生姓名</th>
                {Array.from({ length: 13 }).map((_, i) => (
                  <th key={i}>{`測驗 ${i + 1}`}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {data.map((row, rIdx) => (
                <tr key={row.id}>
                  {/* 凍結欄 1：序號 */}
                  <td className="pg-sticky-seq" style={{ fontWeight: 500, color: "#64748b" }}>
                    {row.seq}
                  </td>

                  {/* 凍結欄 2：學生姓名 */}
                  <td
                    className={`pg-sticky-name pg-cell-interactive ${
                      editingCell?.rowIndex === rIdx && editingCell?.colIndex === 1
                        ? "pg-cell-editing"
                        : ""
                    }`}
                    id={`cell-${rIdx}-1`}
                    onClick={(e) => handleCellClick(rIdx, 1, row.name, e)}
                  >
                    {editingCell?.rowIndex === rIdx && editingCell?.colIndex === 1 ? (
                      <input
                        className="pg-input"
                        onBlur={() => {
                          saveValue(rIdx, 1, editValue);
                          setEditingCell(null);
                        }}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, rIdx, 1)}
                        ref={inputRef}
                        value={editValue}
                      />
                    ) : (
                      row.name
                    )}
                  </td>

                  {/* 13 個測驗項目分數格子 */}
                  {row.scores.map((score, sIdx) => {
                    const colIdx = sIdx + 2;
                    const isEditing = editingCell?.rowIndex === rIdx && editingCell?.colIndex === colIdx;
                    return (
                      <td
                        className={`pg-cell-interactive ${isEditing ? "pg-cell-editing" : ""}`}
                        id={`cell-${rIdx}-${colIdx}`}
                        key={sIdx}
                        onClick={(e) => handleCellClick(rIdx, colIdx, score, e)}
                      >
                        {isEditing ? (
                          <input
                            className="pg-input"
                            onBlur={() => {
                              saveValue(rIdx, colIdx, editValue);
                              setEditingCell(null);
                            }}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, rIdx, colIdx)}
                            ref={inputRef}
                            type="number"
                            value={editValue}
                          />
                        ) : (
                          score
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 驗收項目檢核提示 */}
        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px" }}>
          <h4 style={{ margin: "0 0 8px 0", color: "#334155" }}>互動驗收要點說明</h4>
          <ul className="pg-hint-list">
            <li>
              <strong>防跳動 Focus</strong>：當您水平捲動到右側，點擊遠端欄位或按「進入最右側格子編輯」，輸入框會正常獲取焦點，且頁面與滾動軸**完全不會跳回左側**，也不會產生任何滾動偏置。
            </li>
            <li>
              <strong>左側凍結遮擋防護</strong>：在格子進行編輯或按 Tab 連續移動時，若下一個單元格有一半或全部被固定在左側的「序號與姓名」遮擋，程式碼會主動偵測並微調水平滾動，使其始終露出在姓名欄右側。
            </li>
            <li>
              <strong>鍵盤快速編輯</strong>：編輯中按下 <strong>Enter</strong> 會存檔並退出編輯；按下 <strong>Tab</strong> 會向右移動一格並直接啟用編輯；按下 <strong>Escape</strong> 會退出並不儲存。
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
