import { cellCoords, cellName } from "./ipcrGridUtils";
import type { IPCRExpandable, IPCRField, IPCRGridData, IPCRRichTextRun } from "./types";

// "Breakpoints": a row or column the template's author tagged so the person filling in the IPCR can repeat it —
// e.g. add another OUTPUT row under row 41, or another column next to a rating. Repeating a line copies it whole:
// its text, formatting, borders, merges, size, and any fill-in fields in it (each gets its own new key, so the new
// copy is filled in separately from the original).

export type Axis = "row" | "col";
export type Side = "before" | "after";

export const EMPTY_EXPANDABLE: IPCRExpandable = { rows: {}, cols: {} };

function lineOf(cell: string, axis: Axis): number {
  const { col, row } = cellCoords(cell);
  return axis === "row" ? row : col;
}

function crossOf(cell: string, axis: Axis): number {
  const { col, row } = cellCoords(cell);
  return axis === "row" ? col : row;
}

function cellAt(axis: Axis, line: number, cross: number): string {
  return axis === "row" ? cellName(cross, line) : cellName(line, cross);
}

function shiftKeys<T>(record: Record<number, T> | undefined, at: number): Record<number, T> {
  const out: Record<number, T> = {};
  Object.entries(record ?? {}).forEach(([key, value]) => { const index = Number(key); out[index >= at ? index + 1 : index] = value; });
  return out;
}

// Smallest "<key>_<n>" not already used.
function freshKey(base: string, taken: Set<string>): { key: string; n: number } {
  const root = base.replace(/_\d+$/, "");
  for (let n = 2; ; n++) {
    const key = `${root}_${n}`;
    if (!taken.has(key)) return { key, n };
  }
}

/**
 * Repeats row/column `line` (copy goes before or after it) and returns the new grid and fields.
 * With `blank`, the new line is empty: no text, no fill-in fields, no colours or fonts — but it keeps the borders, merged
 * cells and size of the line it copies, so a new table row still looks like part of the table.
 * With `fieldsOnly`, the new line keeps the look of the one it copies and gets its own copy of every fill-in field in it
 * (so each input column of a repeating row has its own box), but the other text in the line — headings, labels such as
 * "OUTPUT #1" — is not repeated.
 */
