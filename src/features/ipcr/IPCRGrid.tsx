import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import jspreadsheet, { type JspreadsheetInstanceElement, type WorksheetInstance } from "jspreadsheet-ce";
import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jspreadsheet-ce/dist/jspreadsheet.themes.css";
// jsuites is jspreadsheet-ce's own declared dependency (not ours) — its toolbar/dropdown
// widgets need this stylesheet, so it's pulled from jspreadsheet-ce's nested copy rather
// than adding a second, independently-versioned top-level jsuites dependency.
import "jspreadsheet-ce/node_modules/jsuites/dist/jsuites.css";
import { cellCoords, cellName, flattenRuns, htmlToRuns, parseCellStyle, runsToHtml } from "./ipcrGridUtils";
import type { IPCRGridData, IPCRRichTextRun } from "./types";
import "./ipcr.css";

// The sheet's cells hold HTML (jspreadsheet parseHTML) so a word inside a cell can be bold/italic/
// underlined on its own, exactly like Google Sheets — but everything outside this file (saved
// templates, .xlsx/PDF export, fill-in tokens) keeps the existing model: plain text in `data`, with
// mixed-formatting cells' runs in `richText`. These two helpers are the only translation layer.
const hasFormatting = (runs: IPCRRichTextRun[]) => runs.some(run => run.bold || run.italic || run.underline);

function cellHtmlToModel(html: unknown): { text: string | number; runs: IPCRRichTextRun[] | null } {
  if (typeof html !== "string") return { text: html as number, runs: null };
  if (!/[<&]/.test(html)) return { text: html, runs: null };
  const runs = htmlToRuns(html);
  return { text: flattenRuns(runs), runs: hasFormatting(runs) ? runs : null };
}

function cellHtmlToPlain(html: unknown): string {
  const { text } = cellHtmlToModel(html);
  return String(text ?? "");
}

// One shared custom column editor: the cell itself turns contentEditable, so typing and
// formatting happen right in the cell (no floating popup). Ctrl+B/I/U work natively on the
// selected words; the toolbar's B/I/U call formatSelection below for the same effect.
let editingRichCell: HTMLElement | null = null;

const richTextColumn = {
  openEditor(cell: HTMLTableCellElement) {
    editingRichCell = cell;
    cell.contentEditable = "true";
    cell.classList.add("etm-ipcr-cell-editing");
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  },
  closeEditor(cell: HTMLTableCellElement) {
    cell.contentEditable = "false";
    cell.classList.remove("etm-ipcr-cell-editing");
    editingRichCell = null;
    return runsToHtml(htmlToRuns(cell.innerHTML));
  },
};

export type IPCRBorderKind = "all" | "outer" | "top" | "bottom" | "left" | "right" | "none";

export interface IPCRGridSelectionInfo {
  cell: string;
  value: string;
  style: string;
}

export interface IPCRGridDimensions {
  rows: number;
  cols: number;
}

export interface IPCRGridCellRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface IPCRGridHandle {
  getSnapshot: () => IPCRGridData;
  getSelectedCell: () => string | null;
  // Programmatically selects a single cell (fires the same onSelectionChange a click would) —
  // used so clicking a rich-text overlay, which sits on top of the real cell, still selects it.
  selectCell: (cell: string) => void;
  // True while a cell is being edited in place; then bold/italic/underline should format the
  // selected words (formatSelection) instead of the whole cell (toggleStyle).
  isEditing: () => boolean;
  formatSelection: (command: "bold" | "italic" | "underline") => void;
  getCellValue: (cell: string) => string;
  getCellStyle: (cell: string) => string;
  // Position of a cell's actual rendered <td>, relative to this grid's overlay wrapper (its
  // direct DOM parent) — used to align an overlay (e.g. rich text) exactly over that cell. Null
  // if the cell isn't currently in the DOM (grid not mounted, or out of range).
  getCellRect: (cell: string) => IPCRGridCellRect | null;
  getDimensions: () => IPCRGridDimensions;
  setCellValue: (cell: string, value: string) => void;
  markCell: (cell: string, marked: boolean) => void;
  insertColumn: (position?: "left" | "right") => void;
  insertRow: (position?: "above" | "below") => void;
  deleteColumn: () => void;
  deleteRow: () => void;
  mergeSelection: () => void;
  unmergeSelection: () => void;
  toggleStyle: (property: "font-weight" | "font-style" | "text-decoration", onValue: string) => void;
  setSelectionColor: (property: "color" | "background-color", value: string) => void;
  clearSelectionFill: () => void;
  setFontFamily: (fontFamily: string) => void;
  setFontSize: (fontSize: number) => void;
  alignSelection: (align: "left" | "center" | "right") => void;
  setVerticalAlign: (valign: "top" | "middle" | "bottom") => void;
  applyBorder: (kind: IPCRBorderKind, color: string) => void;
  undo: () => void;
  redo: () => void;
}

