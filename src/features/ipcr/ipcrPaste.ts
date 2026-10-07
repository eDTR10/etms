import { runsNeedRichText } from "./ipcrGridUtils";
import type { IPCRRichTextRun } from "./types";

// Reads the HTML a spreadsheet puts on the clipboard (Google Sheets writes a <table> whose cells
// carry their formatting as inline styles; merged cells are colspan/rowspan; column widths are in
// a <colgroup> and row heights on each <tr>) into the pieces the IPCR grid understands.
//
// Only INLINE styles are read on purpose: Google Sheets also ships a <style> block declaring a
// grey 1px border for every td, which is just its on-screen gridline, not a real border.

export interface PastedCell {
  text: string;
  // CSS property -> value, using only the properties the grid stores (see MANAGED_PROPERTIES).
  style: Record<string, string>;
  // Present only when the cell mixes formatting (e.g. one bold word in a sentence).
  runs?: IPCRRichTextRun[];
  // Whether the source cell wraps its text. When it doesn't, long text spills across the empty cells
  // next to it, which the grid can only imitate by merging (see spillOverMerges).
  wrap: boolean;
}

export interface ParsedPaste {
  rows: number;
  cols: number;
  // [row][col]; null where the position is covered by a merged cell's anchor.
  cells: (PastedCell | null)[][];
  merges: { row: number; col: number; colspan: number; rowspan: number }[];
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
}

// Every property a paste owns. A pasted cell either sets one of these or explicitly clears it, so
// the destination ends up looking like the source rather than a mix of old and new formatting.
export const MANAGED_PROPERTIES = [
  "font-weight", "font-style", "text-decoration", "color", "background-color", "text-align", "vertical-align",
  "font-family", "font-size", "padding-left", "border", "border-top", "border-right", "border-bottom", "border-left",
] as const;

let colorContext: CanvasRenderingContext2D | null | undefined;

