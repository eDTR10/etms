import Swal from "sweetalert2";
import { addRepeatedLines, addSection, findSectionRow, type AddResult, type Side } from "./ipcrExpand";
import type { IPCRField, IPCRGridData } from "./types";

/**
 * Asks what to add next to row `index` (another item, or a new section such as a Key Result Area; above or below it; how
 * many) and returns the changed sheet and fields, or null if cancelled. Shared by the screen where people fill in their IPCR
 * and by the template designer's test window, so both behave the same.
 *
 * `templateGrid` is only a fallback source for the look of a new section, for a sheet that has no heading tagged as one.
 */
export async function askAddRowsDialog(grid: IPCRGridData, fields: IPCRField[], index: number, templateGrid: IPCRGridData | null = null): Promise<AddResult | null> {
  const mark = grid.expandable?.rows?.[index];
  // Any row can be picked; a row that was tagged in the template may limit the sides, others allow both.
  const allowBefore = mark ? mark.before || !mark.after : true;
  const allowAfter = mark ? mark.after || !mark.before : true;
  const templateHeading = templateGrid ? findSectionRow(templateGrid, 0) : null;
  const canSection = findSectionRow(grid, index) !== null || templateHeading !== null;
  const radio = (name: string, value: string, label: string, checked: boolean) =>
    `<label style="display:flex;align-items:center;gap:8px;font-size:14px;margin:4px 0;cursor:pointer"><input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""} /> ${label}</label>`;
  const { value, isConfirmed } = await Swal.fire({
    title: "Add to the sheet",
    html: `<div style="text-align:left;max-width:360px;margin:0 auto">`
      + `<div style="font-size:12px;opacity:.7;margin-bottom:4px">What do you want to add?</div>`
      + radio("etm-add-kind", "item", "Another item (a row like this one)", true)
      + (canSection ? radio("etm-add-kind", "section", "A new section (like a Key Result Area)", false) : `<div style="font-size:12px;opacity:.7;margin:4px 0">New sections are not set up in this template yet (tag a heading row as a section heading in the template).</div>`)
      + `<div style="font-size:12px;opacity:.7;margin:12px 0 4px">Where?</div>`
      + (allowBefore ? radio("etm-add-side", "before", "Above this row", !allowAfter) : "")
      + (allowAfter ? radio("etm-add-side", "after", "Below this row", true) : "")
      + `<div id="etm-add-count-wrap"><div style="font-size:12px;opacity:.7;margin:12px 0 4px">How many rows?</div><input id="etm-add-count" class="etm-swal-field" type="number" min="1" max="20" value="1" /></div>`
      + `<div id="etm-add-title-wrap" style="display:none"><div style="font-size:12px;opacity:.7;margin:12px 0 4px">Name of the new section</div><input id="etm-add-title" class="etm-swal-field" type="text" placeholder="e.g. Key Result Area #2" /></div>`
      + `</div>`,
    didOpen: () => {
      const sync = () => {
        const section = (document.querySelector('input[name="etm-add-kind"]:checked') as HTMLInputElement | null)?.value === "section";
        (document.getElementById("etm-add-count-wrap") as HTMLElement).style.display = section ? "none" : "block";
        (document.getElementById("etm-add-title-wrap") as HTMLElement).style.display = section ? "block" : "none";
      };
      document.querySelectorAll('input[name="etm-add-kind"]').forEach(input => input.addEventListener("change", sync));
      sync();
    },
    preConfirm: () => {
      const kind = (document.querySelector('input[name="etm-add-kind"]:checked') as HTMLInputElement | null)?.value ?? "item";
      const side = (document.querySelector('input[name="etm-add-side"]:checked') as HTMLInputElement | null)?.value ?? "after";
      const count = Math.max(1, Math.min(20, Number((document.getElementById("etm-add-count") as HTMLInputElement | null)?.value) || 1));
      const title = ((document.getElementById("etm-add-title") as HTMLInputElement | null)?.value ?? "").trim();
      if (kind === "section" && !title) { Swal.showValidationMessage("Give the new section a name."); return false; }
      return { kind, side, count, title };
    },
    showCancelButton: true,
    confirmButtonText: "Add",
  });
  if (!isConfirmed || !value) return null;
  const choice = value as { kind: "item" | "section"; side: Side; count: number; title: string };
  if (choice.kind === "section") {
    return addSection(grid, fields, index, choice.side, choice.title, templateGrid && templateHeading !== null ? { grid: templateGrid, row: templateHeading } : undefined);
  }
  return addRepeatedLines(grid, fields, "row", index, choice.side, choice.count);
}
