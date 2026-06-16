import React, { useMemo, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useFiles } from "../../context/FileContext";
import { useFitnessData, makeEmptyRosterEntry, makeEmptyRecord } from "../../context/FitnessDataContext";
import { useFriends } from "../../context/FriendContext";
import { useIndexSpreadsheetGrid, parseClipboardGrid, applyGridPaste } from "../../hooks/useSpreadsheetGrid";
import { FriendRequestRecord } from "../../friendships";
import type { StudentGradeLabel, AppData, RosterEntry } from "../../types";
import type { DebugSettings } from "../../debug-settings";

interface RosterTabProps {
  setMessage: (msg: string) => void;
  debugSettings: DebugSettings;
  handleTabChange: (tab: string) => void;
}

const STUDENT_GRADE_OPTIONS: StudentGradeLabel[] = ["幼幼班", "小班", "中班", "大班"];

function isStudentGradeLabel(value: string): value is StudentGradeLabel {
  return value === "幼幼班" || value === "小班" || value === "中班" || value === "大班";
}

function resolveStudentGradeLabel(
  fileGradeLabel: string,
  studentGradeLabel: string,
): StudentGradeLabel {
  if (isStudentGradeLabel(studentGradeLabel)) {
    return studentGradeLabel;
  }
  if (isStudentGradeLabel(fileGradeLabel)) {
    return fileGradeLabel;
  }
  return "中班";
}

function isMixedAgeClass(gradeLabel: string): boolean {
  return gradeLabel === "混齡班";
}

function formatActivityDate(dateString: string | null): string {
  if (!dateString) {
    return "剛剛";
  }
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return "剛剛";
  }
  return parsed.toLocaleString("zh-TW");
}

function getIncomingRequestDisplayName(request: FriendRequestRecord) {
  return request.fromDisplayName?.trim() || request.fromUsername;
}

function normalizeRosterEntriesForFile(
  entries: RosterEntry[],
  fileGradeLabel: string,
): RosterEntry[] {
  return entries.map((entry) => ({
    ...entry,
    studentName: entry.studentName.trim(),
    height: entry.height.trim(),
    weight: entry.weight.trim(),
    studentGradeLabel: resolveStudentGradeLabel(
      fileGradeLabel,
      entry.studentGradeLabel,
    ),
  }));
}

function comparableRosterEntriesForDirtyCheck(
  entries: RosterEntry[],
  fileGradeLabel: string,
): Array<Omit<RosterEntry, "id">> {
  const comparableEntries = normalizeRosterEntriesForFile(entries, fileGradeLabel).map(
    ({ studentName, height, weight, studentGradeLabel }) => ({
      studentName,
      height,
      weight,
      studentGradeLabel,
    }),
  );

  while (comparableEntries.length > 0) {
    const lastEntry = comparableEntries[comparableEntries.length - 1];
    if (!lastEntry || lastEntry.studentName || lastEntry.height || lastEntry.weight) {
      break;
    }
    comparableEntries.pop();
  }

  return comparableEntries;
}

function inferStudentGradeFromText(
  value: string | undefined,
  fallback: StudentGradeLabel,
): StudentGradeLabel {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  return isStudentGradeLabel(trimmed) ? trimmed : fallback;
}

