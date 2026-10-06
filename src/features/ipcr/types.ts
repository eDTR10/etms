export type IPCRFieldType = "text" | "textarea" | "date" | "number" | "rating" | "grouped_tasks" | "month" | "year";

// A month field stores 1-12 and prints the month's name; a year field stores and prints the year.
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Years offered by a year picker: a decade back to a decade ahead of the current year.
export function yearChoices(): number[] {
  const now = new Date().getFullYear();
  return Array.from({ length: 21 }, (_, index) => now - 10 + index);
}

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

// Account details a text field can start out filled with (the person filling in the IPCR can still change it).
export type IPCRAutofill = "name" | "email" | "designation" | "office";

export interface IPCRField {
  cell: string;
  key: string;
  label: string;
  type: IPCRFieldType;
  // Date fields: "today" starts the date filled in with the day the IPCR is made; "choose" (the default) leaves it for the
  // person to pick. Either way they can change it.
  dateMode?: "today" | "choose";
  // Start this field with the signed-in user's own information.
  autofill?: IPCRAutofill;
  // Made from text highlighted inside a larger cell: only that text is replaced, not the whole cell.
  inline?: boolean;
  // The text an inline field replaced (e.g. "<NAME>"), put back if the field is removed.
  placeholder?: string;
}

export interface IPCRGridImage {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// A picture found in an imported .xlsx, positioned by the cell it was anchored to (plus an offset
// in px inside that cell) rather than by page pixels — the designer turns it into an
// IPCRGridImage once the grid is on screen and real cell positions are known.
export interface IPCRImageAnchor {
  id: string;
  dataUrl: string;
  col: number;
  row: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  // Size of the picture file itself (not the data URL).
  bytes: number;
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
  // A hyperlink target: this run is a clickable link (in the PDF) to this address.
  link?: string;
}

// Rows / columns the template's author marked as repeatable: whoever fills in the IPCR may add a copy before and/or
// after each one. Keyed by the row / column index (0-based).
export interface IPCRBreakpoint { before: boolean; after: boolean }
export interface IPCRExpandable { rows: Record<number, IPCRBreakpoint>; cols: Record<number, IPCRBreakpoint> }

export interface IPCRGridData {
  expandable?: IPCRExpandable;
  data: (string | number)[][];
  style: Record<string, string>;
  mergeCells: Record<string, [number, number]>;
  colWidths: Record<number, number>;
  rowHeights?: Record<number, number>;
  richText?: Record<string, IPCRRichTextRun[]>;
  images: IPCRGridImage[];
  // Where the top-left corner of cell A1 sat inside the area `images` are positioned in (px), measured when
  // the snapshot was taken. Lets exports convert an image's on-screen x/y into a position over the table.
  imageOrigin?: { x: number; y: number };
  // Name of the source .xlsx sheet/tab this layout was imported from, if any — carried
  // through so a later .xlsx export re-uses it instead of always falling back to "IPCR".
  sheetName?: string;
}

// Blank sheets start 19 columns wide (A to S), the width the OPCR/IPCR forms use.
export const DEFAULT_GRID_COLS = 19;

export function emptyGrid(rows = 30, cols = DEFAULT_GRID_COLS): IPCRGridData {
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
  // An example of a finished document for this template (null when none was uploaded).
  sample_document_url?: string | null;
  sample_document_name?: string;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
}

// What the designer hands back with a save besides the template itself: a sample document to attach, or to remove.
export interface IPCRTemplateSampleChange { file?: File | null; remove?: boolean }

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