// "rgb(0, 0, 0)", "#000", "black", "rgba(...)" -> "#rrggbb", or "" for none/transparent.
function toHex(value: string): string {
  const color = value.trim().toLowerCase();
  if (!color || color === "transparent" || color === "none" || color === "inherit" || color === "initial") return "";
  const rgb = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (rgb) {
    if (rgb[4] !== undefined && parseFloat(rgb[4]) === 0) return "";
    return `#${[rgb[1], rgb[2], rgb[3]].map(part => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
  }
  const hex = color.match(/^#([0-9a-f]{3})$/);
  if (hex) return `#${hex[1].split("").map(char => char + char).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  // Named colours (white, red, ...): let a canvas normalise them to #rrggbb.
  if (colorContext === undefined) colorContext = document.createElement("canvas").getContext("2d");
  if (!colorContext) return "";
  colorContext.fillStyle = "#010203";
  colorContext.fillStyle = color;
  const resolved = colorContext.fillStyle;
  return resolved === "#010203" && color !== "#010203" ? "" : resolved;
}

function toPixels(value: string): number | null {
  const match = value.trim().match(/^(-?\d*\.?\d+)\s*(px|pt)?$/i);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  return match[2]?.toLowerCase() === "pt" ? (amount * 96) / 72 : amount;
}

// "1px solid rgb(0, 0, 0)" -> "1px solid #000000"; "" when there's no visible line.
function toBorder(value: string): string {
  const match = value.trim().match(/^(\S+)\s+(solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(.+)$/i);
  if (!match) return "";
  const width = toPixels(match[1]);
  const color = toHex(match[3]);
  if (width === null || width <= 0 || !color) return "";
  const style = match[2].toLowerCase();
  return `${Math.min(3, Math.max(1, Math.round(width)))}px ${style === "dashed" || style === "dotted" || style === "double" ? style : "solid"} ${color}`;
}

function readStyle(element: HTMLElement): Record<string, string> {
  const style = element.style;
  const out: Record<string, string> = {};
  const weight = style.fontWeight;
  if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) out["font-weight"] = "bold";
  if (style.fontStyle === "italic") out["font-style"] = "italic";
  if (style.textDecoration.includes("underline") || style.textDecorationLine.includes("underline")) out["text-decoration"] = "underline";
  const color = toHex(style.color);
  if (color) out["color"] = color;
  const background = toHex(style.backgroundColor);
  if (background) out["background-color"] = background;
  if (["left", "center", "right"].includes(style.textAlign)) out["text-align"] = style.textAlign;
  if (["top", "middle", "bottom"].includes(style.verticalAlign)) out["vertical-align"] = style.verticalAlign;
  const family = style.fontFamily.split(",")[0]?.replace(/["']/g, "").trim();
  if (family) out["font-family"] = family;
  const size = toPixels(style.fontSize);
  if (size) out["font-size"] = `${Math.round(size)}px`;
  // Indent: Google Sheets writes it as extra left padding on top of the usual 3px.
  const indent = toPixels(style.paddingLeft);
  if (indent && indent > 8) out["padding-left"] = `${Math.round(indent - 3)}px`;
  const sides = { "border-top": style.borderTop, "border-right": style.borderRight, "border-bottom": style.borderBottom, "border-left": style.borderLeft };
  for (const [side, raw] of Object.entries(sides)) {
    const border = toBorder(raw);
    if (border) out[side] = border;
  }
  return out;
}

function collectRuns(node: Node, inherited: Omit<IPCRRichTextRun, "text">, into: IPCRRichTextRun[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/ /g, " ");
    if (text) into.push({ text, ...inherited });
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.tagName === "BR") { into.push({ text: "\n", ...inherited }); return; }
  const own = readStyle(node);
  const href = node.tagName === "A" ? node.getAttribute("href") ?? undefined : undefined;
  const next = {
    link: href ?? inherited.link,
    bold: inherited.bold || own["font-weight"] === "bold" || node.tagName === "B" || node.tagName === "STRONG",
    italic: inherited.italic || own["font-style"] === "italic" || node.tagName === "I" || node.tagName === "EM",
    underline: inherited.underline || own["text-decoration"] === "underline" || node.tagName === "U",
  };
  node.childNodes.forEach(child => collectRuns(child, next, into));
}

function cleanRuns(runs: IPCRRichTextRun[]): IPCRRichTextRun[] {
  const merged: IPCRRichTextRun[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && !!last.bold === !!run.bold && !!last.italic === !!run.italic && !!last.underline === !!run.underline && last.link === run.link) last.text += run.text;
    else merged.push({ ...run });
  }
  return merged;
}

// A non-wrapping cell in Google Sheets lets its text run over the empty cells to its right. The
// grid wraps every cell, so a long line would instead fold into a narrow column and balloon the row.
// Merge the cell across just enough empty neighbours for the text to fit on one line.
function spillOverMerges(cells: (PastedCell | null)[][], merges: ParsedPaste["merges"], colWidths: Record<number, number>, rows: number, cols: number): ParsedPaste["merges"] {
  const DEFAULT_WIDTH = 100;
  const width = (col: number) => colWidths[col] ?? DEFAULT_WIDTH;
  const taken = new Set<string>();
  merges.forEach(merge => {
    for (let r = merge.row; r < merge.row + merge.rowspan; r++) for (let c = merge.col; c < merge.col + merge.colspan; c++) taken.add(`${r},${c}`);
  });
  const added: ParsedPaste["merges"] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const cell = cells[r][c];
      if (!cell || cell.wrap || taken.has(`${r},${c}`) || !cell.text.trim() || cell.text.includes("\n")) continue;
      const align = cell.style["text-align"];
      if (align === "center" || align === "right") continue;
      const fontSize = parseFloat(cell.style["font-size"] ?? "") || 13;
      const needed = cell.text.length * fontSize * (cell.style["font-weight"] === "bold" ? 0.6 : 0.52) + (parseFloat(cell.style["padding-left"] ?? "") || 0) + 10;
      let available = width(c);
      let end = c;
      while (available < needed && end + 1 < cols) {
        const next = cells[r][end + 1];
        if (!next || taken.has(`${r},${end + 1}`) || next.text.trim() || next.style["border-left"]) break;
        end++;
        available += width(end);
      }
      if (end === c) continue;
      for (let k = c; k <= end; k++) { taken.add(`${r},${k}`); if (k > c) cells[r][k] = null; }
      added.push({ row: r, col: c, colspan: end - c + 1, rowspan: 1 });
    }
  }
  return added;
}