export function repeatLine(grid: IPCRGridData, fields: IPCRField[], axis: Axis, line: number, side: Side, options: { blank?: boolean; fieldsOnly?: boolean } = {}): { grid: IPCRGridData; fields: IPCRField[] } {
  const blank = !!options.blank;
  const fieldsOnly = !!options.fieldsOnly;
  // Text in the copied line: all of it for a plain repeat, only the {{tokens}} for fieldsOnly, none for blank.
  const keepText = (value: string | number) => {
    if (blank) return "";
    if (typeof value !== "string") return fieldsOnly ? "" : value;
    if (!fieldsOnly) return retoken(value);
    return /\{\{[a-z][a-z0-9_]*\}\}/.test(value) ? retoken(value) : "";
  };
  const at = side === "after" ? line + 1 : line;          // index the new line takes
  const crossCount = axis === "row" ? (grid.data[0]?.length ?? 0) : grid.data.length;
  const shiftCell = (cell: string) => {
    const { col, row } = cellCoords(cell);
    const lineIndex = axis === "row" ? row : col;
    return lineIndex >= at ? (axis === "row" ? cellName(col, row + 1) : cellName(col + 1, row)) : cell;
  };

  // New keys for the fields living in the line being repeated.
  const taken = new Set(fields.map(field => field.key));
  const keyMap = new Map<string, string>();
  const clonedFields: IPCRField[] = [];
  fields.forEach(field => {
    if (blank || lineOf(field.cell, axis) !== line) return;
    const { key, n } = freshKey(field.key, taken);
    taken.add(key);
    keyMap.set(field.key, key);
    clonedFields.push({ ...field, key, label: `${field.label.replace(/ \(\d+\)$/, "")} (${n})`, cell: cellAt(axis, at, crossOf(field.cell, axis)) });
  });
  const retoken = (text: string) => {
    let out = text;
    keyMap.forEach((newKey, oldKey) => { out = out.split(`{{${oldKey}}}`).join(`{{${newKey}}}`); });
    return out;
  };

  // Cell text.
  const data = grid.data.map(row => row.slice());
  if (axis === "row") {
    data.splice(at, 0, grid.data[line].map(value => keepText(value)));
  } else {
    data.forEach((row, rowIndex) => row.splice(at, 0, keepText(grid.data[rowIndex][line])));
  }

  // Per-cell maps (style, mixed-formatting text): shift everything at/after the new line, then copy the repeated line.
  const style: Record<string, string> = {};
  const richText: Record<string, IPCRRichTextRun[]> = {};
  Object.entries(grid.style).forEach(([cell, value]) => { style[shiftCell(cell)] = value; });
  Object.entries(grid.richText ?? {}).forEach(([cell, runs]) => { richText[shiftCell(cell)] = runs; });
  for (let cross = 0; cross < crossCount; cross++) {
    const source = cellAt(axis, line, cross);
    const copy = cellAt(axis, at, cross);
    if (grid.style[source]) {
      // A blank copy keeps only the border lines (and not the fill colour, font or text style).
      const kept = blank ? grid.style[source].split(";").map(part => part.trim()).filter(part => /^border/i.test(part)).join("; ") : grid.style[source];
      if (kept) style[copy] = kept.endsWith(";") ? kept : `${kept};`;
    }
    const runs = grid.richText?.[source];
    if (runs && !blank && !fieldsOnly) richText[copy] = runs.map(run => ({ ...run, text: retoken(run.text) }));
  }

  // Merges: ones after the new line move; ones the new line lands inside grow; ones lying wholly in the repeated
  // line are copied. (A merge covering several lines of the one being repeated can't be copied sensibly, so it isn't.)
  const mergeCells: Record<string, [number, number]> = {};
  const copies: [string, [number, number]][] = [];
  Object.entries(grid.mergeCells).forEach(([anchor, [colspan, rowspan]]) => {
    const { col, row } = cellCoords(anchor);
    const start = axis === "row" ? row : col;
    const span = axis === "row" ? rowspan : colspan;
    if (start >= at) {
      mergeCells[shiftCell(anchor)] = [colspan, rowspan];
    } else if (start + span - 1 >= at) {
      mergeCells[anchor] = axis === "row" ? [colspan, rowspan + 1] : [colspan + 1, rowspan];
    } else {
      mergeCells[anchor] = [colspan, rowspan];
    }
    if (start === line && span === 1) copies.push([anchor, [colspan, rowspan]]);
  });
  copies.forEach(([anchor, spans]) => {
    const { col, row } = cellCoords(anchor);
    mergeCells[axis === "row" ? cellName(col, at) : cellName(at, row)] = spans;
  });

  // Sizes: the copy is as tall / wide as what it copies.
  const sizes = axis === "row" ? grid.rowHeights : grid.colWidths;
  const shiftedSizes = shiftKeys(sizes, at);
  if (sizes && sizes[line] !== undefined) shiftedSizes[at] = sizes[line];

  const expandable: IPCRExpandable = grid.expandable
    ? { rows: axis === "row" ? shiftKeys(grid.expandable.rows, at) : grid.expandable.rows, cols: axis === "col" ? shiftKeys(grid.expandable.cols, at) : grid.expandable.cols }
    : EMPTY_EXPANDABLE;

  // The copies sit right after the fields of the line they were copied from, so a repeating row's inputs stay together.
  const shifted = fields.map(field => ({ ...field, cell: shiftCell(field.cell) }));
  const lastOfLine = shifted.reduce((last, _field, index) => (lineOf(fields[index].cell, axis) === line ? index : last), -1);
  const nextFields = lastOfLine < 0 ? [...shifted, ...clonedFields] : [...shifted.slice(0, lastOfLine + 1), ...clonedFields, ...shifted.slice(lastOfLine + 1)];
  return {
    grid: {
      ...grid,
      data, style, richText, mergeCells,
      ...(axis === "row" ? { rowHeights: shiftedSizes } : { colWidths: shiftedSizes }),
      expandable,
      // A row added above a page break pushes the break down with the row it was in front of.
      ...(axis === "row" && grid.pageBreaks ? { pageBreaks: grid.pageBreaks.map(row => (row >= at ? row + 1 : row)) } : {}),
    },
    fields: nextFields,
  };
}

