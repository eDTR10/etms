import { adjectivalRating, MONTH_NAMES, type IPCRField, type IPCRFieldValue, type IPCRGridData, type IPCRRichTextRun } from "./types";
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

// The grid reads styles back from the browser (element.style), which rewrites every colour as
// "rgb(r, g, b)" — but the PDF/.xlsx builders only understand hex. Without this, any fill or text
// colour that was set in the designer came out black in the PDF and was dropped from the .xlsx.
export function normalizeCssColors(value: string): string {
  return value.replace(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)/gi, (_match, red: string, green: string, blue: string, alpha?: string) => {
    if (alpha !== undefined && parseFloat(alpha) === 0) return "transparent";
    return `#${[red, green, blue].map(part => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
  });
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

export function parseCellStyle(style: string | undefined): ParsedCellStyle {
  const parsed: ParsedCellStyle = { bold: false, italic: false, underline: false };
  if (!style) return parsed;
  for (const rule of style.split(";")) {
    const [rawKey, rawValue] = rule.split(":");
    if (!rawKey || !rawValue) continue;
    const key = rawKey.trim().toLowerCase();
    const value = normalizeCssColors(rawValue.trim());
    if (key === "font-weight" && (value === "bold" || Number(value) >= 600)) parsed.bold = true;
    else if (key === "font-style" && value === "italic") parsed.italic = true;
    else if (key === "text-decoration" && value.includes("underline")) parsed.underline = true;
    else if (key === "color") parsed.color = value;
    else if (key === "background-color") parsed.backgroundColor = value;
    else if (key === "text-align") parsed.align = value as ParsedCellStyle["align"];
    else if (key === "vertical-align") parsed.valign = value === "middle" ? "middle" : value === "bottom" ? "bottom" : "top";
    else if (key === "font-family") parsed.fontFamily = value.replace(/^["']|["']$/g, "");
    else if (key === "font-size") { const size = parseFloat(value); if (!Number.isNaN(size)) parsed.fontSize = size; }
    else if (key === "border-top") parsed.borderTop = value;
    else if (key === "border-bottom") parsed.borderBottom = value;
    else if (key === "border-left") parsed.borderLeft = value;
    else if (key === "border-right") parsed.borderRight = value;
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
    if (run.link) html = `<a href="${escapeHtml(run.link).replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">${html}</a>`;
    return html;
  }).join("");
}

// Same as runsToHtml, but for seeding the formatting EDITOR: lines that start with a "• " bullet come back as a real
// bulleted list (indented, continues on Enter), because that is what they were typed as and what the bullet shortcut makes.
export function runsToEditorHtml(runs: IPCRRichTextRun[]): string {
  const lines: IPCRRichTextRun[][] = [[]];
  runs.forEach(run => {
    run.text.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...run, text: part });
    });
  });
  const isBullet = (line: IPCRRichTextRun[] | undefined) => !!line && !!line[0] && line[0].text.startsWith("\u2022 ");
  let html = "";
  let inList = false;
  lines.forEach((line, index) => {
    if (isBullet(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      const content = [{ ...line[0], text: line[0].text.slice(2) }, ...line.slice(1)].filter(run => run.text);
      // A bullet with nothing after it is a leftover, not an item worth showing.
      if (!content.length) return;
      html += `<li>${runsToHtml(content)}</li>`;
      return;
    }
    if (inList) { html += "</ul>"; inList = false; }
    html += runsToHtml(line);
    // A plain line only needs a <br> when the next line is plain too (a list is a block of its own).
    if (index < lines.length - 1 && !isBullet(lines[index + 1])) html += "<br>";
  });
  if (inList) html += "</ul>";
  return html;
}

// A grouped task's heading carries a "(done/total)" count — "eGov Booth(2/2)" — that follows the bullets under it.
// Recounts the "• " lines and rewrites the count on the first line; text without such a count is left alone.
export function syncTaskCount(runs: IPCRRichTextRun[]): IPCRRichTextRun[] {
  const text = flattenRuns(runs);
  const lines = text.split("\n");
  const match = lines[0].match(/\(\d+\/\d+\)\s*$/);
  if (!match || match.index === undefined) return runs;
  const total = lines.slice(1).filter(line => line.startsWith("• ") && line.slice(2).trim()).length;
  return replaceRunsRange(runs, match.index, match.index + match[0].length, `(${total}/${total})`);
}

// http(s):// and www. addresses typed or pasted into plain text become links without any extra step.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

function autoLink(runs: IPCRRichTextRun[]): IPCRRichTextRun[] {
  const out: IPCRRichTextRun[] = [];
  runs.forEach(run => {
    if (run.link || !URL_PATTERN.test(run.text)) { out.push(run); return; }
    URL_PATTERN.lastIndex = 0;
    let last = 0;
    for (const match of run.text.matchAll(URL_PATTERN)) {
      // Trailing punctuation belongs to the sentence, not the address.
      const url = match[0].replace(/[.,;:!?)\]]+$/, "");
      const start = match.index ?? 0;
      if (start > last) out.push({ ...run, text: run.text.slice(last, start) });
      out.push({ ...run, text: url, link: /^www\./i.test(url) ? `https://${url}` : url });
      last = start + url.length;
    }
    if (last < run.text.length) out.push({ ...run, text: run.text.slice(last) });
  });
  return out;
}

