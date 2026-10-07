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

/** Repeats row/column `line` (copy goes before or after it) and returns the new grid and fields. */
export function repeatLine(grid: IPCRGridData, fields: IPCRField[], axis: Axis, line: number, side: Side): { grid: IPCRGridData; fields: IPCRField[] } {
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
    if (lineOf(field.cell, axis) !== line) return;
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
    data.splice(at, 0, grid.data[line].map(value => typeof value === "string" ? retoken(value) : value));
  } else {
    data.forEach((row, rowIndex) => row.splice(at, 0, (() => { const value = grid.data[rowIndex][line]; return typeof value === "string" ? retoken(value) : value; })()));
  }

  // Per-cell maps (style, mixed-formatting text): shift everything at/after the new line, then copy the repeated line.
  const style: Record<string, string> = {};
  const richText: Record<string, IPCRRichTextRun[]> = {};
  Object.entries(grid.style).forEach(([cell, value]) => { style[shiftCell(cell)] = value; });
  Object.entries(grid.richText ?? {}).forEach(([cell, runs]) => { richText[shiftCell(cell)] = runs; });
  for (let cross = 0; cross < crossCount; cross++) {
    const source = cellAt(axis, line, cross);
    const copy = cellAt(axis, at, cross);
    if (grid.style[source]) style[copy] = grid.style[source];
    const runs = grid.richText?.[source];
    if (runs) richText[copy] = runs.map(run => ({ ...run, text: retoken(run.text) }));
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

  const nextFields = [
    ...fields.map(field => ({ ...field, cell: shiftCell(field.cell) })),
    ...clonedFields,
  ];
  return {
    grid: {
      ...grid,
      data, style, richText, mergeCells,
      ...(axis === "row" ? { rowHeights: shiftedSizes } : { colWidths: shiftedSizes }),
      expandable,
    },
    fields: nextFields,
  };
}