export interface AddResult { grid: IPCRGridData; fields: IPCRField[]; addedFields: IPCRField[] }

/**
 * Adds `count` rows / columns next to the tagged one at `index`. "after" ones go one after another after the ones already
 * added; "before" ones go just above it. If the row being copied has input fields the new rows get their own copies of those
 * inputs; otherwise they are empty rows that keep the borders and merges.
 */
export function addRepeatedLines(grid: IPCRGridData, fields: IPCRField[], axis: Axis, index: number, side: Side, count: number): AddResult {
  const key = axis === "row" ? "rows" : "cols";
  let current = grid;
  let currentFields = fields;
  let taggedIndex = index;
  const addedFields: IPCRField[] = [];
  for (let step = 0; step < count; step++) {
    // A tagged row remembers how many were added after it; an untagged one (any row the person picked) counts within this call.
    const mark = current.expandable?.[key]?.[taggedIndex];
    const already = mark ? mark.addedAfter ?? 0 : step;
    const source = side === "after" ? taggedIndex + already : taggedIndex;
    const hasInputs = currentFields.some(field => lineOf(field.cell, axis) === source);
    // A heading row spans the whole width; a row added under it must look like an item, not like the heading.
    const itemRow = axis === "row" && !hasInputs && isHeadingRow(current, source) ? findItemRow(current, source) : null;
    let result = repeatLine(current, currentFields, axis, source, side, hasInputs ? { fieldsOnly: true } : { blank: true });
    if (itemRow !== null) {
      const target = side === "after" ? source + 1 : source;
      result = { ...result, grid: applyRowLook(result.grid, itemRow >= target ? itemRow + 1 : itemRow, target) };
    }
    const resultMark = result.grid.expandable?.[key]?.[taggedIndex];
    if (side === "after" && resultMark && result.grid.expandable) result.grid.expandable[key][taggedIndex] = { ...resultMark, addedAfter: already + 1 };
    const known = new Set(currentFields.map(field => field.key));
    addedFields.push(...result.fields.filter(field => !known.has(field.key)));
    if (side === "before") taggedIndex += 1;           // the tagged row moved down one
    current = result.grid;
    currentFields = result.fields;
  }
  return { grid: current, fields: currentFields, addedFields };
}

/** The row to copy the look of when a new section (e.g. a Key Result Area) is added: the nearest tagged "section" row above `index`. */
export function findSectionRow(grid: IPCRGridData, index: number): number | null {
  const rows = Object.entries(grid.expandable?.rows ?? {}).filter(([, mark]) => mark.kind === "section").map(([row]) => Number(row)).sort((a, b) => a - b);
  if (!rows.length) return null;
  const above = rows.filter(row => row <= index);
  return above.length ? above[above.length - 1] : rows[0];
}

/**
 * Adds one new section row next to the tagged row at `index` (above or below it), looking like the nearest tagged section
 * heading — same fill, borders, merges and height — with `title` written in its heading cell.
 */
