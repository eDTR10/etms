export type IPCRFieldType = "text" | "textarea" | "date" | "number" | "rating" | "grouped_tasks";

export interface IPCRField {
  cell: string;
  key: string;
  label: string;
  type: IPCRFieldType;
}

export interface IPCRGridData {
  data: (string | number)[][];
  style: Record<string, string>;
  mergeCells: Record<string, [number, number]>;
  colWidths: Record<number, number>;
}

export function emptyGrid(rows = 30, cols = 10): IPCRGridData {
  return {
    data: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "")),
    style: {},
    mergeCells: {},
    colWidths: {},
  };
}

export interface IPCRTemplate {
  id: number;
  name: string;
  grid: IPCRGridData;
  fields_config: IPCRField[];
  created_at: string;
  updated_at: string;
  can_manage: boolean;
}

export interface IPCRTemplateInput {
  name: string;
  grid: IPCRGridData;
  fields_config: IPCRField[];
}

export type IPCRFieldValue = string | number | null;

export interface IPCRFieldMetaEntry {
  grouped_task_ids?: number[];
}

export interface IPCRSubmission {
  id: number;
  template: number | null;
  label: string;
  grid_snapshot: IPCRGridData;
  fields_snapshot: IPCRField[];
  field_values: Record<string, IPCRFieldValue>;
  field_meta: Record<string, IPCRFieldMetaEntry>;
  final_rating: number | null;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
}

export type IPCRSubmissionInput = Omit<IPCRSubmission, "id" | "final_rating" | "created_at" | "updated_at" | "can_manage">;

export const RATING_SCALE = [1, 2, 3, 4, 5];

export function adjectivalRating(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "";
  if (value >= 5) return "Outstanding";
  if (value >= 4) return "Very Satisfactory";
  if (value >= 3) return "Satisfactory";
  if (value >= 2) return "Unsatisfactory";
  if (value >= 1) return "Poor";
  return "";
}

export function fieldToken(key: string): string {
  return `{{${key}}}`;
}

const TOKEN_PATTERN = /\{\{([a-z][a-z0-9_]*)\}\}/;

export function tokenKey(cellValue: string | number): string | null {
  if (typeof cellValue !== "string") return null;
  const match = cellValue.match(TOKEN_PATTERN);
  return match ? match[1] : null;
}

export function slugifyKey(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(slug) ? slug : `f_${slug}`;
}
