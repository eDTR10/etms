import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import jspreadsheet, { type JspreadsheetInstanceElement, type WorksheetInstance } from "jspreadsheet-ce";
import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jspreadsheet-ce/dist/jspreadsheet.themes.css";
// jsuites is jspreadsheet-ce's own declared dependency (not ours) — its toolbar/dropdown
// widgets need this stylesheet, so it's pulled from jspreadsheet-ce's nested copy rather
// than adding a second, independently-versioned top-level jsuites dependency.
import "jspreadsheet-ce/node_modules/jsuites/dist/jsuites.css";
import { cellCoords } from "./ipcrGridUtils";
import { MANAGED_PROPERTIES, parseClipboardTable, type ParsedPaste } from "./ipcrPaste";
import type { IPCRGridData, IPCRRichTextRun } from "./types";
import "./ipcr.css";

// jspreadsheet's setStyle(cell, property, value) silently ignores an empty `value` (it falls
// through to the "object of cell → css string" form and treats the cell name as that object),
// so "remove this style" has to go through the object form: {A1: "property:"}.
function setStyleProp(instance: WorksheetInstance, cell: string, property: string, value: string) {
  if (value === "") instance.setStyle({ [cell]: `${property}:` }, null, null, true);
  else instance.setStyle(cell, property, value, true);
}

export type IPCRBorderKind = "all" | "outer" | "top" | "bottom" | "left" | "right" | "none";