export default function RosterTab({ setMessage, debugSettings, handleTabChange }: RosterTabProps) {
  const { currentUser } = useAuth();
  const { incomingFriendRequests, acceptRequest, rejectRequest } = useFriends();

  const {
    currentCloudFileId,
    currentCloudFileOwnerUid,
    currentWorkspaceFileLabel,
    handleSaveCurrentCloudFile,
  } = useFiles();

  const {
    data,
    setData,
    rosterDraft,
    setRosterDraft,
    rosterActiveCell,
    setRosterActiveCell,
    rosterSizeInput,
    setRosterSizeInput,
    rosterViewportWidth,
    setRosterViewportWidth,
    rosterNaturalWidth,
    setRosterNaturalWidth,
    setSelectedId,
    setDraftRecord,
  } = useFitnessData();

  const rosterViewportRef = useRef<HTMLDivElement | null>(null);
  const rosterTableRef = useRef<HTMLTableElement | null>(null);
  const previousRosterScaleRef = useRef(1);

  const rosterScale = useMemo(() => {
    if (!rosterViewportWidth) {
      return 1;
    }
    return Math.max(0.6, Math.min(1, rosterViewportWidth / rosterNaturalWidth));
  }, [rosterViewportWidth, rosterNaturalWidth]);

  // Viewport resize observer
  useEffect(() => {
    const nextViewport = rosterViewportRef.current;
    const nextTable = rosterTableRef.current;
    if (!nextViewport || !nextTable) {
      return;
    }

    const measureRosterWidth = () => {
      setRosterViewportWidth(nextViewport.clientWidth);
      setRosterNaturalWidth(nextTable.offsetWidth);
    };

    const resizeObserver = new ResizeObserver(() => {
      measureRosterWidth();
    });
    resizeObserver.observe(nextViewport);
    resizeObserver.observe(nextTable);
    measureRosterWidth();

    return () => {
      resizeObserver.disconnect();
    };
  }, [rosterDraft, data.gradeLabel]);

  // Keep track of scale changes to maintain position
  useEffect(() => {
    const viewport = rosterViewportRef.current;
    if (!viewport) {
      return;
    }

    const previousScale = previousRosterScaleRef.current;
    const nextScale = rosterScale;
    previousRosterScaleRef.current = nextScale;

    const previousScrollableWidth = viewport.scrollWidth;
    const maxScrollLeft = Math.max(0, previousScrollableWidth - viewport.clientWidth);
    const scrollRatio = maxScrollLeft > 0 ? viewport.scrollLeft / maxScrollLeft : 0;

    requestAnimationFrame(() => {
      const nextMaxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollLeft = nextMaxScrollLeft * scrollRatio;
    });
  }, [rosterScale]);

  const normalizedRosterDraft = useMemo(
    () => normalizeRosterEntriesForFile(rosterDraft, data.gradeLabel),
    [data.gradeLabel, rosterDraft],
  );

  const { handleKeyDown, handlePaste } = useIndexSpreadsheetGrid({
    rowCount: rosterDraft.length,
    columnCount: isMixedAgeClass(data.gradeLabel) ? 4 : 3,
    setActiveCell: setRosterActiveCell,
  });

  const updateRosterDraftCell = (
    rowIndex: number,
    columnIndex: number,
    value: string,
  ): void => {
    const rosterFields: Array<keyof Omit<RosterEntry, "id">> = [
      "studentName",
      "height",
      "weight",
      "studentGradeLabel",
    ];
    const targetField = rosterFields[columnIndex];
    if (!targetField) {
      return;
    }

    setRosterDraft((current) =>
      current.map((entry, index) =>
        index === rowIndex ? { ...entry, [targetField]: value } : entry,
      ),
    );
  };

  const applyRosterPaste = (
    startRowIndex: number,
    startColumnIndex: number,
    clipboardText: string,
  ): void => {
    const rosterRows = rosterDraft.map((entry) => [
      entry.studentName,
      entry.height,
      entry.weight,
      entry.studentGradeLabel,
    ]);
    const nextRows = applyGridPaste(
      rosterRows,
      startRowIndex,
      startColumnIndex,
      clipboardText,
    );

    setRosterDraft((current) =>
      current.map((entry, rowIndex) => ({
        ...entry,
        studentName: nextRows[rowIndex]?.[0] ?? entry.studentName,
        height: nextRows[rowIndex]?.[1] ?? entry.height,
        weight: nextRows[rowIndex]?.[2] ?? entry.weight,
        studentGradeLabel:
          inferStudentGradeFromText(nextRows[rowIndex]?.[3], entry.studentGradeLabel),
      })),
    );
  };

  const buildDataWithRosterDraft = (): AppData => {
    const normalizedRosterEntries = normalizedRosterDraft.filter(
      (entry) => entry.studentName,
    );

    const existingMap = new Map(
      data.records.map((record) => [record.studentName, record] as const),
    );

    const nextRecords = normalizedRosterEntries.map((entry) => {
      const existing = existingMap.get(entry.studentName);
      if (existing) {
        return {
          ...existing,
          studentName: entry.studentName,
          height: entry.height,
          weight: entry.weight,
          studentGradeLabel: entry.studentGradeLabel,
          testDate: data.testDate,
        };
      }

      return {
        ...makeEmptyRecord(data.testDate),
        studentName: entry.studentName,
        height: entry.height,
        weight: entry.weight,
        studentGradeLabel: entry.studentGradeLabel,
      };
    });

    return {
      ...data,
      rosterEntries: normalizedRosterEntries,
      records: nextRecords,
    };
  };

  const applyRosterDraftToCurrentData = (showMessage = true): AppData => {
    const nextData = buildDataWithRosterDraft();
    const nextRecords = nextData.records;
    setData(nextData);
    setRosterDraft(
      nextData.rosterEntries.length
        ? nextData.rosterEntries
        : [makeEmptyRosterEntry()],
    );
    setSelectedId(nextRecords[0]?.id ?? "");
    setDraftRecord(nextRecords[0] ?? makeEmptyRecord(data.testDate));
    if (showMessage) {
      setMessage(
        nextData.rosterEntries.length
          ? "已將名冊匯入目前資料。"
          : "已儲存學員名單，目前沒有學員。",
      );
    }
    return nextData;
  };

  const importRosterToRecords = async (): Promise<void> => {
    const nextData = applyRosterDraftToCurrentData(false);
    if (!currentCloudFileId || !currentCloudFileOwnerUid) {
      setMessage("已儲存學員名單到目前畫面。請先開啟檔案，才能同步到雲端。");
      return;
    }

    const saved = await handleSaveCurrentCloudFile(nextData, "按下「儲存名冊」並同步雲端。");
    setMessage(
      saved
        ? "學員名單已儲存並同步到雲端。"
        : "學員名單已套用到目前畫面，但同步雲端失敗，請稍後再按「儲存目前檔案」。",
    );
  };

  const getViewportMaxHeight = (rowHeight: number): string => {
    const headerHeight = 54;
    const rowsHeight = rowHeight * debugSettings.sheetVisibleRows;
    return `${headerHeight + rowsHeight}px`;
  };

  const renderSheetDebugInfo = (values: {
    viewportWidth: number;
    naturalWidth: number;
    scale: number;
    scrollLeft: number;
  }) => {
    const scaledWidth = values.naturalWidth * values.scale;
    const maxScrollLeft = Math.max(
      0,
      scaledWidth + debugSettings.sheetScrollRightPadding - values.viewportWidth,
    );

    return (
      <div className="sheet-debug">
        {`vw:${values.viewportWidth.toFixed(1)} | nw:${values.naturalWidth.toFixed(1)} | scale:${values.scale.toFixed(3)} | sw:${scaledWidth.toFixed(1)} | pad:${debugSettings.sheetScrollRightPadding} | max:${maxScrollLeft.toFixed(1)} | left:${values.scrollLeft.toFixed(1)}`}
      </div>
    );
  };

  const renderIncomingFriendAlertCard = () => {
    if (!currentUser || incomingFriendRequests.length === 0) {
      return null;
    }

    return (
      <section className="friend-alert-card">
        <div className="friend-alert-card-head">
          <strong>有人送出好友邀請</strong>
          <span>{incomingFriendRequests.length} 筆待處理</span>
        </div>
        <div className="friend-alert-list">
          {incomingFriendRequests.map((request) => (
            <div className="friend-alert-item" key={request.id}>
              <div className="friend-alert-copy">
                <strong>{getIncomingRequestDisplayName(request)}</strong>
                <small>送出時間 {formatActivityDate(request.createdAt)}</small>
              </div>
              <div className="friend-row-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    void acceptRequest(request, setMessage);
                  }}
                  type="button"
                >
                  同意
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    void rejectRequest(request, setMessage);
                  }}
                  type="button"
                >
                  拒絕
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderWorkspaceFileCard = () => {
    return (
      <div className="workspace-file-card">
        <div>
          <strong>目前使用檔案</strong>
          <span>{currentWorkspaceFileLabel}</span>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            void handleTabChange("files");
          }}
          type="button"
        >
          切換檔案
        </button>
      </div>
    );
  };

  const renderNoOpenFileCard = (pageLabel: string) => {
    return (
      <div className="friend-empty-state no-students-card">
        <strong>尚未開啟檔案</strong>
        <p>
          {pageLabel}目前沒有內容，因為這個帳號尚未開啟任何檔案。請先建立新檔案，或從檔案清單中選擇一份檔案。
        </p>
        <div className="button-row">
          <button
            className="primary-button"
            onClick={() => {
              void handleTabChange("files");
            }}
            type="button"
          >
            前往編輯檔案
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>學員名單</h2>
        </div>
      </div>
      {renderIncomingFriendAlertCard()}
      {renderWorkspaceFileCard()}

      {!currentCloudFileId ? renderNoOpenFileCard("學員名單") : (
        <div className="roster-editor">
          <div className="sheet-shell">
            {debugSettings.showSheetDebug
              ? renderSheetDebugInfo({
                  viewportWidth: rosterViewportWidth,
                  naturalWidth: rosterNaturalWidth,
                  scale: rosterScale,
                  scrollLeft: rosterViewportRef.current?.scrollLeft ?? 0,
                })
              : null}
            <div
              className="fixed-sheet-viewport roster-viewport table-wrap"
              ref={rosterViewportRef}
              style={{ maxHeight: getViewportMaxHeight(50) }}
            >
              <table
                className="fixed-sheet-table"
                ref={rosterTableRef}
              >
                <colgroup>
                  <col style={{ width: "40px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "80px" }} />
                  <col style={{ width: "80px" }} />
                  {isMixedAgeClass(data.gradeLabel) ? <col style={{ width: "100px" }} /> : null}
                </colgroup>
                <thead>
                  <tr>
                    <th className="sticky-left-0">#</th>
                    <th className="sticky-left-40">姓名</th>
                    <th>身高</th>
                    <th>體重</th>
                    {isMixedAgeClass(data.gradeLabel) ? <th>學生年級</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rosterDraft.map((entry, index) => (
                    <tr key={entry.id}>
                      <td className="sticky-left-0" style={{ fontWeight: 500, color: "#64748b" }}>{index + 1}</td>
                      <td className="sticky-left-40">
                        {rosterActiveCell?.rowIndex === index &&
                        rosterActiveCell?.columnIndex === 0 ? (
                          <input
                            autoFocus
                            className="sheet-input"
                            onFocus={(event) => {
                              const target = event.currentTarget;
                              setTimeout(() => {
                                target.select();
                                try {
                                  target.setSelectionRange(0, target.value.length);
                                } catch (err) {}
                              }, 50);
                            }}
                            onBlur={() => setRosterActiveCell(null)}
                            onChange={(event) =>
                              updateRosterDraftCell(index, 0, event.target.value)
                            }
                            onKeyDown={(event) =>
                              handleKeyDown(event, index, 0)
                            }
                            onPaste={(event) =>
                              handlePaste(event, index, 0, applyRosterPaste)
                            }
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
                            {entry.studentName || "—"}
                          </button>
                        )}
                      </td>
                      <td>
                        {rosterActiveCell?.rowIndex === index &&
                        rosterActiveCell?.columnIndex === 1 ? (
                          <input
                            autoFocus
                            className="sheet-input"
                            onFocus={(event) => {
                              const target = event.currentTarget;
                              setTimeout(() => {
                                target.select();
                                try {
                                  target.setSelectionRange(0, target.value.length);
                                } catch (err) {}
                              }, 50);
                            }}
                            onBlur={() => setRosterActiveCell(null)}
                            onChange={(event) =>
                              updateRosterDraftCell(index, 1, event.target.value)
                            }
                            onKeyDown={(event) =>
                              handleKeyDown(event, index, 1)
                            }
                            onPaste={(event) =>
                              handlePaste(event, index, 1, applyRosterPaste)
                            }
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
                            {entry.height || "—"}
                          </button>
                        )}
                      </td>
                      <td>
                        {rosterActiveCell?.rowIndex === index &&
                        rosterActiveCell?.columnIndex === 2 ? (
                          <input
                            autoFocus
                            className="sheet-input"
                            onFocus={(event) => {
                              const target = event.currentTarget;
                              setTimeout(() => {
                                target.select();
                                try {
                                  target.setSelectionRange(0, target.value.length);
                                } catch (err) {}
                              }, 50);
                            }}
                            onBlur={() => setRosterActiveCell(null)}
                            onChange={(event) =>
                              updateRosterDraftCell(index, 2, event.target.value)
                            }
                            onKeyDown={(event) =>
                              handleKeyDown(event, index, 2)
                            }
                            onPaste={(event) =>
                              handlePaste(event, index, 2, applyRosterPaste)
                            }
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
                            {entry.weight || "—"}
                          </button>
                        )}
                      </td>
                      {isMixedAgeClass(data.gradeLabel) ? (
                        <td>
                          {rosterActiveCell?.rowIndex === index &&
                          rosterActiveCell?.columnIndex === 3 ? (
                            <select
                              autoFocus
                              className="sheet-input"
                              onBlur={() => setRosterActiveCell(null)}
                              onChange={(event) =>
                                updateRosterDraftCell(index, 3, event.target.value)
                              }
                              onKeyDown={(event) =>
                                handleKeyDown(event, index, 3)
                              }
                              value={entry.studentGradeLabel}
                            >
                              {STUDENT_GRADE_OPTIONS.map((grade) => (
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

          <div className="button-row">
            <button
              className="primary-button"
              onClick={importRosterToRecords}
              type="button"
            >
              儲存
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