export function parseClipboardTable(html: string): ParsedPaste | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;

  const cells: (PastedCell | null)[][] = [];
  const occupied: boolean[][] = [];
  const merges: ParsedPaste["merges"] = [];
  const rowHeights: Record<number, number> = {};
  let cols = 0;

  Array.from(table.rows).forEach((tr, rowIndex) => {
    cells[rowIndex] ??= [];
    occupied[rowIndex] ??= [];
    const height = toPixels(tr.style.height || tr.getAttribute("height") || "");
    if (height) rowHeights[rowIndex] = Math.round(height);
    let col = 0;
    Array.from(tr.cells).forEach(td => {
      while (occupied[rowIndex][col]) col++;
      const colspan = Math.max(1, parseInt(td.getAttribute("colspan") ?? "1", 10) || 1);
      const rowspan = Math.max(1, parseInt(td.getAttribute("rowspan") ?? "1", 10) || 1);

      const style = readStyle(td);
      const runs: IPCRRichTextRun[] = [];
      td.childNodes.forEach(child => collectRuns(child, {}, runs));
      const cleaned = cleanRuns(runs);
      let rich: IPCRRichTextRun[] | undefined;
      if (cleaned.length && runsNeedRichText(cleaned)) rich = cleaned;
      else if (cleaned.length) {
        // One uniform run (a whole cell in bold, say): that belongs in the cell's own style.
        const only = cleaned[0];
        if (only.bold) style["font-weight"] = "bold";
        if (only.italic) style["font-style"] = "italic";
        if (only.underline) style["text-decoration"] = "underline";
      }
      const text = cleaned.map(run => run.text).join("").replace(/\n+$/, "");

      const wraps = ["normal", "pre-wrap", "pre-line", "break-spaces"].includes(td.style.whiteSpace) || td.style.wordWrap === "break-word" || td.style.overflowWrap === "break-word";
      cells[rowIndex][col] = { text, style, runs: rich, wrap: wraps };
      for (let r = 0; r < rowspan; r++) {
        for (let c = 0; c < colspan; c++) {
          occupied[rowIndex + r] ??= [];
          occupied[rowIndex + r][col + c] = true;
          if (r === 0 && c === 0) continue;
          cells[rowIndex + r] ??= [];
          cells[rowIndex + r][col + c] = null;
        }
      }
      if (colspan > 1 || rowspan > 1) merges.push({ row: rowIndex, col, colspan, rowspan });
      col += colspan;
      cols = Math.max(cols, col);
    });
  });

  if (!cells.length || !cols) return null;

  // Column widths first: the spill-over pass below needs them to know how far text reaches.
  const colWidths: Record<number, number> = {};
  Array.from(table.querySelectorAll("col")).forEach((col, index) => {
    const width = toPixels(col.getAttribute("width") ?? col.style.width ?? "");
    if (width) colWidths[index] = Math.round(width);
  });
  for (let r = 0; r < cells.length; r++) {
    cells[r] ??= [];
    for (let c = 0; c < cols; c++) if (cells[r][c] === undefined) cells[r][c] = { text: "", style: {}, wrap: true };
  }
  // Done on the full table, BEFORE trimming: a long note in the last filled column needs the empty
  // columns beyond it to spill into.
  merges.push(...spillOverMerges(cells, merges, colWidths, cells.length, cols));

  // Copying a whole sheet ("select all") brings every empty cell of the sheet's nominal grid
  // (often 1000 rows x 26 columns) along. Keep only up to the last row/column that holds
  // something: text, a border, or a fill that isn't plain white.
  let lastRow = -1;
  let lastCol = -1;
  cells.forEach((line, r) => line?.forEach((cell, c) => {
    if (!cell) return;
    const style = cell.style;
    const background = style["background-color"];
    const visible = cell.text.trim() !== "" || !!style["border-top"] || !!style["border-right"] || !!style["border-bottom"] || !!style["border-left"]
      || (!!background && background !== "#ffffff");
    if (visible) { lastRow = Math.max(lastRow, r); lastCol = Math.max(lastCol, c); }
  }));
  merges.forEach(merge => {
    lastRow = Math.max(lastRow, merge.row + merge.rowspan - 1);
    lastCol = Math.max(lastCol, merge.col + merge.colspan - 1);
  });
  if (lastRow < 0 || lastCol < 0) return null;

  const rows = lastRow + 1;
  cols = lastCol + 1;
  cells.length = rows;
  // Fill any holes (ragged rows) so every position is addressable.
  for (let r = 0; r < rows; r++) {
    cells[r] ??= [];
    cells[r].length = cols;
    for (let c = 0; c < cols; c++) if (cells[r][c] === undefined) cells[r][c] = { text: "", style: {}, wrap: true };
  }

  Object.keys(colWidths).forEach(col => { if (Number(col) >= cols) delete colWidths[Number(col)]; });
  Object.keys(rowHeights).forEach(row => { if (Number(row) >= rows) delete rowHeights[Number(row)]; });

  return { rows, cols, cells, merges: merges.filter(merge => merge.row < rows && merge.col < cols), colWidths, rowHeights };
}
