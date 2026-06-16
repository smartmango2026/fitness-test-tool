import { KeyboardEvent, ClipboardEvent } from "react";

// Helper to parse clipboard TSV data
export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((row) => row.split("\t"));
}

// Helper to overlay pasted grid onto current grid
export function applyGridPaste(
  current: string[][],
  startRowIndex: number,
  startColumnIndex: number,
  clipboardText: string,
): string[][] {
  const pastedGrid = parseClipboardGrid(clipboardText);
  if (!pastedGrid.length) {
    return current;
  }

  return current.map((row, rowIndex) =>
    row.map((cell, columnIndex) => {
      const pastedRow = pastedGrid[rowIndex - startRowIndex];
      if (!pastedRow) {
        return cell;
      }

      const pastedCell = pastedRow[columnIndex - startColumnIndex];
      return pastedCell === undefined ? cell : pastedCell;
    }),
  );
}

// 1. Hook for ID-based spreadsheet grids (e.g. TableTab, MetricTab)
interface IdGridProps<T extends { id: string }, F extends string> {
  records: T[];
  fields: F[];
  activeCell: { recordId: string; field: F } | null;
  setActiveCell: (cell: { recordId: string; field: F } | null) => void;
  onSelectRecord?: (record: T) => void;
}

export function useIdSpreadsheetGrid<T extends { id: string }, F extends string>({
  records,
  fields,
  activeCell,
  setActiveCell,
  onSelectRecord,
}: IdGridProps<T, F>) {
  const moveActiveCell = (
    recordId: string,
    field: F,
    rowOffset: number,
    columnOffset: number,
  ) => {
    const currentIndex = records.findIndex((r) => r.id === recordId);
    if (currentIndex === -1) {
      setActiveCell(null);
      return;
    }

    const nextIndex = Math.max(0, Math.min(records.length - 1, currentIndex + rowOffset));
    const nextRecord = records[nextIndex];
    if (!nextRecord) {
      setActiveCell(null);
      return;
    }

    const currentFieldIndex = fields.indexOf(field);
    const nextFieldIndex =
      currentFieldIndex === -1
        ? 0
        : Math.max(0, Math.min(fields.length - 1, currentFieldIndex + columnOffset));
    const nextField = fields[nextFieldIndex] ?? field;

    if (onSelectRecord) {
      onSelectRecord(nextRecord);
    }
    setActiveCell({ recordId: nextRecord.id, field: nextField });
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    recordId: string,
    field: F,
    stopCellEdit: () => void,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveActiveCell(recordId, field, event.shiftKey ? -1 : 1, 0);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveCell(recordId, field, -1, 0);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveCell(recordId, field, 1, 0);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveActiveCell(recordId, field, 0, -1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveActiveCell(recordId, field, 0, 1);
      return;
    }

    if (event.key === "Escape") {
      stopCellEdit();
    }
  };

  const handlePaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
    onPasteData: (startRow: number, startCol: number, text: string) => void,
  ) => {
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!clipboardText.includes("\t") && !clipboardText.includes("\n")) {
      return; // normal single cell typing
    }

    event.preventDefault();
    onPasteData(rowIndex, columnIndex, clipboardText);
  };

  return {
    moveActiveCell,
    handleKeyDown,
    handlePaste,
  };
}

// 2. Hook for Index-based spreadsheet grids (e.g. RosterTab)
interface IndexGridProps {
  rowCount: number;
  columnCount: number;
  setActiveCell: (cell: { rowIndex: number; columnIndex: number } | null) => void;
}

export function useIndexSpreadsheetGrid({
  rowCount,
  columnCount,
  setActiveCell,
}: IndexGridProps) {
  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    columnIndex: number,
  ) => {
    let nextRowIndex = rowIndex;
    let nextColumnIndex = columnIndex;

    if (event.key === "Enter") {
      event.preventDefault();
      nextRowIndex = Math.max(0, Math.min(rowCount - 1, rowIndex + (event.shiftKey ? -1 : 1)));
      setActiveCell({ rowIndex: nextRowIndex, columnIndex });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      nextRowIndex = Math.max(0, rowIndex - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nextRowIndex = Math.min(rowCount - 1, rowIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      nextColumnIndex = Math.max(0, columnIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nextColumnIndex = Math.min(columnCount - 1, columnIndex + 1);
    } else {
      return;
    }

    setActiveCell({ rowIndex: nextRowIndex, columnIndex: nextColumnIndex });
  };

  const handlePaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
    onPasteData: (startRow: number, startCol: number, text: string) => void,
  ) => {
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!clipboardText.includes("\t") && !clipboardText.includes("\n")) {
      return;
    }

    event.preventDefault();
    onPasteData(rowIndex, columnIndex, clipboardText);
  };

  return {
    handleKeyDown,
    handlePaste,
  };
}