export function addSection(grid: IPCRGridData, fields: IPCRField[], index: number, side: Side, title: string, template?: { grid: IPCRGridData; row: number }): AddResult | null {
  // The look comes from a heading tagged in this sheet, or — for an IPCR made before the heading was tagged in the template —
  // from the template's own tagged heading.
  const ownRow = findSectionRow(grid, index);
  if (ownRow === null && !template) return null;
  const sourceRow = ownRow ?? template!.row;
  const styleGrid = ownRow === null ? template!.grid : null;
  const already = grid.expandable?.rows?.[index]?.addedAfter ?? 0;
  const next = side === "after" ? index + already : index;
  // An empty row is made next to the tagged one first (this also shifts every later row, field and merge correctly) ...
  const inserted = repeatLine(grid, fields, "row", next, side, { blank: true });
  const target = side === "after" ? next + 1 : next;
  const from = styleGrid ? sourceRow : sourceRow >= target ? sourceRow + 1 : sourceRow;
  const lookGrid = styleGrid ?? inserted.grid;
  const colCount = inserted.grid.data[0]?.length ?? 0;
  // ... then it is given the section heading's look.
  const style: Record<string, string> = { ...inserted.grid.style };
  for (let col = 0; col < colCount; col++) {
    delete style[cellName(col, target)];
    const source = lookGrid.style[cellName(col, from)];
    if (source) style[cellName(col, target)] = source;
  }
  const mergeCells: Record<string, [number, number]> = {};
  Object.entries(inserted.grid.mergeCells).forEach(([anchor, spans]) => { if (cellCoords(anchor).row !== target) mergeCells[anchor] = spans; });
  Object.entries(lookGrid.mergeCells).forEach(([anchor, spans]) => {
    const { col, row } = cellCoords(anchor);
    if (row === from && spans[1] === 1) mergeCells[cellName(col, target)] = spans;
  });
  const rowHeights = { ...(inserted.grid.rowHeights ?? {}) };
  const lookHeight = lookGrid.rowHeights?.[from];
  if (lookHeight !== undefined) rowHeights[target] = lookHeight; else delete rowHeights[target];
  const data = inserted.grid.data.map(line => line.slice());
  const titleCol = Math.max(0, (lookGrid.data[from] ?? []).findIndex(cell => String(cell ?? "").replace(/\{\{[a-z0-9_]+\}\}/g, "").trim() !== ""));
  data[target] = data[target].map((_cell, col) => (col === titleCol ? title : ""));
  const richText = inserted.grid.richText ? { ...inserted.grid.richText } : undefined;
  if (richText) Object.keys(richText).forEach(cell => { if (cellCoords(cell).row === target) delete richText[cell]; });
  return { grid: { ...inserted.grid, data, style, mergeCells, rowHeights, richText }, fields: inserted.fields, addedFields: [] };
}

/** A section-heading row: tagged as one, or one merged cell covering most of the table's width (the sheet may have spare columns beyond it). */
function isHeadingRow(grid: IPCRGridData, row: number): boolean {
  if (grid.expandable?.rows?.[row]?.kind === "section") return true;
  const merges = Object.entries(grid.mergeCells).filter(([anchor]) => cellCoords(anchor).row === row);
  if (merges.length !== 1 || merges[0][1][1] !== 1) return false;
  const colspan = merges[0][1][0];
  const widest = Math.max(0, ...Object.values(grid.mergeCells).filter(([, rowspan]) => rowspan === 1).map(([span]) => span));
  const width = grid.data[0]?.length ?? 0;
  return colspan >= 3 && (colspan >= width - 1 || colspan >= widest);
}

/** The nearest row tagged as a repeatable item (not a section heading), preferring the ones below `index`. */
function findItemRow(grid: IPCRGridData, index: number): number | null {
  const rows = Object.entries(grid.expandable?.rows ?? {}).filter(([, mark]) => mark.kind !== "section").map(([row]) => Number(row));
  if (!rows.length) return null;
  const below = rows.filter(row => row > index).sort((x, y) => x - y);
  const above = rows.filter(row => row < index).sort((x, y) => y - x);
  return below[0] ?? above[0] ?? null;
}

/** Gives row `target` the borders, merges and height of row `from` (no text, no fill-in values). */
function applyRowLook(grid: IPCRGridData, from: number, target: number): IPCRGridData {
  const colCount = grid.data[0]?.length ?? 0;
  const style: Record<string, string> = { ...grid.style };
  for (let col = 0; col < colCount; col++) {
    delete style[cellName(col, target)];
    const source = grid.style[cellName(col, from)];
    if (source) style[cellName(col, target)] = source;
  }
  const mergeCells: Record<string, [number, number]> = {};
  Object.entries(grid.mergeCells).forEach(([anchor, spans]) => { if (cellCoords(anchor).row !== target) mergeCells[anchor] = spans; });
  Object.entries(grid.mergeCells).forEach(([anchor, spans]) => {
    const { col, row } = cellCoords(anchor);
    if (row === from && spans[1] === 1) mergeCells[cellName(col, target)] = spans;
  });
  const rowHeights = { ...(grid.rowHeights ?? {}) };
  if (rowHeights[from] !== undefined) rowHeights[target] = rowHeights[from]; else delete rowHeights[target];
  const data = grid.data.map(line => line.slice());
  data[target] = data[target].map(() => "");
  const richText = grid.richText ? { ...grid.richText } : undefined;
  if (richText) Object.keys(richText).forEach(cell => { if (cellCoords(cell).row === target) delete richText[cell]; });
  return { ...grid, data, style, mergeCells, rowHeights, richText };
}
