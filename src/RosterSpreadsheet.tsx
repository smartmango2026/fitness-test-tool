import { useEffect, useRef } from "react";
import type { ClipboardEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import type { RosterEntry } from "./types";

type RosterActiveCell = {
  rowIndex: number;
  columnIndex: number;
} | null;

interface RosterSpreadsheetProps {
  rosterDraft: RosterEntry[];
  isMixedAgeClass: boolean;
  studentGradeOptions: string[];
  rosterActiveCell: RosterActiveCell;
  setRosterActiveCell: (cell: RosterActiveCell) => void;
  updateRosterDraftCell: (
    rowIndex: number,
    columnIndex: number,
    value: string,
  ) => void;
  handleRosterKeyDown: (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    columnIndex: number,
  ) => void;
  handleRosterPaste: (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
  ) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLTableElement | null>;
  viewportMaxHeight: number | string;
  debugInfo?: ReactNode;
}

function getDisplayValue(value: string): string {
  return value.trim() ? value : "—";
}

export default function RosterSpreadsheet({
  rosterDraft,
  isMixedAgeClass,
  studentGradeOptions,
  rosterActiveCell,
  setRosterActiveCell,
  updateRosterDraftCell,
  handleRosterKeyDown,
  handleRosterPaste,
  viewportRef,
  tableRef,
  viewportMaxHeight,
  debugInfo,
}: RosterSpreadsheetProps) {
  const activeInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!rosterActiveCell) {
      return;
    }

    const viewport = viewportRef.current;
    const cell = document.querySelector<HTMLElement>(
      `[data-roster-cell="${rosterActiveCell.rowIndex}:${rosterActiveCell.columnIndex}"]`,
    );
    const input = activeInputRef.current;

    if (viewport && cell) {
      const stickyWidth = 130;
      const cellLeft = cell.offsetLeft;
      const cellWidth = cell.offsetWidth;
      const scrollLeft = viewport.scrollLeft;
      const viewportWidth = viewport.clientWidth;

      if (cellLeft - scrollLeft < stickyWidth) {
        viewport.scrollLeft = Math.max(0, cellLeft - stickyWidth);
      } else if (cellLeft + cellWidth - scrollLeft > viewportWidth) {
        viewport.scrollLeft = cellLeft + cellWidth - viewportWidth;
      }
    }

    if (input) {
      input.focus({ preventScroll: true });
      if (input instanceof HTMLInputElement) {
        setTimeout(() => {
          input.select();
          try {
            input.setSelectionRange(0, input.value.length);
          } catch {}
        }, 50);
      }
    }
  }, [rosterActiveCell, viewportRef]);

  return (
    <div className="sheet-shell">
      {debugInfo}
      <div
        className="fixed-sheet-viewport roster-viewport table-wrap"
        data-testid="roster-sheet"
        ref={viewportRef}
        style={{ maxHeight: viewportMaxHeight }}
      >
        <table className="fixed-sheet-table" ref={tableRef}>
          <colgroup>
            <col style={{ width: "40px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "80px" }} />
            {isMixedAgeClass ? <col style={{ width: "100px" }} /> : null}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky-left-0">#</th>
              <th className="sticky-left-40">姓名</th>
              <th>身高</th>
              <th>體重</th>
              {isMixedAgeClass ? <th>年級</th> : null}
            </tr>
          </thead>
          <tbody>
            {rosterDraft.map((entry, index) => (
              <tr key={entry.id}>
                <td
                  className="sticky-left-0"
                  style={{ color: "#64748b", fontWeight: 500 }}
                >
                  {index + 1}
                </td>
                <td className="sticky-left-40" data-roster-cell={`${index}:0`}>
                  {rosterActiveCell?.rowIndex === index &&
                  rosterActiveCell?.columnIndex === 0 ? (
                    <input
                      autoFocus
                      className="sheet-input"
                      onBlur={() => setRosterActiveCell(null)}
                      onChange={(event) =>
                        updateRosterDraftCell(index, 0, event.target.value)
                      }
                      onKeyDown={(event) => handleRosterKeyDown(event, index, 0)}
                      onPaste={(event) => handleRosterPaste(event, index, 0)}
                      ref={(element) => {
                        activeInputRef.current = element;
                      }}
                      value={entry.studentName}
                    />
                  ) : (
                    <button
                      className="sheet-cell"
                      onClick={() =>
                        setRosterActiveCell({ rowIndex: index, columnIndex: 0 })
                      }
                      type="button"
                    >
                      {getDisplayValue(entry.studentName)}
                    </button>
                  )}
                </td>
                <td data-roster-cell={`${index}:1`}>
                  {rosterActiveCell?.rowIndex === index &&
                  rosterActiveCell?.columnIndex === 1 ? (
                    <input
                      autoFocus
                      className="sheet-input"
                      onBlur={() => setRosterActiveCell(null)}
                      onChange={(event) =>
                        updateRosterDraftCell(index, 1, event.target.value)
                      }
                      onKeyDown={(event) => handleRosterKeyDown(event, index, 1)}
                      onPaste={(event) => handleRosterPaste(event, index, 1)}
                      ref={(element) => {
                        activeInputRef.current = element;
                      }}
                      value={entry.height}
                    />
                  ) : (
                    <button
                      className="sheet-cell"
                      onClick={() =>
                        setRosterActiveCell({ rowIndex: index, columnIndex: 1 })
                      }
                      type="button"
                    >
                      {getDisplayValue(entry.height)}
                    </button>
                  )}
                </td>
                <td data-roster-cell={`${index}:2`}>
                  {rosterActiveCell?.rowIndex === index &&
                  rosterActiveCell?.columnIndex === 2 ? (
                    <input
                      autoFocus
                      className="sheet-input"
                      onBlur={() => setRosterActiveCell(null)}
                      onChange={(event) =>
                        updateRosterDraftCell(index, 2, event.target.value)
                      }
                      onKeyDown={(event) => handleRosterKeyDown(event, index, 2)}
                      onPaste={(event) => handleRosterPaste(event, index, 2)}
                      ref={(element) => {
                        activeInputRef.current = element;
                      }}
                      value={entry.weight}
                    />
                  ) : (
                    <button
                      className="sheet-cell"
                      onClick={() =>
                        setRosterActiveCell({ rowIndex: index, columnIndex: 2 })
                      }
                      type="button"
                    >
                      {getDisplayValue(entry.weight)}
                    </button>
                  )}
                </td>
                {isMixedAgeClass ? (
                  <td data-roster-cell={`${index}:3`}>
                    {rosterActiveCell?.rowIndex === index &&
                    rosterActiveCell?.columnIndex === 3 ? (
                      <select
                        autoFocus
                        className="sheet-input"
                        onBlur={() => setRosterActiveCell(null)}
                        onChange={(event) =>
                          updateRosterDraftCell(index, 3, event.target.value)
                        }
                        onKeyDown={(event) => handleRosterKeyDown(event, index, 3)}
                        ref={(element) => {
                          activeInputRef.current = element;
                        }}
                        value={entry.studentGradeLabel}
                      >
                        {studentGradeOptions.map((grade) => (
                          <option key={`${entry.id}-${grade}`} value={grade}>
                            {grade}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        className="sheet-cell"
                        onClick={() =>
                          setRosterActiveCell({ rowIndex: index, columnIndex: 3 })
                        }
                        type="button"
                      >
                        {entry.studentGradeLabel}
                      </button>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