// Inverse of runsToHtml — walks IPCRRichTextField's HTML output back into runs. Handles the
// tags document.execCommand actually produces (b/strong, i/em, u, a, br, ul/ol/li) plus block
// elements (div/p) as line breaks. A block always STARTS on a new line: pressing Enter in the
// editor makes a <div> after a plain text line, and without the break its text ran on straight
// after the previous line's last word.
export function htmlToRuns(html: string): IPCRRichTextRun[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  const runs: IPCRRichTextRun[] = [];

  const startLine = () => {
    if (runs.length && !runs[runs.length - 1].text.endsWith("\n")) runs.push({ text: "\n" });
  };

  function walk(node: ChildNode, bold: boolean, italic: boolean, underline: boolean, link?: string) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\u00a0/g, " ");
      if (text) runs.push({ text, bold: bold || undefined, italic: italic || undefined, underline: underline || undefined, link });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") { runs.push({ text: "\n" }); return; }
    const nextBold = bold || tag === "b" || tag === "strong" || element.style.fontWeight === "bold" || Number(element.style.fontWeight) >= 600;
    const nextItalic = italic || tag === "i" || tag === "em";
    const nextUnderline = underline || tag === "u" || element.style.textDecoration.includes("underline");
    const nextLink = tag === "a" ? (element.getAttribute("href") ?? link) : link;
    if (tag === "ul" || tag === "ol") {
      startLine();
      let number = 0;
      element.childNodes.forEach(child => {
        // Pressing Enter to leave a list leaves an empty <li><br></li> behind: that is a blank line, not a bullet.
        if ((child as HTMLElement).tagName?.toLowerCase() === "li" && !(child.textContent ?? "").replace(/\u00a0/g, " ").trim()) return;
        if ((child as HTMLElement).tagName?.toLowerCase() === "li") {
          number++;
          startLine();
          runs.push({ text: tag === "ul" ? "\u2022 " : `${number}. ` });
          child.childNodes.forEach(grandChild => walk(grandChild, nextBold, nextItalic, nextUnderline, nextLink));
          runs.push({ text: "\n" });
        } else {
          walk(child, nextBold, nextItalic, nextUnderline, nextLink);
        }
      });
      return;
    }
    const isBlock = tag === "div" || tag === "p" || tag === "li";
    if (isBlock) startLine();
    element.childNodes.forEach(child => walk(child, nextBold, nextItalic, nextUnderline, nextLink));
    if (isBlock) runs.push({ text: "\n" });
  }
  container.childNodes.forEach(node => walk(node, false, false, false));
  while (runs.length && runs[runs.length - 1].text === "\n") runs.pop();
  // Several newlines in a row from nested blocks collapse to the ones that were really typed.
  return autoLink(runs.filter(run => run.text !== ""));
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
  return runs.some(run => !!run.bold !== !!first.bold || !!run.italic !== !!first.italic || !!run.underline !== !!first.underline || run.link !== first.link);
}

