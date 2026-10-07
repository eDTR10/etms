import { adjectivalRating, tokenKey, type IPCRField, type IPCRFieldValue, type IPCRGridData, type IPCRRichTextRun } from "./types";
import type { GroupedTask } from "../tasks/types";

export function composeGroupedTasksHtml(groupIds: number[], groups: GroupedTask[]): string {
  return groupIds
    .map(id => groups.find(group => group.id === id))
    .filter((group): group is GroupedTask => !!group)
    .map(group => `<div><strong>${group.name}</strong></div><ul>${group.tasks.map(task => `<li>${task.title}</li>`).join("") || "<li>(no tasks tagged yet)</li>"}</ul>`)
    .join("");
}

export function columnName(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

export function cellName(col: number, row: number): string {
  return `${columnName(col)}${row + 1}`;
}

export function cellCoords(name: string): { col: number; row: number } {
  const match = name.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { col: 0, row: 0 };
  let col = 0;
  for (const char of match[1]) col = col * 26 + (char.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(match[2]) - 1 };
}

export interface ParsedCellStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right" | "justify";
  valign?: "top" | "middle" | "bottom";
  fontFamily?: string;
  fontSize?: number;
  // CSS border shorthand values, e.g. "2px solid #000000" — same convention the Borders
  // toolbar button already writes via IPCRGrid's applyBorder (border-top/bottom/left/right).
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
}

// jspreadsheet reads styles back through the browser, which normalizes "#dbe5f1" to
// "rgb(219, 229, 241)" — pdfmake and the .xlsx writer only understand hex, so an unconverted
// rgb() fill rendered as solid black in the PDF. Everything that consumes cell styles goes
// through parseCellStyle, so normalizing there fixes fills, text color and borders at once.
const rgbColorPattern = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/gi;

