import type { UserProfile } from "../../screens/Auth/authService";
import { autofillKinds, autofillValue, startingValue } from "./ipcrAutofill";
import { normalizeGrid, type IPCRField, type IPCRFieldMetaEntry, type IPCRFieldValue, type IPCRGridData, type IPCROrientation, type IPCRPaperSize, type IPCRSubmission, type IPCRTemplate } from "./types";

// A generated IPCR is a copy of its template taken when it was made. So that edits to the template later (a field now
// filled from the person's own details, a renamed label, a new field, even a changed layout) reach IPCRs that already
// exist, an IPCR is brought up to date with its template when it is opened:
//
//  - The fields' settings (label, type, "use the existing information", example, date mode) always follow the template.
//  - A field that "uses the existing information" is re-filled from the account — unless the person typed their own answer
//    over it (an answer that is neither empty nor what the old setting would have filled in is theirs and is kept).
//  - If the person never changed the sheet itself (`layout_edited` false), the whole sheet follows the template too: its
//    layout, paper and orientation, and any new fields. Otherwise their layout is kept as it is.

export interface SyncedIPCR {
  changed: boolean;
  layoutFollowed: boolean;
  layoutKept: boolean;
  grid: IPCRGridData;
  fields: IPCRField[];
  values: Record<string, IPCRFieldValue>;
  meta: Record<string, IPCRFieldMetaEntry>;
  paperSize: IPCRPaperSize;
  orientation: IPCROrientation;
}

const isBlank = (value: IPCRFieldValue | undefined) => value === undefined || value === null || value === "";
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function syncWithTemplate(submission: IPCRSubmission, template: IPCRTemplate, profile: UserProfile | null, officeName: string): SyncedIPCR {
  const currentGrid = normalizeGrid(submission.grid_snapshot);
  const templateFields = template.fields_config;
  const oldByKey = new Map(submission.fields_snapshot.map(field => [field.key, field]));
  const templateStale = !submission.synced_template_at || new Date(template.updated_at).getTime() > new Date(submission.synced_template_at).getTime();
  const followLayout = templateStale && !submission.layout_edited;

  let grid = currentGrid;
  let paperSize = submission.paper_size;
  let orientation = submission.orientation;
  let fields: IPCRField[];
  if (followLayout) {
    grid = normalizeGrid(template.grid);
    paperSize = template.paper_size;
    orientation = template.orientation;
    fields = templateFields.map(field => ({ ...field }));
  } else {
    // Keep this IPCR's own fields (including copies made by adding rows), updating the settings of those the template still has.
    const templateByKey = new Map(templateFields.map(field => [field.key, field]));
    fields = submission.fields_snapshot.map(field => {
      const source = templateByKey.get(field.key);
      if (!source) return field;
      const { cell: _cell, ...settings } = source;
      void _cell;
      const next: IPCRField = { ...field, ...settings, cell: field.cell };
      if (source.autofill === undefined) delete next.autofill;
      if (source.sample === undefined) delete next.sample;
      if (source.dateMode === undefined) delete next.dateMode;
      return next;
    });
  }

  const values: Record<string, IPCRFieldValue> = {};
  fields.forEach(field => {
    const old = oldByKey.get(field.key);
    const current = submission.field_values[field.key];
    if (!old) { values[field.key] = startingValue(field, profile, officeName); return; }          // a field the template gained
    const before = old.autofill !== undefined ? autofillValue(old.autofill, profile, officeName) : null;
    const untouched = isBlank(current) || (before !== null && String(current) === before);        // blank, or still just what it was filled with
    if (untouched && autofillKinds(field.autofill).length > 0) values[field.key] = startingValue(field, profile, officeName);
    else if (untouched && old.autofill !== undefined && field.autofill === undefined) values[field.key] = field.type === "number" || field.type === "rating" || field.type === "month" || field.type === "year" ? null : "";
    else values[field.key] = current ?? startingValue(field, profile, officeName);
  });
  // Tagged grouped tasks only apply to fields that still exist.
  const meta = Object.fromEntries(Object.entries(submission.field_meta).filter(([key]) => values[key] !== undefined));

  const changed = !sameJson(fields, submission.fields_snapshot) || !sameJson(values, submission.field_values) || (followLayout && (!sameJson(grid, currentGrid) || paperSize !== submission.paper_size || orientation !== submission.orientation));
  return { changed, layoutFollowed: followLayout, layoutKept: templateStale && !!submission.layout_edited, grid, fields, values, meta, paperSize, orientation };
}