function formatFieldValue(field: IPCRField, value: IPCRFieldValue): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "date") {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  if (field.type === "month") return MONTH_NAMES[Number(value) - 1] ?? String(value);
  if (field.type === "year") return String(value);
  if (field.type === "rating") return `${value} — ${adjectivalRating(Number(value))}`;
  if (field.type === "textarea" || field.type === "grouped_tasks") return richTextToPlainText(String(value));
  return String(value);
}

// Replaces every "{{key}}" token in the grid's data with its filled-in value (formatted per
// field type), keeping style/merge/column widths untouched — used for both the live preview
// and the xlsx/pdf export, so what you see is what gets exported.
const TOKEN_TEST = /\{\{[a-z][a-z0-9_]*\}\}/;
const TOKEN_EVERYWHERE = /\{\{([a-z][a-z0-9_]*)\}\}/g;

// Replaces the text between `start` and `end` (positions in the runs' combined text) with `replacement`,
// which takes the formatting of the run it lands in — so a field made from a bold word stays bold.
export function replaceRunsRange(runs: IPCRRichTextRun[], start: number, end: number, replacement: string): IPCRRichTextRun[] {
  const clamp = (value: number, length: number) => Math.max(0, Math.min(length, value));
  const total = runs.reduce((sum, run) => sum + run.text.length, 0);
  const insertAt = Math.min(start, total);
  let position = 0;
  let inserted = false;
  const out = runs.map((run, index) => {
    const runStart = position;
    const runEnd = position + run.text.length;
    position = runEnd;
    const before = run.text.slice(0, clamp(start - runStart, run.text.length));
    const after = run.text.slice(clamp(end - runStart, run.text.length));
    const holdsInsertion = !inserted && ((insertAt >= runStart && insertAt < runEnd) || (index === runs.length - 1));
    if (holdsInsertion) inserted = true;
    return { ...run, text: holdsInsertion ? before + replacement + after : before + after };
  });
  return out.filter(run => run.text.length > 0);
}

// Fills every {{field}} token in the sheet — a token can be a cell's whole content or sit in the middle
// of a sentence (a field made from highlighted text). Mixed-formatting cells are filled run by run, so
// the surrounding formatting survives.
export function fillGrid(grid: IPCRGridData, fields: IPCRField[], values: Record<string, IPCRFieldValue>): IPCRGridData {
  const byKey = new Map(fields.map(field => [field.key, field]));
  const fill = (text: string) => text.replace(TOKEN_EVERYWHERE, (match, key: string) => {
    const field = byKey.get(key);
    return field ? formatFieldValue(field, values[key] ?? null) : match;
  });
  const richText = grid.richText ? { ...grid.richText } : undefined;
  const data = grid.data.map((row, rowIndex) => row.map((cell, colIndex) => {
    if (typeof cell !== "string") return cell;
    const name = cellName(colIndex, rowIndex);
    const runs = richText?.[name];
    if (runs && runs.some(run => TOKEN_TEST.test(run.text))) {
      const filledRuns = runs.map(run => ({ ...run, text: fill(run.text) }));
      richText![name] = filledRuns;
      return filledRuns.map(run => run.text).join("");
    }
    if (!TOKEN_TEST.test(cell)) return cell;
    // A rich-text entry that doesn't hold the token would be stale next to the freshly filled text.
    if (richText && name in richText) delete richText[name];
    return fill(cell);
  }));
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