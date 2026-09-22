import { adjectivalRating, tokenKey, type IPCRField, type IPCRFieldValue, type IPCRGridData } from "./types";
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
    else if (key === "color") parsed.color = value;
    else if (key === "background-color") parsed.backgroundColor = value;
    else if (key === "text-align") parsed.align = value as ParsedCellStyle["align"];
    else if (key === "vertical-align") parsed.valign = value === "middle" ? "middle" : value === "bottom" ? "bottom" : "top";
  }
  return parsed;
}

export function hexToArgb(hex: string): string | null {
  const match = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `FF${match[1].toUpperCase()}` : null;
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
  const data = grid.data.map(row => row.map(cell => {
    const key = tokenKey(cell);
    if (!key) return cell;
    const field = byKey.get(key);
    if (!field) return cell;
    return formatFieldValue(field, values[key] ?? null);
  }));
  return { ...grid, data };
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