function rgbToHex(_match: string, r: string, g: string, b: string, alpha?: string): string {
  if (alpha !== undefined && Number(alpha) === 0) return "transparent";
  const hex = [r, g, b].map(part => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}

export function normalizeCssColors(value: string): string {
  return value.replace(rgbColorPattern, rgbToHex);
}

export function parseCellStyle(style: string | undefined): ParsedCellStyle {
  const parsed: ParsedCellStyle = { bold: false, italic: false, underline: false };
  if (!style) return parsed;
  for (const rule of style.split(";")) {
    const [rawKey, rawValue] = rule.split(":");
    if (!rawKey || !rawValue) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim();
    if (key === "font-weight" && (value === "bold" || Number(value) >= 600)) parsed.bold = true;
    else if (key === "font-style" && value === "italic") parsed.italic = true;
    else if (key === "text-decoration" && value.includes("underline")) parsed.underline = true;
    else if (key === "color") { const color = normalizeCssColors(value); if (color !== "transparent") parsed.color = color; }
    else if (key === "background-color") { const color = normalizeCssColors(value); if (color !== "transparent") parsed.backgroundColor = color; }
    else if (key === "text-align") parsed.align = value as ParsedCellStyle["align"];
    else if (key === "vertical-align") parsed.valign = value === "middle" ? "middle" : value === "bottom" ? "bottom" : "top";
    else if (key === "font-family") parsed.fontFamily = value.replace(/^["']|["']$/g, "");
    else if (key === "font-size") { const size = parseFloat(value); if (!Number.isNaN(size)) parsed.fontSize = size; }
    else if (key === "border-top") parsed.borderTop = normalizeCssColors(value);
    else if (key === "border-bottom") parsed.borderBottom = normalizeCssColors(value);
    else if (key === "border-left") parsed.borderLeft = normalizeCssColors(value);
    else if (key === "border-right") parsed.borderRight = normalizeCssColors(value);
  }
  return parsed;
}

export function hexToArgb(hex: string): string | null {
  const match = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `FF${match[1].toUpperCase()}` : null;
}

// Inverse of hexToArgb — exceljs cell.font.color/cell.fill.fgColor come back as 8-hex-digit
// ARGB ("FFRRGGBB"); the grid's own style strings (parseCellStyle) want plain "#rrggbb".
export function argbToHex(argb: string | undefined): string | undefined {
  if (!argb) return undefined;
  const match = argb.trim().match(/^[0-9a-fA-F]{2}([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : undefined;
}

// Excel/exceljs represents one border side as {style, color}; the grid's own style strings want
// a plain CSS border shorthand ("1px solid #rrggbb"), matching what the Borders toolbar button
// (IPCRGrid.applyBorder) already writes. Only a handful of Excel border styles are distinguishable
// in a thin CSS line — "thick"/"double" render as a visibly heavier 2px line, everything else 1px.
export function borderSideToCss(side: { style?: string; color?: { argb?: string } } | undefined): string | undefined {
  if (!side || !side.style) return undefined;
  const width = side.style === "thick" || side.style === "double" ? "2px" : "1px";
  const cssStyle = side.style === "dashed" ? "dashed" : side.style === "dotted" || side.style === "hair" ? "dotted" : side.style === "double" ? "double" : "solid";
  const color = argbToHex(side.color?.argb) ?? "#000000";
  return `${width} ${cssStyle} ${color}`;
}

// Inverse of borderSideToCss — used when writing a template's grid back out to .xlsx.
export function cssBorderToExcelSide(css: string | undefined): { style: "thin" | "medium" | "dashed" | "hair" | "double"; color: { argb: string } } | undefined {
  if (!css) return undefined;
  const [widthPart, styleWord, colorHex] = css.trim().split(/\s+/);
  const widthPx = parseFloat(widthPart) || 1;
  const style = styleWord === "dashed" ? "dashed" : styleWord === "dotted" ? "hair" : styleWord === "double" ? "double" : widthPx >= 2 ? "medium" : "thin";
  return { style, color: { argb: hexToArgb(colorHex ?? "#000000") ?? "FF000000" } };
}

// Inverse of parseCellStyle — builds the semicolon-separated style string the grid (and
// parseCellStyle/the .xlsx & PDF export) expect, from the pieces an .xlsx IMPORT reads off
// an ExcelJS cell.
export function buildCellStyleString(parsed: {
  bold?: boolean; italic?: boolean; underline?: boolean;
  color?: string; backgroundColor?: string; align?: string; valign?: string;
  fontFamily?: string; fontSize?: number;
  borderTop?: string; borderBottom?: string; borderLeft?: string; borderRight?: string;
}): string {
  const rules: string[] = [];
  if (parsed.bold) rules.push("font-weight:bold");
  if (parsed.italic) rules.push("font-style:italic");
  if (parsed.underline) rules.push("text-decoration:underline");
  if (parsed.color) rules.push(`color:${parsed.color}`);
  if (parsed.backgroundColor) rules.push(`background-color:${parsed.backgroundColor}`);
  if (parsed.align) rules.push(`text-align:${parsed.align}`);
  if (parsed.valign) rules.push(`vertical-align:${parsed.valign}`);
  if (parsed.fontFamily) rules.push(`font-family:${parsed.fontFamily}`);
  if (parsed.fontSize) rules.push(`font-size:${parsed.fontSize}`);
  if (parsed.borderTop) rules.push(`border-top:${parsed.borderTop}`);
  if (parsed.borderBottom) rules.push(`border-bottom:${parsed.borderBottom}`);
  if (parsed.borderLeft) rules.push(`border-left:${parsed.borderLeft}`);
  if (parsed.borderRight) rules.push(`border-right:${parsed.borderRight}`);
  return rules.join(";");
}

// Cell content in the spreadsheet grid (and its .xlsx/PDF export) is plain text — flatten rich
// HTML from a textarea/grouped_tasks field down to readable plain text (bullets, line breaks)
// rather than dropping it, since a grid cell can't render bold/italic/underline runs.
export function richTextToPlainText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("li").forEach(li => { li.textContent = `• ${li.textContent}`; });
  container.querySelectorAll("p, div, li, br").forEach(node => { node.after(document.createTextNode("\n")); });
  return (container.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export function flattenRuns(runs: IPCRRichTextRun[]): string {
  return runs.map(run => run.text).join("");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Renders runs as the same <b>/<i>/<u> markup IPCRRichTextField's contentEditable (document.
// execCommand) produces — used both to seed that editor and to draw the read-only grid overlay.
export function runsToHtml(runs: IPCRRichTextRun[]): string {
  return runs.map(run => {
    let html = escapeHtml(run.text).replace(/\n/g, "<br>");
    if (run.bold) html = `<b>${html}</b>`;
    if (run.italic) html = `<i>${html}</i>`;
    if (run.underline) html = `<u>${html}</u>`;
    return html;
  }).join("");
}

// Inverse of runsToHtml — walks IPCRRichTextField's HTML output back into runs. Handles the
// tags document.execCommand actually produces (b/strong, i/em, u, br) plus block elements
// (div/p/li) as line breaks, since a pasted/typed cell can still contain paragraph breaks.
export function htmlToRuns(html: string): IPCRRichTextRun[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  const runs: IPCRRichTextRun[] = [];

  function walk(node: ChildNode, bold: boolean, italic: boolean, underline: boolean) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) runs.push({ text, bold: bold || undefined, italic: italic || undefined, underline: underline || undefined });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") { runs.push({ text: "\n" }); return; }
    const nextBold = bold || tag === "b" || tag === "strong" || element.style.fontWeight === "bold" || Number(element.style.fontWeight) >= 600;
    const nextItalic = italic || tag === "i" || tag === "em";
    const nextUnderline = underline || tag === "u" || element.style.textDecoration.includes("underline");
    element.childNodes.forEach(child => walk(child, nextBold, nextItalic, nextUnderline));
    if (tag === "div" || tag === "p" || tag === "li") runs.push({ text: "\n" });
  }
  container.childNodes.forEach(node => walk(node, false, false, false));
  while (runs.length && runs[runs.length - 1].text === "\n") runs.pop();
  return runs.filter(run => run.text !== "");
}

// A run set is only worth keeping as rich text — and rendering via the (fragile, DOM-measured)
// grid overlay — if it actually carries mixed formatting that would look different cell-wide.
// A single run, or several runs that all share the same bold/italic/underline (e.g. Excel
// sometimes splits a uniformly-bold cell into multiple runs for reasons that don't affect how
// this app renders it, like a superscript-only difference), is indistinguishable from an
// ordinary uniformly-styled cell here — callers use this to skip the overlay for those and just
// fold the shared style into the cell's own one-style-per-cell model instead.
export function runsNeedRichText(runs: IPCRRichTextRun[]): boolean {
  if (runs.length <= 1) return false;
  const first = runs[0];
  return runs.some(run => !!run.bold !== !!first.bold || !!run.italic !== !!first.italic || !!run.underline !== !!first.underline);
}

function formatFieldValue(field: IPCRField, value: IPCRFieldValue): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "date") {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  if (field.type === "rating") return `${value} — ${adjectivalRating(Number(value))}`;
  if (field.type === "textarea" || field.type === "grouped_tasks") return richTextToPlainText(String(value));
  return String(value);
}

// Replaces every "{{key}}" token in the grid's data with its filled-in value (formatted per
// field type), keeping style/merge/column widths untouched — used for both the live preview
// and the xlsx/pdf export, so what you see is what gets exported.
export function fillGrid(grid: IPCRGridData, fields: IPCRField[], values: Record<string, IPCRFieldValue>): IPCRGridData {
  const byKey = new Map(fields.map(field => [field.key, field]));
  const filledCells = new Set<string>();
  const data = grid.data.map((row, rowIndex) => row.map((cell, colIndex) => {
    const key = tokenKey(cell);
    if (!key) return cell;
    const field = byKey.get(key);
    if (!field) return cell;
    filledCells.add(cellName(colIndex, rowIndex));
    return formatFieldValue(field, values[key] ?? null);
  }));
  // A token cell isn't also a richText cell in practice, but if grid.richText somehow still had
  // a stale entry for one, dropping it here keeps the overlay from showing old formatted text
  // over the freshly filled-in value.
  const richText = grid.richText && filledCells.size
    ? Object.fromEntries(Object.entries(grid.richText).filter(([cell]) => !filledCells.has(cell)))
    : grid.richText;
  return { ...grid, data, richText };
}

export function computeFinalRating(fields: IPCRField[], values: Record<string, IPCRFieldValue>): number | null {
  const scores = fields
    .filter(field => field.type === "rating")
    .map(field => values[field.key])
    .filter((value): value is number | string => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(value => !Number.isNaN(value));
  return scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100) / 100 : null;
}