export interface IPCRGridSelectionInfo {
  cell: string;
  value: string;
  style: string;
  // The whole selection as [firstCol, firstRow, lastCol, lastRow] (corners in any order), and the sheet's size.
  range: [number, number, number, number];
  rows: number;
  cols: number;
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
  getCellValue: (cell: string) => string;
  // Close an open in-cell editor, throwing away what is typed in it.
  cancelEdit: () => void;
  // Cells whose text is drawn by an overlay on top of the grid (mixed formatting, sample preview). Their own plain
  // text is hidden instead of being covered, so the cell keeps its borders and fill. Each overlay passes its own
  // `owner` so several can mark cells at once.
  markOverlayCells: (owner: string, cells: string[]) => void;
  // Runs `action` and records the grid edits it makes as ONE step for Ctrl+Z / Ctrl+Y. Returns an id to hand to
  // onPasteHistory's owner so state kept outside the grid can follow the undo/redo, or null if nothing changed.
  runAsOneStep: (action: () => void) => number | null;
  // Names of every cell in the current selection.
  getSelectedCells: () => string[];
  setCellStyle: (cell: string, property: string, value: string) => void;
  setRowHeight: (row: number, height: number) => void;
  // The font a cell is actually drawn in (its own style, or the grid default when it has none).
  getCellFont: (cell: string) => { family: string; size: string } | null;
  getCellStyle: (cell: string) => string;
  // Position of a cell's actual rendered <td>, relative to this grid's overlay wrapper (its
  // direct DOM parent) — used to align an overlay (e.g. rich text) exactly over that cell. Null
  // if the cell isn't currently in the DOM (grid not mounted, or out of range).
  getCellRect: (cell: string) => IPCRGridCellRect | null;
  getDimensions: () => IPCRGridDimensions;
  // Live column widths / row heights (px) as they are on screen right now, resizes included.
  getLayout: () => { colWidths: Record<number, number>; rowHeights: Record<number, number> };
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
  applyBorder: (kind: IPCRBorderKind, color: string, width?: number) => void;
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
  // Fires when the user finishes typing into a cell and the value was kept (not for programmatic changes).
  onCellEdited?: (cell: string, value: string) => void;
  // The in-cell editor opened on a cell (its name) or closed (null).
  onEditingChange?: (cell: string | null) => void;
  // After a spreadsheet paste: per pasted cell, its mixed-formatting runs, or null to clear any it had.
  onRichTextPasted?: (updates: Record<string, IPCRRichTextRun[] | null>, pasteId: number) => void;
  // A paste was undone or redone as one step — lets the owner of the mixed-formatting state follow along.
  onPasteHistory?: (pasteId: number, direction: "undo" | "redo") => void;
  // A column or row was resized by dragging its header edge.
  onLayoutChange?: () => void;
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
const IPCRGrid = forwardRef<IPCRGridHandle, IPCRGridProps>(function IPCRGrid({ value, editable, minRows = 24, minCols = 10, onSelectionChange, onDimensionsChange, onCellEdited, onEditingChange, onRichTextPasted, onPasteHistory, onLayoutChange }, ref) {
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
  const onCellEditedRef = useRef(onCellEdited);
  onCellEditedRef.current = onCellEdited;
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  const onRichTextPastedRef = useRef(onRichTextPasted);
  onRichTextPastedRef.current = onRichTextPasted;
  const onPasteHistoryRef = useRef(onPasteHistory);
  onPasteHistoryRef.current = onPasteHistory;
  // A spreadsheet paste is several grid operations (values, styles, merges, sizes, new rows...), each its
  // own undo entry. Remember which entries belong to which paste so Ctrl+Z / Ctrl+Y move a whole paste.
  const overlayCells = useRef(new Map<string, Set<string>>());
  const marked = useRef<HTMLElement[]>([]);
  const pasteGroups = useRef<{ id: number; start: number; end: number; first: unknown; last: unknown }[]>([]);
  const nextPasteId = useRef(1);
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

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
        onSelectionChangeRef.current?.({ cell, value: String(worksheet.getValue(cell) ?? ""), style: typeof cellStyle === "string" ? cellStyle : "", range: [x1, y1, x2, y2], rows: worksheet.rows.length, cols: worksheet.cols.length });
      },
      oneditionstart: (_worksheet, _td, x, y) => { onEditingChangeRef.current?.(`${columnName(x)}${y + 1}`); },
      oneditionend: (_worksheet, _td, x, y, editorValue, wasSaved) => {
        onEditingChangeRef.current?.(null);
        if (wasSaved) onCellEditedRef.current?.(`${columnName(x)}${y + 1}`, String(editorValue ?? ""));
      },
      onresizecolumn: () => { onLayoutChangeRef.current?.(); },
      onresizerow: () => { onLayoutChangeRef.current?.(); },
      oninsertrow: notifyDimensions,
      ondeleterow: notifyDimensions,
      oninsertcolumn: notifyDimensions,
      ondeletecolumn: notifyDimensions,
      worksheets: [{
        data,
        // Older templates were marked with a dashed `border`; drop that so it can't cover the cell's real borders.
        style: Object.fromEntries(Object.entries(value.style).map(([cell, css]) => [cell, css.replace(/(^|;)\s*border\s*:\s*2px dashed[^;]*;?/gi, "$1")])),
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

  // Double-clicking the edge of a column letter / row number fits that column's width (or row's height) to its text,
  // like a spreadsheet's "auto-fit". Listens in the capture phase so the grid's own double-click handling stays out of it.
  useEffect(() => {
    if (!editable) return;
    const container = containerRef.current;
    if (!container) return;
    const EDGE = 8;
    const canvas = document.createElement("canvas").getContext("2d");

    const fitColumn = (instance: WorksheetInstance, x: number) => {
      let widest = 0;
      for (let y = 0; y < instance.rows.length; y++) {
        const td = instance.records[y]?.[x]?.element;
        if (!td || td.style.display === "none" || td.colSpan > 1) continue;
        const text = (td.innerText || td.textContent || "").trim();
        if (!text || !canvas) continue;
        const computed = getComputedStyle(td);
        canvas.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
        text.split(/\r?\n/).forEach(line => { widest = Math.max(widest, canvas.measureText(line).width); });
      }
      // Cell padding on both sides, plus a little room so the last letter isn't flush against the border.
      return Math.min(900, Math.max(40, Math.ceil(widest) + 18));
    };

    const fitRow = (instance: WorksheetInstance, y: number) => {
      let tallest = 0;
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;word-break:break-word;line-height:normal;";
      document.body.appendChild(probe);
      for (let x = 0; x < (instance.records[y]?.length ?? 0); x++) {
        const td = instance.records[y][x].element;
        if (td.style.display === "none" || td.colSpan > 1 || td.rowSpan > 1) continue;
        const text = (td.innerText || td.textContent || "").trim();
        if (!text) continue;
        const computed = getComputedStyle(td);
        probe.style.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
        probe.style.width = `${Math.max(10, td.offsetWidth - 10)}px`;
        probe.textContent = text;
        tallest = Math.max(tallest, probe.offsetHeight);
      }
      probe.remove();
      return Math.min(600, Math.max(22, Math.ceil(tallest) + 8));
    };

    const onDoubleClick = (event: MouseEvent) => {
      const instance = instanceRef.current;
      const target = event.target as HTMLElement | null;
      if (!instance || !target) return;
      const header = target.closest<HTMLElement>("thead td[data-x]");
      if (header && header.getBoundingClientRect().right - event.clientX < EDGE) {
        event.preventDefault();
        event.stopImmediatePropagation();
        instance.setWidth(Number(header.dataset.x), fitColumn(instance, Number(header.dataset.x)));
        onLayoutChangeRef.current?.();
        return;
      }
      const rowHeader = target.closest<HTMLElement>("td.jss_row");
      if (rowHeader && rowHeader.getBoundingClientRect().bottom - event.clientY < EDGE) {
        event.preventDefault();
        event.stopImmediatePropagation();
        instance.setHeight(Number(rowHeader.dataset.y), fitRow(instance, Number(rowHeader.dataset.y)));
        onLayoutChangeRef.current?.();
      }
    };
    container.addEventListener("dblclick", onDoubleClick, true);
    return () => container.removeEventListener("dblclick", onDoubleClick, true);
  }, [editable]);

  // Pasting a range copied from Google Sheets (or any app that puts an HTML table on the clipboard)
  // brings its formatting along: the grid's built-in paste only ever reads plain text.
  useEffect(() => {
    if (!editable) return;
    const applyPaste = (parsed: ParsedPaste, range: [number, number, number, number]) => {
      const instance = instanceRef.current;
      if (!instance) return;
      const startX = Math.min(range[0], range[2]);
      const startY = Math.min(range[1], range[3]);
      const name = (x: number, y: number) => `${columnName(x)}${y + 1}`;
      const historyBefore = instance.historyIndex;

      // Grow the grid when the paste runs past its current edge.
      const extraRows = startY + parsed.rows - instance.rows.length;
      if (extraRows > 0) instance.insertRow(extraRows);
      const extraCols = startX + parsed.cols - instance.cols.length;
      if (extraCols > 0) instance.insertColumn(extraCols);

      // Merges already in the pasted area would collide with the incoming ones.
      const existing = (instance.getMerge() as Record<string, [number, number]> | null) ?? {};
      Object.entries(existing).forEach(([anchor, [colspan, rowspan]]) => {
        const { col, row } = cellCoords(anchor);
        if (col < startX + parsed.cols && col + colspan > startX && row < startY + parsed.rows && row + rowspan > startY) {
          try { instance.removeMerge(anchor); } catch { /* already gone */ }
        }
      });

      const values: { x: number; y: number; value: string }[] = [];
      const styles: Record<string, string> = {};
      const richUpdates: Record<string, IPCRRichTextRun[] | null> = {};
      parsed.cells.forEach((line, r) => line.forEach((cell, c) => {
        const x = startX + c, y = startY + r;
        values.push({ x, y, value: cell?.text ?? "" });
        // Every managed property is written (value, or "prop:" to clear it) in ONE setStyle call.
        styles[name(x, y)] = MANAGED_PROPERTIES.map(property => `${property}:${cell?.style[property] ?? ""}`).join(";");
        richUpdates[name(x, y)] = cell?.runs ?? null;
      }));
      instance.setValue(values, undefined, true);
      instance.setStyle(styles, null, null, true);

      parsed.merges
        .slice()
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .forEach(merge => {
          try { instance.setMerge(name(startX + merge.col, startY + merge.row), merge.colspan, merge.rowspan); } catch { /* skip one bad merge */ }
        });
      Object.entries(parsed.colWidths).forEach(([col, width]) => instance.setWidth(startX + Number(col), width));
      Object.entries(parsed.rowHeights).forEach(([row, height]) => instance.setHeight(startY + Number(row), height));
      const pasteId = nextPasteId.current++;
      const historyAfter = instance.historyIndex;
      if (historyAfter > historyBefore) {
        // A new edit throws away any redo entries after it, so groups that pointed there are dead.
        pasteGroups.current = pasteGroups.current.filter(group => group.end <= historyBefore);
        pasteGroups.current.push({ id: pasteId, start: historyBefore + 1, end: historyAfter, first: instance.history[historyBefore + 1], last: instance.history[historyAfter] });
      }
      onRichTextPastedRef.current?.(richUpdates, pasteId);
    };

    const onPaste = (event: ClipboardEvent) => {
      if (!instanceRef.current) return;
      // Nothing clicked yet (a fresh, empty grid shows A1 highlighted without having fired a
      // selection) -> paste from the top-left cell.
      const range = selectionRangeRef.current ?? [0, 0, 0, 0] as [number, number, number, number];
      // Typing into a cell editor / another field: let the browser paste text as usual.
      const target = event.target as HTMLElement | null;
      if (target && !target.classList?.contains("jss_textarea") && target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const html = event.clipboardData?.getData("text/html");
      if (!html || !/<table/i.test(html)) return;
      const parsed = parseClipboardTable(html);
      if (!parsed) return;
      event.preventDefault();
      // Capture phase + stopImmediatePropagation: otherwise the grid's own (text-only) paste also runs.
      event.stopImmediatePropagation();
      applyPaste(parsed, range);
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, [editable]);

  const liveGroup = (match: (group: (typeof pasteGroups.current)[number]) => boolean) => {
    const instance = instanceRef.current;
    if (!instance) return undefined;
    return pasteGroups.current.find(group => match(group) && instance.history[group.start] === group.first && instance.history[group.end] === group.last);
  };
  const undoStep = () => {
    const instance = instanceRef.current;
    if (!instance) return;
    const group = liveGroup(candidate => candidate.end === instance.historyIndex);
    if (!group) { instance.undo(); return; }
    for (let step = group.start; step <= group.end; step++) instance.undo();
    onPasteHistoryRef.current?.(group.id, "undo");
  };
  const redoStep = () => {
    const instance = instanceRef.current;
    if (!instance) return;
    const group = liveGroup(candidate => candidate.start === instance.historyIndex + 1);
    if (!group) { instance.redo(); return; }
    for (let step = group.start; step <= group.end; step++) instance.redo();
    onPasteHistoryRef.current?.(group.id, "redo");
  };
  const undoStepRef = useRef(undoStep);
  undoStepRef.current = undoStep;
  const redoStepRef = useRef(redoStep);
  redoStepRef.current = redoStep;

  // Ctrl/Cmd+Z and Ctrl+Y / Ctrl+Shift+Z — handled here (instead of by the grid) so a paste undoes as one
  // step. Skipped while typing in a cell editor or any other field, which have their own undo.
  useEffect(() => {
    if (!editable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target as HTMLElement | null;
      if (target && !target.classList?.contains("jss_textarea") && target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (!instanceRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === "y" || event.shiftKey) redoStepRef.current(); else undoStepRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [editable]);

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
        const numeric = parseFloat(String(width));
        if (numeric > 0) colWidths[index] = numeric;
      });
      const heights = instance.getHeight() as (number | string)[];
      const rowHeights: Record<number, number> = {};
      heights.forEach((height, index) => {
        // The grid hands heights back as CSS text ("145px"), which Number() turns into NaN — so every row height
        // that had been set (by dragging, auto-fit or an import) was silently dropped from the saved sheet.
        const numeric = parseFloat(String(height));
        if (numeric > 0) rowHeights[index] = numeric;
      });
      // Where A1 sits inside the wrapper (images are positioned from its top, 10px lower — see the image
      // layer's CSS), so exports can turn an image's x/y into a position over the table itself.
      const wrapper = containerRef.current?.parentElement;
      const a1 = instance.getCellFromCoords(0, 0);
      const imageOrigin = wrapper && a1 ? { x: Math.round(a1.getBoundingClientRect().left - wrapper.getBoundingClientRect().left), y: Math.round(a1.getBoundingClientRect().top - wrapper.getBoundingClientRect().top - 10) } : undefined;
      return { data, style, mergeCells: merge, colWidths, rowHeights, images: value.images, imageOrigin, sheetName: value.sheetName };
    },
    getSelectedCell: () => selectedRef.current,
    getCellValue: cell => String(instanceRef.current?.getValue(cell) ?? ""),
    markOverlayCells: (owner, cells) => {
      const instance = instanceRef.current;
      if (!instance) return;
      overlayCells.current.set(owner, new Set(cells));
      const wanted = new Set<string>();
      overlayCells.current.forEach(set => set.forEach(cell => wanted.add(cell)));
      // Unmark everything previously marked, then mark the union — cheap, and keeps merges / re-renders honest.
      marked.current.forEach(td => td.removeAttribute("data-etm-overlay"));
      marked.current = [];
      wanted.forEach(cell => {
        const { col, row } = cellCoords(cell);
        const td = instance.getCellFromCoords(col, row);
        if (td) { td.setAttribute("data-etm-overlay", "1"); marked.current.push(td); }
      });
    },
    getSelectedCells: () => {
      const range = selectionRangeRef.current;
      if (!range) return [];
      const cells: string[] = [];
      for (let y = Math.min(range[1], range[3]); y <= Math.max(range[1], range[3]); y++) {
        for (let x = Math.min(range[0], range[2]); x <= Math.max(range[0], range[2]); x++) cells.push(`${columnName(x)}${y + 1}`);
      }
      return cells;
    },
    runAsOneStep: action => {
      const instance = instanceRef.current;
      if (!instance) { action(); return null; }
      const before = instance.historyIndex;
      action();
      const after = instance.historyIndex;
      if (after <= before) return null;
      const id = nextPasteId.current++;
      pasteGroups.current = pasteGroups.current.filter(group => group.end <= before);
      pasteGroups.current.push({ id, start: before + 1, end: after, first: instance.history[before + 1], last: instance.history[after] });
      return id;
    },
    setRowHeight: (row, height) => { try { instanceRef.current?.setHeight(row, Math.ceil(height)); } catch { /* row no longer exists */ } },
    getCellFont: cell => {
      const instance = instanceRef.current;
      if (!instance) return null;
      const { col, row } = cellCoords(cell);
      const td = instance.getCellFromCoords(col, row);
      if (!td) return null;
      const computed = getComputedStyle(td);
      return { family: computed.fontFamily, size: computed.fontSize };
    },
    setCellStyle: (cell, property, value) => { if (instanceRef.current) setStyleProp(instanceRef.current, cell, property, value); },
    cancelEdit: () => {
      const instance = instanceRef.current;
      if (instance?.edition) { try { instance.closeEditor(instance.edition[0], false); } catch { /* editor already closed */ } }
    },
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
    getLayout: () => {
      const instance = instanceRef.current;
      const colWidths: Record<number, number> = {};
      const rowHeights: Record<number, number> = {};
      if (!instance) return { colWidths, rowHeights };
      // Measured from the DOM rather than getWidth()/getHeight(): those only change when a resize
      // drag is released, whereas the header/row elements follow the pointer while dragging.
      instance.headers.forEach((header, index) => {
        const width = header.getBoundingClientRect().width;
        if (width > 0) colWidths[index] = width;
      });
      instance.rows.forEach((row, index) => {
        const height = row.element.getBoundingClientRect().height;
        if (height > 0) rowHeights[index] = height;
      });
      return { colWidths, rowHeights };
    },
    getDimensions: () => {
      const instance = instanceRef.current;
      return instance ? { rows: instance.rows.length, cols: instance.cols.length } : { rows: value.data.length, cols: value.data[0]?.length ?? 0 };
    },
    setCellValue: (cell, cellValue) => { instanceRef.current?.setValue(cell, cellValue); },
    markCell: (cell, marked) => {
      // An outline, not a border: a dashed `border` shorthand fights with the cell's real borders (the browser folds
      // them into one rule, so a bottom line drawn on a marked cell was lost on save and missing from the PDF).
      const instance = instanceRef.current;
      if (!instance) return;
      setStyleProp(instance, cell, "outline", marked ? "2px dashed #0d8a92" : "");
      setStyleProp(instance, cell, "outline-offset", marked ? "-2px" : "");
    },
    insertColumn: (position = "right") => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      const columnNumber = range ? Math.max(range[0], range[2]) : undefined;
      instance?.insertColumn(1, position === "left" ? (range ? Math.min(range[0], range[2]) : undefined) : columnNumber, position === "left");
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
      let minX = Math.min(range[0], range[2]), maxX = Math.max(range[0], range[2]);
      let minY = Math.min(range[1], range[3]), maxY = Math.max(range[1], range[3]);

      // jspreadsheet refuses ("Cell already merged") when the selection touches a merged cell.
      // Like Excel / Google Sheets, grow the selection to fully cover any merged cell it touches,
      // undo those merges, then merge the whole block as one.
      const existing = (instance.getMerge() as Record<string, [number, number]> | null) ?? {};
      const merges = Object.entries(existing).map(([anchor, [colspan, rowspan]]) => {
        const { col, row } = cellCoords(anchor);
        return { anchor, x1: col, y1: row, x2: col + colspan - 1, y2: row + rowspan - 1 };
      });
      const touches = (m: (typeof merges)[number]) => m.x1 <= maxX && m.x2 >= minX && m.y1 <= maxY && m.y2 >= minY;
      for (let changed = true; changed;) {
        changed = false;
        for (const m of merges.filter(touches)) {
          if (m.x1 < minX) { minX = m.x1; changed = true; }
          if (m.x2 > maxX) { maxX = m.x2; changed = true; }
          if (m.y1 < minY) { minY = m.y1; changed = true; }
          if (m.y2 > maxY) { maxY = m.y2; changed = true; }
        }
      }
      const colspan = maxX - minX + 1;
      const rowspan = maxY - minY + 1;
      if (colspan <= 1 && rowspan <= 1) return;
      const overlapped = merges.filter(touches);
      // Selecting exactly one existing merge changes nothing.
      if (overlapped.length === 1 && overlapped[0].x1 === minX && overlapped[0].x2 === maxX && overlapped[0].y1 === minY && overlapped[0].y2 === maxY) return;

      overlapped.forEach(m => { try { instance.removeMerge(m.anchor); } catch { /* already gone */ } });
      instance.setMerge(`${columnName(minX)}${minY + 1}`, colspan, rowspan);
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
      cells.forEach(cell => setStyleProp(instance, cell, property, next));
    },
    setSelectionColor: (property, value) => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) setStyleProp(instance, `${columnName(x)}${y + 1}`, property, value);
      }
    },
    clearSelectionFill: () => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) setStyleProp(instance, `${columnName(x)}${y + 1}`, "background-color", "");
      }
    },
    setFontFamily: fontFamily => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) setStyleProp(instance, `${columnName(x)}${y + 1}`, "font-family", fontFamily);
      }
    },
    setFontSize: fontSize => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) setStyleProp(instance, `${columnName(x)}${y + 1}`, "font-size", `${fontSize}px`);
      }
    },
    alignSelection: align => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) setStyleProp(instance, `${columnName(x)}${y + 1}`, "text-align", align);
      }
    },
    setVerticalAlign: valign => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [x1, y1, x2, y2] = range;
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) setStyleProp(instance, `${columnName(x)}${y + 1}`, "vertical-align", valign);
      }
    },
    applyBorder: (kind, color, width = 1) => {
      const instance = instanceRef.current;
      const range = selectionRangeRef.current;
      if (!instance || !range) return;
      const [rx1, ry1, rx2, ry2] = range;
      const minX = Math.min(rx1, rx2), maxX = Math.max(rx1, rx2);
      const minY = Math.min(ry1, ry2), maxY = Math.max(ry1, ry2);
      const border = `${width}px solid ${color}`;
      const totalRows = instance.rows.length;
      const totalCols = instance.cols.length;
      type Side = "top" | "right" | "bottom" | "left";
      const SIDES: Side[] = ["top", "right", "bottom", "left"];
      // Cells here are separate boxes (border-collapse: separate), so one line between two cells
      // has two slots — this cell's edge and the neighbour's facing edge, whose default is a grey
      // gridline. Drawing in both would stack into a 2px line, so the line goes in one slot and
      // the neighbour's facing gridline is blanked out (NEUTRAL) to leave a single crisp line.
      const FACING: Record<Side, { dx: number; dy: number; side: Side }> = {
        top: { dx: 0, dy: -1, side: "bottom" }, bottom: { dx: 0, dy: 1, side: "top" },
        left: { dx: -1, dy: 0, side: "right" }, right: { dx: 1, dy: 0, side: "left" },
      };
      const name = (x: number, y: number) => `${columnName(x)}${y + 1}`;
      const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < totalCols && y < totalRows;

      // A shorthand `border` (from an .xlsx import or an earlier "all sides") would fight with
      // per-side values, so spread it onto the four sides first and drop the shorthand.
      const expandShorthand = (x: number, y: number) => {
        const cell = name(x, y);
        const shorthand = instance.getStyle(cell, "border");
        if (typeof shorthand !== "string" || !shorthand) return;
        // Read every side before dropping the shorthand — removing it wipes the four sides with it.
        const current = SIDES.map(side => instance.getStyle(cell, `border-${side}`));
        setStyleProp(instance, cell, "border", "");
        SIDES.forEach((side, index) => {
          const value = current[index];
          setStyleProp(instance, cell, `border-${side}`, typeof value === "string" && value ? value : shorthand);
        });
      };
      const setSide = (x: number, y: number, side: Side, value: string) => {
        if (!inGrid(x, y)) return;
        expandShorthand(x, y);
        setStyleProp(instance, name(x, y), `border-${side}`, value);
      };
      const NEUTRAL = "1px solid transparent";
      const setEdge = (x: number, y: number, side: Side, value: string) => {
        setSide(x, y, side, value);
        const facing = FACING[side];
        const nx = x + facing.dx, ny = y + facing.dy;
        if (!inGrid(nx, ny)) return;
        if (value === "") { setSide(nx, ny, facing.side, ""); return; }
        const existing = instance.getStyle(name(nx, ny), `border-${facing.side}`);
        if (!existing || existing === NEUTRAL) setSide(nx, ny, facing.side, NEUTRAL);
      };

      // Which edges of cell (x, y) this action draws.
      const edgesFor = (x: number, y: number): Side[] => {
        if (kind === "none") return SIDES;
        const edges: Side[] = [];
        if (kind === "all") {
          // Interior lines are drawn once, by the cell below / to the right of them.
          edges.push("top", "left");
          if (y === maxY) edges.push("bottom");
          if (x === maxX) edges.push("right");
          return edges;
        }
        const outer = kind === "outer";
        if ((outer || kind === "top") && y === minY) edges.push("top");
        if ((outer || kind === "bottom") && y === maxY) edges.push("bottom");
        if ((outer || kind === "left") && x === minX) edges.push("left");
        if ((outer || kind === "right") && x === maxX) edges.push("right");
        return edges;
      };

      // A single-side button toggles: if that whole edge already has this border, remove it.
      let value = kind === "none" ? "" : border;
      if (kind === "top" || kind === "bottom" || kind === "left" || kind === "right") {
        let allDrawn = true;
        for (let y = minY; y <= maxY && allDrawn; y++) {
          for (let x = minX; x <= maxX; x++) {
            if (edgesFor(x, y).includes(kind) && (instance.getStyle(name(x, y), `border-${kind}`) || instance.getStyle(name(x, y), "border")) !== border) { allDrawn = false; break; }
          }
        }
        if (allDrawn) value = "";
      }

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          for (const side of edgesFor(x, y)) {
            // Interior edges of an "all" / "clear" selection are shared with another selected cell,
            // which sets its own side too — only the selection's outer edge needs the neighbour.
            const isPerimeter = (side === "top" && y === minY) || (side === "bottom" && y === maxY) || (side === "left" && x === minX) || (side === "right" && x === maxX);
            if (isPerimeter) setEdge(x, y, side, value);
            else {
              setSide(x, y, side, value);
              // The neighbour that shares this interior line is inside the selection too — make sure
              // its own side of it isn't also drawn.
              if (value !== "") { const facing = FACING[side]; setSide(x + facing.dx, y + facing.dy, facing.side, ""); }
            }
          }
        }
      }
    },
    undo: () => undoStep(),
    redo: () => redoStep(),
  }), [value]);

  return <div ref={containerRef} className="etm-ipcr-grid-host" />;
});

export default IPCRGrid;
