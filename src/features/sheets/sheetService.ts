import api from "../../plugin/axios";

export type SheetTabMode = "month" | "fixed";

export interface SheetTarget {
  id: number;
  name: string;
  key: string;
  url: string;
  spreadsheet_id: string;
  header_row: number;
  tab_mode: SheetTabMode;
  fixed_tab: string;
  is_enabled: boolean;
}
export type SheetTargetInput = Pick<SheetTarget, "name" | "url" | "header_row" | "tab_mode" | "fixed_tab" | "is_enabled">;

export type SheetColumnKind = "text" | "long" | "number" | "date" | "time" | "checkbox" | "select";

export interface SheetColumn {
  index: number;
  label: string;
  // "(Auto)" columns hold the sheet's own formulas: they are never written.
  auto: boolean;
  kind: SheetColumnKind;
  // The sheet's own dropdown choices.
  options: string[];
  // Values already used in that column of the sheet.
  suggestions: string[];
}

export interface SheetSchema {
  tab: string;
  tabs: string[];
  header_row: number;
  columns: SheetColumn[];
  next_number: number | null;
}

// What the server answers for a tab: the rows (with a `version` of their content), or just "unchanged" when the caller already
// holds that version.
export type SheetTableResult = (SheetTable & { version: string; unchanged?: undefined }) | { unchanged: true; version: string; tab: string; tabs: string[] };

export interface SheetEntry {
  id: number;
  target: number;
  target_name: string;
  tab: string;
  row_number: number;
  values: Record<string, string>;
  task: number | null;
  grouped_task: number | null;
  sent_by_name: string;
  created_at: string;
}

export interface ProjectCard {
  key: string;
  title: string;
  // The project page the card belongs to ("elgu", "tod").
  page: string;
  // The sheet behind the card, once a link has been added.
  target: number | null;
  url: string;
  // The tab the page opens on (set by an admin).
  default_tab: string;
  // That project's name in the directory: tasks made from this page's sheet go under it.
  project_name: string;
}

export interface SheetTable {
  tab: string;
  tabs: string[];
  headers: { index: number; label: string }[];
  rows: { row: number; cells: string[] }[];
}

export const sheetService = {
  projectCards: async () => (await api.get<{ allowed: boolean; pages: string[]; cards: ProjectCard[] }>("etm/sheet-targets/project-cards/")).data,
  taskViewers: async (page: string) => (await api.get<{ provincial: { id: number; name: string }[]; focal: { id: number; name: string }[] }>("etm/sheet-targets/task-viewers/", { params: { page } })).data,
  setCardUrl: async (key: string, url: string) => (await api.post<SheetTarget>("etm/sheet-targets/set-card-url/", { key, url })).data,
  setCardDefaultTab: async (key: string, default_tab: string) => (await api.post<SheetTarget>("etm/sheet-targets/set-card-url/", { key, default_tab })).data,
  tabs: async (id: number, refresh = false) => (await api.get<{ tabs: string[] }>(`etm/sheet-targets/${id}/tabs/`, { params: refresh ? { refresh: 1 } : {} })).data.tabs,
  rows: async (id: number, tab?: string, options: { known?: string; refresh?: boolean } = {}) =>
    (await api.get<SheetTableResult>(`etm/sheet-targets/${id}/rows/`, { params: { ...(tab ? { tab } : {}), ...(options.known ? { known: options.known } : {}), ...(options.refresh ? { refresh: 1 } : {}) } })).data,
  targets: async () => (await api.get<SheetTarget[]>("etm/sheet-targets/")).data,
  createTarget: async (input: SheetTargetInput) => (await api.post<SheetTarget>("etm/sheet-targets/", input)).data,
  updateTarget: async (id: number, input: Partial<SheetTargetInput>) => (await api.patch<SheetTarget>(`etm/sheet-targets/${id}/`, input)).data,
  account: async () => (await api.get<{ email: string | null; configured: boolean }>("etm/sheet-targets/account/")).data,
  schema: async (id: number, tab?: string) => (await api.get<SheetSchema>(`etm/sheet-targets/${id}/schema/`, { params: tab ? { tab } : {} })).data,
  send: async (id: number, input: { tab: string; values: Record<number, string>; task?: number | null; grouped_task?: number | null }) =>
    (await api.post<SheetEntry & { link: string }>(`etm/sheet-targets/${id}/send/`, input)).data,
  entries: async (params: { task?: number; grouped_task?: number; target?: number } = {}) => (await api.get<SheetEntry[]>("etm/sheet-entries/", { params })).data,
};
