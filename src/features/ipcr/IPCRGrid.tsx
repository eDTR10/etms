import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import jspreadsheet, { type JspreadsheetInstanceElement, type WorksheetInstance } from "jspreadsheet-ce";
import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jspreadsheet-ce/dist/jspreadsheet.themes.css";
// jsuites is jspreadsheet-ce's own declared dependency (not ours) — its toolbar/dropdown
// widgets need this stylesheet, so it's pulled from jspreadsheet-ce's nested copy rather
// than adding a second, independently-versioned top-level jsuites dependency.
import "jspreadsheet-ce/node_modules/jsuites/dist/jsuites.css";
import type { IPCRGridData } from "./types";
import "./ipcr.css";

export interface IPCRGridHandle {
  getSnapshot: () => IPCRGridData;
  getSelectedCell: () => string | null;
  setCellValue: (cell: string, value: string) => void;
  markCell: (cell: string, marked: boolean) => void;
  insertColumn: () => void;
  insertRow: () => void;
  mergeSelection: () => void;
  unmergeSelection: () => void;
  toggleStyle: (property: "font-weight" | "font-style" | "text-decoration", onValue: string) => void;
  setSelectionColor: (property: "color" | "background-color", value: string) => void;
  alignSelection: (align: "left" | "center" | "right") => void;
  undo: () => void;
  redo: () => void;
}

interface IPCRGridProps {
  value: IPCRGridData;
  editable: boolean;
  minRows?: number;
  minCols?: number;
}

function columnName(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

// jspreadsheet-ce is an imperative, non-React library that owns its own DOM once mounted —
// `value` only seeds the initial content. Callers force a remount (fresh grid) by changing
// this component's `key` (e.g. keying by template id) rather than relying on prop diffing.
const IPCRGrid = forwardRef<IPCRGridHandle, IPCRGridProps>(function IPCRGrid({ value, editable, minRows = 24, minCols = 10 }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<WorksheetInstance | null>(null);
  const selectedRef = useRef<string | null>(null);
  const selectionRangeRef = useRef<[number, number, number, number] | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Defensive: guard against a second init landing on an already-initialized container
    // (React 18 StrictMode double-invokes effects in dev; jspreadsheet's own destroy() does
    // not reliably strip every toolbar/tab node it created) — without this, a second mount
    // stacks a second toolbar and worksheet tab on top of the first.
    container.innerHTML = "";
    const rowCount = Math.max(value.data.length, minRows);
    const colCount = Math.max(value.data[0]?.length ?? 0, minCols);
    const data = Array.from({ length: rowCount }, (_, y) =>
      Array.from({ length: colCount }, (_, x) => value.data[y]?.[x] ?? ""));

    const [instance] = jspreadsheet(container, {
      // The built-in toolbar is intentionally disabled — a custom, explicit toolbar (see
      // IPCRTemplateForm) replaces it, driving the same setStyle()/setMerge() APIs directly.
      toolbar: false,
      onselection: (_instance, x1, y1, x2, y2) => {
        selectedRef.current = `${columnName(x1)}${y1 + 1}`;
        selectionRangeRef.current = [x1, y1, x2, y2];
      },
      worksheets: [{
        data,
        style: value.style,
        mergeCells: value.mergeCells,
        minDimensions: [colCount, rowCount],
        editable,
        columnDrag: editable,
        columnResize: editable,
        rowResize: editable,
        allowInsertColumn: editable,
        allowInsertRow: editable,
        allowDeleteColumn: editable,
        allowDeleteRow: editable,
        allowComments: false,
        tableOverflow: true,
        tableWidth: "100%",
        wordWrap: true,
      }],
    });
    instanceRef.current = instance;
    Object.entries(value.colWidths).forEach(([col, width]) => instance.setWidth(Number(col), width));

    return () => {
      // jspreadsheet's own destroy() can throw on some instance shapes — if it does, the
      // unconditional innerHTML reset below must still run, or a remount (React 18 dev
      // double-invoke, switching templates, etc.) stacks a second toolbar on top.
      try { jspreadsheet.destroy(container as JspreadsheetInstanceElement, true); } catch { /* ignore */ }
      container.innerHTML = "";
      instanceRef.current = null;
    };
    // Intentionally mount-once: see the component-level note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      const instance = instanceRef.current;
      if (!instance) return value;
      const data = instance.getData() as (string | number)[][];
      const style = (instance.getStyle() as Record<string, string>) ?? {};
      const merge = (instance.getMerge() as Record<string, [number, number]> | null) ?? {};
      const widths = instance.getWidth() as (number | string)[];
      const colWidths: Record<number, number> = {};
      widths.forEach((width, index) => {
        const numeric = Number(width);
        if (!Number.isNaN(numeric)) colWidths[index] = numeric;
      });
      return { data, style, mergeCells: merge, colWidths, images: value.images };
    },
    getSelectedCell: () => selectedRef.current,
    setCellValue: (cell, cellValue) => { instanceRef.current?.setValue(cell, cellValue); },
    markCell: (cell, marked) => {
      instanceRef.current?.setStyle(cell, "border", marked ? "2px dashed #0d8a92" : "", true);
    },
    insertColumn: () => { instanceRef.current?.insertColumn(); },
    insertRow: () => { instanceRef.current?.insertRow(); },
    mergeSelection: () => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      const colspan = Math.abs(x2 - x1) + 1;
      const rowspan = Math.abs(y2 - y1) + 1;
      if (colspan <= 1 && rowspan <= 1) return;
      instance.setMerge(`${columnName(Math.min(x1, x2))}${Math.min(y1, y2) + 1}`, colspan, rowspan);
    },
    unmergeSelection: () => {
      const cell = selectedRef.current;
      if (cell) instanceRef.current?.removeMerge(cell);
    },
    toggleStyle: (property, onValue) => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      const cells: string[] = [];
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) cells.push(`${columnName(x)}${y + 1}`);
      }
      const current = instance.getStyle(cells[0], property);
      const next = current === onValue ? "" : onValue;
      cells.forEach(cell => instance.setStyle(cell, property, next, true));
    },
    setSelectionColor: (property, value) => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) instance.setStyle(`${columnName(x)}${y + 1}`, property, value, true);
      }
    },
    alignSelection: align => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) instance.setStyle(`${columnName(x)}${y + 1}`, "text-align", align, true);
      }
    },
    undo: () => { instanceRef.current?.undo(); },
    redo: () => { instanceRef.current?.redo(); },
  }), [value]);

  return <div ref={containerRef} className="etm-ipcr-grid-host" />;
});

export default IPCRGrid;