interface IPCRGridProps {
  value: IPCRGridData;
  editable: boolean;
  minRows?: number;
  minCols?: number;
  onSelectionChange?: (info: IPCRGridSelectionInfo | null) => void;
  onDimensionsChange?: (dims: IPCRGridDimensions) => void;
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
const IPCRGrid = forwardRef<IPCRGridHandle, IPCRGridProps>(function IPCRGrid({ value, editable, minRows = 24, minCols = 10, onSelectionChange, onDimensionsChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<WorksheetInstance | null>(null);
  const selectedRef = useRef<string | null>(null);
  const selectionRangeRef = useRef<[number, number, number, number] | null>(null);
  // The mount effect below runs once (see the mount-once note at file scope) — these refs
  // let it always call the LATEST callback prop instead of closing over a stale one.
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onDimensionsChangeRef = useRef(onDimensionsChange);
  onDimensionsChangeRef.current = onDimensionsChange;

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
    // Seed each cell with HTML: its saved rich-text runs if it has any, else its plain text
    // (escaped, so a literal "<" or "&" in a cell can't turn into markup).
    const data = Array.from({ length: rowCount }, (_, y) =>
      Array.from({ length: colCount }, (_, x) => {
        const runs = value.richText?.[cellName(x, y)];
        if (runs?.length) return runsToHtml(runs);
        const plain = value.data[y]?.[x] ?? "";
        return typeof plain === "string" && plain ? runsToHtml([{ text: plain }]) : plain;
      }));

    const notifyDimensions = (worksheet: WorksheetInstance) => {
      onDimensionsChangeRef.current?.({ rows: worksheet.rows.length, cols: worksheet.cols.length });
    };

    const [instance] = jspreadsheet(container, {
      // The built-in toolbar is intentionally disabled — a custom, explicit toolbar (see
      // IPCRTemplateForm) replaces it, driving the same setStyle()/setMerge() APIs directly.
      toolbar: false,
      onselection: (worksheet, x1, y1, x2, y2) => {
        const cell = `${columnName(x1)}${y1 + 1}`;
        selectedRef.current = cell;
        selectionRangeRef.current = [x1, y1, x2, y2];
        const cellStyle = worksheet.getStyle(cell);
        onSelectionChangeRef.current?.({ cell, value: cellHtmlToPlain(worksheet.getValue(cell)), style: typeof cellStyle === "string" ? cellStyle : "" });
      },
      oninsertrow: notifyDimensions,
      ondeleterow: notifyDimensions,
      oninsertcolumn: notifyDimensions,
      ondeletecolumn: notifyDimensions,
      parseHTML: true,
      worksheets: [{
        data,
        columns: Array.from({ length: colCount }, () => ({ type: richTextColumn })),
        style: value.style,
        // NOT passing mergeCells here — jspreadsheet-ce's init-time merge application doesn't
        // reliably take effect (verified: cells came back unmerged despite correct data), so
        // merges are applied explicitly via setMerge() below instead, the same proven-working
        // runtime API the "Merge" toolbar button already uses.
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
    Object.entries(value.rowHeights ?? {}).forEach(([row, height]) => instance.setHeight(Number(row), height));
    notifyDimensions(instance);

    // setMerge() needs the grid's DOM to have actually painted first — calling it synchronously
    // in the same tick as construction (as this originally did) threw deep inside
    // jspreadsheet-ce's internal cell index on real-world sheets with 100+ merges. Deferring one
    // frame, applying top-to-bottom/left-to-right, and isolating each call so one bad merge
    // (e.g. an edge case from a messy Google Sheets export) can't take down the whole grid.
    const mergeFrame = requestAnimationFrame(() => {
      Object.entries(value.mergeCells)
        .sort(([a], [b]) => {
          const ca = cellCoords(a), cb = cellCoords(b);
          return ca.row - cb.row || ca.col - cb.col;
        })
        .forEach(([anchor, [colspan, rowspan]]) => {
          try { instance.setMerge(anchor, colspan, rowspan); } catch { /* skip this one merge, keep the rest */ }
        });
    });

    return () => {
      cancelAnimationFrame(mergeFrame);
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
      // Translate the cells' HTML back into the saved model: plain text in `data`, and runs in
      // `richText` for any cell that has bold/italic/underline on part of (or all of) its text.
      const richText: Record<string, IPCRRichTextRun[]> = {};
      const data = (instance.getData() as unknown[][]).map((row, y) => row.map((cellHtml, x) => {
        const { text, runs } = cellHtmlToModel(cellHtml);
        if (runs) richText[cellName(x, y)] = runs;
        return text;
      })) as (string | number)[][];
      const style = (instance.getStyle() as Record<string, string>) ?? {};
      const merge = (instance.getMerge() as Record<string, [number, number]> | null) ?? {};
      const widths = instance.getWidth() as (number | string)[];
      const colWidths: Record<number, number> = {};
      widths.forEach((width, index) => {
        const numeric = Number(width);
        if (!Number.isNaN(numeric)) colWidths[index] = numeric;
      });
      const heights = instance.getHeight() as (number | string)[];
      const rowHeights: Record<number, number> = {};
      heights.forEach((height, index) => {
        const numeric = Number(height);
        if (!Number.isNaN(numeric)) rowHeights[index] = numeric;
      });
      return { data, style, mergeCells: merge, colWidths, rowHeights, richText, images: value.images, sheetName: value.sheetName };
    },
    getSelectedCell: () => selectedRef.current,
    selectCell: cell => {
      const { col, row } = cellCoords(cell);
      instanceRef.current?.updateSelectionFromCoords(col, row, col, row);
    },
    isEditing: () => !!editingRichCell && !!containerRef.current?.contains(editingRichCell),
    formatSelection: command => { document.execCommand(command); },
    getCellValue: cell => cellHtmlToPlain(instanceRef.current?.getValue(cell)),
    getCellStyle: cell => {
      const cellStyle = instanceRef.current?.getStyle(cell);
      return typeof cellStyle === "string" ? cellStyle : "";
    },
    getCellRect: cell => {
      const instance = instanceRef.current;
      const container = containerRef.current;
      const wrapper = container?.parentElement;
      if (!instance || !container || !wrapper) return null;
      const { col, row } = cellCoords(cell);
      const element = instance.getCellFromCoords(col, row);
      if (!element) return null;
      const cellRect = element.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      return { left: cellRect.left - wrapperRect.left, top: cellRect.top - wrapperRect.top, width: cellRect.width, height: cellRect.height };
    },
    getDimensions: () => {
      const instance = instanceRef.current;
      return instance ? { rows: instance.rows.length, cols: instance.cols.length } : { rows: value.data.length, cols: value.data[0]?.length ?? 0 };
    },
    setCellValue: (cell, cellValue) => { instanceRef.current?.setValue(cell, cellValue ? runsToHtml([{ text: cellValue }]) : ""); },
    markCell: (cell, marked) => {
      instanceRef.current?.setStyle(cell, "border", marked ? "2px dashed #0d8a92" : "", true);
    },
    insertColumn: (position = "right") => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      const columnNumber = range ? Math.max(range[0], range[2]) : undefined;
      instance?.insertColumn(1, position === "left" ? (range ? Math.min(range[0], range[2]) : undefined) : columnNumber, position === "left", [{ type: richTextColumn }]);
    },
    insertRow: (position = "below") => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      const rowNumber = range ? (position === "above" ? Math.min(range[1], range[3]) : Math.max(range[1], range[3])) : undefined;
      // jspreadsheet-ce's own type defs mistype this 3rd arg as `number` (insertColumn's
      // equivalent is correctly `boolean`) — its runtime just checks truthiness, so 0/1 works.
      instance?.insertRow(1, rowNumber, position === "above" ? 1 : 0);
    },
    deleteColumn: () => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, , x2] = range;
      instance.deleteColumn(Math.min(x1, x2), Math.abs(x2 - x1) + 1);
    },
    deleteRow: () => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [, y1, , y2] = range;
      instance.deleteRow(Math.min(y1, y2), Math.abs(y2 - y1) + 1);
    },
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
      // Read the toggle state from the parsed style string, not getStyle(cell, property): the
      // browser hands back a normalized form (font-weight 700, "underline solid …") that never
      // equals onValue, so a style that was on could never be switched off again.
      const parsed = parseCellStyle(String(instance.getStyle(cells[0]) ?? ""));
      const isOn = property === "font-weight" ? parsed.bold : property === "font-style" ? parsed.italic : parsed.underline;
      const next = isOn ? "" : onValue;
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
    clearSelectionFill: () => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) instance.setStyle(`${columnName(x)}${y + 1}`, "background-color", "", true);
      }
    },
    setFontFamily: fontFamily => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) instance.setStyle(`${columnName(x)}${y + 1}`, "font-family", fontFamily, true);
      }
    },
    setFontSize: fontSize => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) instance.setStyle(`${columnName(x)}${y + 1}`, "font-size", `${fontSize}px`, true);
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
    setVerticalAlign: valign => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) instance.setStyle(`${columnName(x)}${y + 1}`, "vertical-align", valign, true);
      }
    },
    applyBorder: (kind, color) => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [rx1, ry1, rx2, ry2] = range;
      const minX = Math.min(rx1, rx2), maxX = Math.max(rx1, rx2);
      const minY = Math.min(ry1, ry2), maxY = Math.max(ry1, ry2);
      const border = `1px solid ${color}`;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cell = `${columnName(x)}${y + 1}`;
          if (kind === "none") { instance.setStyle(cell, "border", "", true); continue; }
          if (kind === "all") { instance.setStyle(cell, "border", border, true); continue; }
          if ((kind === "outer" || kind === "top") && y === minY) instance.setStyle(cell, "border-top", border, true);
          if ((kind === "outer" || kind === "bottom") && y === maxY) instance.setStyle(cell, "border-bottom", border, true);
          if ((kind === "outer" || kind === "left") && x === minX) instance.setStyle(cell, "border-left", border, true);
          if ((kind === "outer" || kind === "right") && x === maxX) instance.setStyle(cell, "border-right", border, true);
        }
      }
    },
    undo: () => { instanceRef.current?.undo(); },
    redo: () => { instanceRef.current?.redo(); },
  }), [value]);

  return <div ref={containerRef} className="etm-ipcr-grid-host" />;
});

export default IPCRGrid;
