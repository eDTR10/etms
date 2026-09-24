export type IPCRFieldType = "text" | "textarea" | "date" | "number" | "rating" | "grouped_tasks";

export type IPCRPaperSize = "a3" | "a4" | "a5" | "letter" | "legal" | "folio" | "long";
export type IPCROrientation = "landscape" | "portrait";

export const PAPER_SIZE_OPTIONS: { value: IPCRPaperSize; label: string }[] = [
  { value: "a3", label: "A3" },
  { value: "a4", label: "A4" },
  { value: "a5", label: "A5" },
  { value: "letter", label: "Letter" },
  { value: "legal", label: "Legal" },
  { value: "folio", label: "Folio" },
  { value: "long", label: "Long (8.5\" x 13\")" },
];

export interface IPCRField {
  cell: string;
  key: string;
  label: string;
  type: IPCRFieldType;
}

export interface IPCRGridImage {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// A single styled run of text within one cell — e.g. a cell reading "I, NAME, TITLE of the
// OFFICE, commit to..." where only "NAME"/"TITLE"/"OFFICE" are bold+underlined needs three runs,
// not one uniform cell style. The grid's own `data`/`style` model only supports ONE style per
// cell (used for cells that don't need this), so richText is a separate, optional overlay:
// `data[row][col]` always holds the flattened plain text (runs' text concatenated) as the
// fallback/plain rendering and the value xlsx/PDF export fall back to, while `richText[cell]`
// — when present — carries the real per-run formatting for display and export.
export interface IPCRRichTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface IPCRGridData {
  data: (string | number)[][];
  style: Record<string, string>;
  mergeCells: Record<string, [number, number]>;
  colWidths: Record<number, number>;
  rowHeights?: Record<number, number>;
  richText?: Record<string, IPCRRichTextRun[]>;
  images: IPCRGridImage[];
  // Name of the source .xlsx sheet/tab this layout was imported from, if any — carried
  // through so a later .xlsx export re-uses it instead of always falling back to "IPCR".
  sheetName?: string;
}

export function emptyGrid(rows = 30, cols = 10): IPCRGridData {
  return {
    data: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "")),
    style: {},
    mergeCells: {},
    colWidths: {},
    images: [],
  };
}

// Templates briefly supported multiple pages ({pages: [...]}) in an earlier iteration of this
// feature — this guards against any row saved with that shape (e.g. during testing) by just
// taking its first page, since the backend stores `grid`/`grid_snapshot` as an opaque JSON blob
// with no schema enforcement beyond "has a recognizable shape".
export function normalizeGrid(value: unknown): IPCRGridData {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.data)) return record as unknown as IPCRGridData;
    if (Array.isArray(record.pages) && record.pages.length) {
      const first = record.pages[0] as { grid?: unknown };
      if (first?.grid) return first.grid as IPCRGridData;
    }
  }
  return emptyGrid();
}

export interface IPCRTemplate {
  id: number;
  name: string;
  grid: IPCRGridData;
  fields_config: IPCRField[];
  paper_size: IPCRPaperSize;
  orientation: IPCROrientation;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
}

export interface IPCRTemplateInput {
  name: string;
  grid: IPCRGridData;
  fields_config: IPCRField[];
  paper_size: IPCRPaperSize;
  orientation: IPCROrientation;
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
  paper_size: IPCRPaperSize;
  orientation: IPCROrientation;
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
