import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileSpreadsheet, FileText, LayoutGrid, Loader2, Eye, Plus, Printer, RefreshCw, Save, Star } from "lucide-react";
import Swal from "sweetalert2";
import IPCRFillForm from "../../features/ipcr/IPCRFillForm";
import IPCRLivePreview from "../../features/ipcr/IPCRLivePreview";
import IPCRRichTextField from "../../features/ipcr/IPCRRichTextField";
import IPCRTemplateForm from "../../features/ipcr/IPCRTemplateForm";
import { ipcrService } from "../../features/ipcr/ipcrService";
import { addRepeatedLines, addSection, findSectionRow, type Axis, type Side } from "../../features/ipcr/ipcrExpand";
import { startingValue } from "../../features/ipcr/ipcrAutofill";
import { syncWithTemplate } from "../../features/ipcr/ipcrSync";
import { downloadIPCRWorkbook } from "../../features/ipcr/ipcrExport";
import { buildIPCRPdfBlob, downloadIPCRPdf, estimateIPCRPageStarts, printIPCRPdf } from "../../features/ipcr/ipcrPdfExport";
import { TASK_DRAG_TYPE, columnName, cellCoords, composeGroupedTasksHtml, computeFinalRating, fillGrid, flattenRuns, htmlToRuns, parseCellStyle, runsNeedRichText, runsToEditorHtml } from "../../features/ipcr/ipcrGridUtils";
import { adjectivalRating, normalizeGrid, type IPCRRichTextRun, type IPCRField, type IPCRFieldMetaEntry, type IPCRFieldValue, type IPCRGridData, type IPCROrientation, type IPCRPaperSize, type IPCRSubmission, type IPCRTemplate } from "../../features/ipcr/types";
import { taskService, taskError } from "../../features/tasks/taskService";
import { useAuth } from "../Auth/AuthContext";
import type { GroupedTask, Task } from "../../features/tasks/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";
import "../../features/ipcr/ipcr.css";

const columnLetters = (index: number) => { let name = ""; let n = index; do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0); return name; };

// A user's own IPCR on one screen: the fill-in fields on the left (the ones the account can answer are already filled in,
// and can be changed) and the finished document, updating as they type, on the right.
export default function IPCREditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: profile } = useAuth();
  const [submission, setSubmission] = useState<IPCRSubmission | null>(null);
  const [groups, setGroups] = useState<GroupedTask[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [taskSearch, setTaskSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  const [label, setLabel] = useState("");
  const [grid, setGrid] = useState<IPCRGridData | null>(null);
  const [fields, setFields] = useState<IPCRField[]>([]);
  const [values, setValues] = useState<Record<string, IPCRFieldValue>>({});
  const [meta, setMeta] = useState<Record<string, IPCRFieldMetaEntry>>({});
  const [paperSize, setPaperSize] = useState<IPCRPaperSize>("a3");
  const [orientation, setOrientation] = useState<IPCROrientation>("landscape");
  const [dirty, setDirty] = useState(false);
  // Which template version this IPCR matches, and whether its sheet was changed by hand (see ipcrSync.ts).
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [template, setTemplate] = useState<IPCRTemplate | null>(null);
  const [officeNameState, setOfficeNameState] = useState("");
  const [layoutEdited, setLayoutEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  // The "edit the sheet manually?" offer at the top of the screen; hidden once answered.
  const [manualAsked, setManualAsked] = useState(false);
  // The preview redraws a moment after typing stops, not on every key.
  const [previewKey, setPreviewKey] = useState(0);
  // The input being typed in (or pointed at) — its cell glows in the preview.
  const [focusField, setFocusField] = useState<string | null>(null);
  const [hoverField, setHoverField] = useState<string | null>(null);
  // The row picked by clicking the preview: rows are added above or below it.
  const [pickedRow, setPickedRow] = useState<number | null>(null);
  // Print preview: the real PDF shown in place of the sheet, redrawn as the person edits.
  const [printView, setPrintView] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const outlineRef = useRef<HTMLDivElement>(null);
  // Rows that each printed page after the first starts at, and the one being dragged to a new place in the page outline.
  const [pageStarts, setPageStarts] = useState<number[]>([]);
  const [dragBreak, setDragBreak] = useState<{ from: number; to: number } | null>(null);
  // The cell being edited in the rich-text dialog (opened by double-clicking a cell of the preview).
  const [cellEdit, setCellEdit] = useState<{ cell: string; html: string; font: string; size: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      ipcrService.listSubmissions(),
      taskService.listGroupedTasks().catch(() => [] as GroupedTask[]),
      ipcrService.listTemplates().catch(() => [] as IPCRTemplate[]),
      taskService.projects().catch(() => []),
      taskService.list().catch(() => [] as Task[]),
    ])
      .then(([rows, groupRows, templates, offices, taskRows]) => {
        if (cancelled) return;
        setAllTasks(taskRows);
        const found = rows.find(row => row.id === Number(id));
        if (!found) { setLoadError("This IPCR could not be found."); return; }
        setSubmission(found);
        setGroups(groupRows);
        setLabel(found.label);
        setLayoutEdited(!!found.layout_edited);
        // Bring it up to date with its template (the admin may have edited the template since this IPCR was made).
        const template = templates.find(item => item.id === found.template);
        const officeName = offices.find(office => office.id === profile?.office)?.name ?? "";
        const synced = template ? syncWithTemplate(found, template, profile, officeName) : null;
        setGrid(synced ? synced.grid : normalizeGrid(found.grid_snapshot));
        setFields(synced ? synced.fields : found.fields_snapshot);
        setValues(synced ? synced.values : found.field_values);
        setMeta(synced ? synced.meta : found.field_meta);
        setPaperSize(synced ? synced.paperSize : found.paper_size);
        setOrientation(synced ? synced.orientation : found.orientation);
        if (template) { setSyncedAt(template.updated_at); setTemplate(template); }
        setOfficeNameState(officeName);
        if (synced?.changed) {
          setDirty(true);
          void Swal.fire({
            icon: "info",
            title: "Updated to match the template",
            text: synced.layoutFollowed
              ? "The template was edited since this IPCR was made, so its sheet and fields were brought up to date. Your own answers are kept. Press Save to keep the update."
              : "The template's field settings changed, so the fields were brought up to date (details that come from your account were refreshed; anything you typed yourself is kept). Press Save to keep the update.",
            timer: 4500,
            showConfirmButton: true,
          });
        } else if (synced?.layoutKept) {
          void Swal.fire({ toast: true, position: "bottom-end", icon: "info", title: "The template's layout changed, but this IPCR keeps the sheet you edited.", timer: 4000, showConfirmButton: false });
        }
      })
      .catch(err => { if (!cancelled) setLoadError(taskError(err)); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewKey(key => key + 1), 150);
    return () => window.clearTimeout(timer);
  }, [values, grid, fields]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateValue = (key: string, value: IPCRFieldValue) => { setValues(current => ({ ...current, [key]: value })); setDirty(true); };

  function toggleGroupTag(field: IPCRField, groupId: number) {
    const current = meta[field.key]?.grouped_task_ids ?? [];
    const next = current.includes(groupId) ? current.filter(item => item !== groupId) : [...current, groupId];
    setMeta(currentMeta => ({ ...currentMeta, [field.key]: { grouped_task_ids: next } }));
    updateValue(field.key, composeGroupedTasksHtml(next, groups));
  }

  // Adds rows / columns next to one the template's author marked as repeatable (see ipcrExpand.ts).
  function applyAdd(result: { grid: IPCRGridData; fields: IPCRField[]; addedFields: IPCRField[] }) {
    setGrid(result.grid);
    setFields(result.fields);
    setValues(current => ({ ...current, ...Object.fromEntries(result.addedFields.map(field => [field.key, startingValue(field, null, "")])) }));
    setLayoutEdited(true);
    setDirty(true);
  }

  // A row named by its first text, e.g. "PART 3. INDIVIDUAL DEVELOPMENT PLAN…", so it can be found in a list.
  const rowLabel = (row: number) => {
    const text = (filled?.data[row] ?? []).map(cell => String(cell ?? "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  };

  function setPageBreaks(update: (rows: number[]) => number[]) {
    setGrid(current => current && ({ ...current, pageBreaks: Array.from(new Set(update(current.pageBreaks ?? []))).sort((a, b) => a - b) }));
    setLayoutEdited(true);
    setDirty(true);
  }

  // The right-click menu of the preview: add rows / columns next to the row or column that was clicked, or edit the cell.
  function sheetMenu({ col, row }: { col: number | null; row: number | null }) {
    const items: { title: string; onclick: () => void }[] = [];
    if (!grid || !submission?.can_manage) return items;
    if (row !== null) {
      items.push({ title: "Add rows above or below…", onclick: () => { setPickedRow(row); void askAddRows(row); } });
    }
    if (col !== null) {
      items.push({ title: "Add column before", onclick: () => applyAdd(addRepeatedLines(grid, fields, "col", col, "before", 1)) });
      items.push({ title: "Add column after", onclick: () => applyAdd(addRepeatedLines(grid, fields, "col", col, "after", 1)) });
    }
    if (row !== null && row > 0) {
      const hasBreak = (grid.pageBreaks ?? []).includes(row);
      items.push({ title: hasBreak ? "Remove the page break above this row" : "Start a new printed page at this row", onclick: () => setPageBreaks(rows => (hasBreak ? rows.filter(item => item !== row) : [...rows, row])) });
    }
    if (row !== null && col !== null) items.push({ title: "Edit this cell…", onclick: () => editCell(`${columnName(col)}${row + 1}`) });
    return items;
  }

  function addLine(axis: Axis, index: number, side: Side) {
    if (!grid) return;
    applyAdd(addRepeatedLines(grid, fields, axis, index, side, 1));
  }

  // Puts runs of text into a cell of the sheet (left-aligned from the top, the way a list reads best).
  function writeCell(cell: string, runs: IPCRRichTextRun[] | null, text: string, look?: { font: string; size: string }) {
    const { col, row } = cellCoords(cell);
    setGrid(currentGrid => {
      if (!currentGrid) return currentGrid;
      const data = currentGrid.data.map(line => line.slice());
      if (!data[row]) return currentGrid;
      data[row][col] = text;
      const richText = { ...(currentGrid.richText ?? {}) };
      if (runs) richText[cell] = runs; else delete richText[cell];
      const dropped = (currentGrid.style[cell] ?? "").split(";").map(part => part.trim()).filter(Boolean);
      let rules: string[];
      if (look) {
        // Editing a cell keeps its alignment; only the font and size the person picked change.
        rules = dropped.filter(part => !(look.font && /^font-family\s*:/i.test(part)) && !(look.size && /^font-size\s*:/i.test(part)));
        if (look.font) rules.push(`font-family: ${look.font}`);
        if (look.size) rules.push(`font-size: ${look.size}px`);
      } else {
        rules = [...dropped.filter(part => !/^(text-align|vertical-align)\s*:/i.test(part)), "text-align: left", "vertical-align: top"];
      }
      const style = { ...currentGrid.style, [cell]: rules.length ? `${rules.join("; ")};` : "" };
      return { ...currentGrid, data, richText, style };
    });
    setLayoutEdited(true);
    setDirty(true);
  }

  // A task or grouped task dragged from the list and dropped on a cell.
  async function dropTask(cell: string, payload: string) {
    if (!grid || !submission?.can_manage) return;
    let item: { kind: "group" | "task"; id: number };
    try { item = JSON.parse(payload); } catch { return; }
    const { col, row } = cellCoords(cell);
    const existingText = String(grid.data[row]?.[col] ?? "");
    const existingRuns = grid.richText?.[cell] ?? null;
    const hasField = /\{\{[a-z][a-z0-9_]*\}\}/.test(existingText);
    if (item.kind === "group") {
      const group = groups.find(entry => entry.id === item.id);
      if (!group) return;
      if (existingText.trim()) {
        const answer = await Swal.fire({ title: `Replace what's in ${cell}?`, text: hasField ? "This cell shows one of your fields; dropping the group here replaces it." : "The cell already has text. Dropping the group here replaces it.", icon: "question", showCancelButton: true, confirmButtonText: "Replace" });
        if (!answer.isConfirmed) return;
      }
      const count = group.tasks.length;
      const runs: IPCRRichTextRun[] = [{ text: `${group.name} (${count}/${count})`, bold: true }, { text: count ? group.tasks.map(task => `\n\u2022 ${task.title}`).join("") : "\n(no tasks in this group yet)" }];
      writeCell(cell, runs, flattenRuns(runs));
      return;
    }
    const task = allTasks.find(entry => entry.id === item.id) ?? groups.flatMap(entry => entry.tasks).find(entry => entry.id === item.id);
    if (!task) return;
    if (existingText.trim()) {
      // Something is already there: the task is added to it as one more bullet.
      const runs: IPCRRichTextRun[] = [...(existingRuns ?? [{ text: existingText }]), { text: `\n\u2022 ${task.title}` }];
      writeCell(cell, runs, flattenRuns(runs));
      return;
    }
    // Empty cell: ask what the task group is called (optional) and how to show it, with a live preview.
    const radio = (value: string, label: string, checked: boolean) =>
      `<label style="display:flex;align-items:center;gap:8px;font-size:14px;margin:4px 0;cursor:pointer"><input type="radio" name="etm-drop-format" value="${value}" ${checked ? "checked" : ""} /> ${label}</label>`;
    const { value, isConfirmed } = await Swal.fire({
      title: `Add this task to ${cell}`,
      html: `<div style="text-align:left;max-width:380px;margin:0 auto">`
        + `<div style="font-size:12px;opacity:.7;margin-bottom:4px">What is the task called? <span style="opacity:.7">(optional)</span></div>`
        + `<input id="etm-drop-title" class="etm-swal-field" type="text" placeholder="Group Task Title" />`
        + `<div style="font-size:12px;opacity:.7;margin:12px 0 4px">Show it as</div>`
        + radio("bullets", "A title with a bulleted list", true) + radio("plain", "Plain text", false)
        + `<div style="font-size:12px;opacity:.7;margin:12px 0 4px">Preview</div>`
        + `<div id="etm-drop-preview" style="padding:10px 12px;border:1px dashed var(--etm-border);border-radius:9px;font-size:13px;line-height:1.5;white-space:pre-wrap"></div>`
        + `</div>`,
      didOpen: () => {
        const refresh = () => {
          const title = (document.getElementById("etm-drop-title") as HTMLInputElement).value.trim();
          const plain = (document.querySelector('input[name="etm-drop-format"]:checked') as HTMLInputElement | null)?.value === "plain";
          const preview = document.getElementById("etm-drop-preview");
          if (!preview) return;
          preview.replaceChildren();
          if (plain) { preview.textContent = task.title; return; }
          const head = document.createElement("strong");
          head.textContent = title || "Group Task Title";
          preview.append(head, document.createTextNode(`\n\u2022 ${task.title}\n\u2022 …`));
        };
        document.getElementById("etm-drop-title")?.addEventListener("input", refresh);
        document.querySelectorAll('input[name="etm-drop-format"]').forEach(input => input.addEventListener("change", refresh));
        refresh();
      },
      preConfirm: () => ({
        title: (document.getElementById("etm-drop-title") as HTMLInputElement).value.trim(),
        plain: (document.querySelector('input[name="etm-drop-format"]:checked') as HTMLInputElement | null)?.value === "plain",
      }),
      showCancelButton: true,
      confirmButtonText: "Add",
    });
    if (!isConfirmed || !value) return;
    const choice = value as { title: string; plain: boolean };
    if (choice.plain) { writeCell(cell, null, task.title); return; }
    const runs: IPCRRichTextRun[] = choice.title ? [{ text: choice.title, bold: true }, { text: `\n\u2022 ${task.title}` }] : [{ text: `\u2022 ${task.title}` }];
    writeCell(cell, runs, flattenRuns(runs));
  }

  // The list of things that can be dragged onto the sheet: grouped tasks first, then the tasks that are in no group.
  const groupedTaskIds = useMemo(() => new Set(groups.flatMap(group => group.tasks.map(task => task.id))), [groups]);
  const search = taskSearch.trim().toLowerCase();
  const shownGroups = groups.filter(group => !search || group.name.toLowerCase().includes(search) || group.tasks.some(task => task.title.toLowerCase().includes(search)));
  const shownTasks = allTasks.filter(task => !groupedTaskIds.has(task.id) && (!search || task.title.toLowerCase().includes(search)));
  const dragItem = (event: React.DragEvent, kind: "group" | "task", id: number, label: string) => {
    event.dataTransfer.setData(TASK_DRAG_TYPE, JSON.stringify({ kind, id }));
    event.dataTransfer.setData("text/plain", label);
    event.dataTransfer.effectAllowed = "copy";
  };

  // For a tagged row: what to add (an item, or a new section such as a Key Result Area), above or below it, and how many items.
  async function askAddRows(index: number) {
    if (!grid) return;
    const mark = grid.expandable?.rows?.[index];
    // Any row can be picked; a row that was tagged in the template may limit the sides, others allow both.
    const allowBefore = mark ? mark.before || !mark.after : true;
    const allowAfter = mark ? mark.after || !mark.before : true;
    // An IPCR made before the heading was tagged has no tag of its own; the template's heading is used instead.
    const templateGrid = template ? normalizeGrid(template.grid) : null;
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
    if (!isConfirmed || !value) return;
    setPickedRow(null);
    const choice = value as { kind: "item" | "section"; side: Side; count: number; title: string };
    if (choice.kind === "section") {
      const result = addSection(grid, fields, index, choice.side, choice.title, templateGrid && templateHeading !== null ? { grid: templateGrid, row: templateHeading } : undefined);
      if (result) applyAdd(result);
    } else {
      applyAdd(addRepeatedLines(grid, fields, "row", index, choice.side, choice.count));
    }
  }

  const selectStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--etm-border)", borderRadius: 8, background: "var(--etm-surface-alt)", color: "var(--etm-ink)", font: "inherit", fontSize: 13 };

  const pickedRowText = (() => {
    if (!grid || pickedRow === null) return "";
    const text = (grid.data[pickedRow] ?? []).map(cell => String(cell ?? "").replace(/\{\{[a-z0-9_]+\}\}/g, "").trim()).find(Boolean);
    return `Row ${pickedRow + 1}${text ? ` — ${text.length > 34 ? `${text.slice(0, 34)}…` : text}` : ""}`;
  })();

  async function save(): Promise<boolean> {
    if (!submission || !grid || saving) return false;
    if (!label.trim()) { setError("Give your IPCR a file name."); return false; }
    setSaving(true);
    setError("");
    try {
      const saved = await ipcrService.updateSubmission(submission.id, {
        label: label.trim(), grid_snapshot: grid, fields_snapshot: fields, field_values: values, field_meta: meta, paper_size: paperSize, orientation,
        synced_template_at: syncedAt, layout_edited: layoutEdited,
      });
      setSubmission(saved);
      setDirty(false);
      void Swal.fire({ title: "IPCR saved", icon: "success", timer: 1200, showConfirmButton: false });
      return true;
    } catch (caught) {
      setError(taskError(caught));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Double-click a cell of the preview to change what it holds — the way out when a cell still shows what the template
  // used to have there (the sheet of an IPCR that has been edited is kept as it is, see ipcrSync.ts).
  function editCell(cell: string) {
    if (!grid || !submission?.can_manage) return;
    const { col, row } = cellCoords(cell);
    const runs = grid.richText?.[cell] ?? [{ text: String(grid.data[row]?.[col] ?? "") }];
    const look = parseCellStyle(grid.style[cell]);
    setCellEdit({ cell, html: runsToEditorHtml(runs), font: look.fontFamily ?? "", size: look.fontSize ? String(look.fontSize) : "" });
  }

  function applyCellEdit() {
    if (!cellEdit) return;
    const { cell, html, font, size } = cellEdit;
    const runs = htmlToRuns(html);
    writeCell(cell, runsNeedRichText(runs) ? runs : null, flattenRuns(runs), { font, size });
    setCellEdit(null);
  }

  // Throws away the changes made to the sheet of this IPCR and takes the template's current sheet; answers for fields that
  // still exist in the template are kept.
  async function resetToTemplate() {
    if (!submission || !template) return;
    const answer = await Swal.fire({
      title: "Use the template's sheet again?",
      text: "This replaces this IPCR's sheet with the template as it is now, so rows you added and cells you changed by hand are removed. Your answers are kept for the fields the template still has.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, use the template's sheet",
    });
    if (!answer.isConfirmed) return;
    const synced = syncWithTemplate(
      { ...submission, fields_snapshot: fields, field_values: values, field_meta: meta, grid_snapshot: grid ?? submission.grid_snapshot, layout_edited: false, synced_template_at: null },
      template, profile, officeNameState,
    );
    setGrid(synced.grid);
    setFields(synced.fields);
    setValues(synced.values);
    setMeta(synced.meta);
    setPaperSize(synced.paperSize);
    setOrientation(synced.orientation);
    setSyncedAt(template.updated_at);
    setLayoutEdited(false);
    setDirty(true);
  }

  async function goBack() {
    if (dirty) {
      const result = await Swal.fire({ title: "Leave without saving?", text: "You have changes that are not saved yet.", icon: "warning", showCancelButton: true, confirmButtonText: "Leave", cancelButtonText: "Stay" });
      if (!result.isConfirmed) return;
    }
    navigate("/etms/ipcr");
  }

  const filled = useMemo(() => grid ? fillGrid(grid, fields, values) : null, [grid, fields, values]);
  // What the sheet looks like on screen is what is printed: rows take the heights they really have in the preview.
  const measureRef = useRef<(() => Record<number, number>) | null>(null);
  const forExport = () => (filled ? { ...filled, rowHeights: { ...(filled.rowHeights ?? {}), ...(measureRef.current?.() ?? {}) } } : null);

  // Redraws the print preview a moment after anything changes. The sheet stays mounted (out of sight) while it is
  // shown, because the row heights are measured from it.
  useEffect(() => {
    if (!printView || !filled) return;
    let cancelled = false;
    setPdfBusy(true);
    const timer = window.setTimeout(() => {
      const sheet = forExport();
      if (!sheet) return;
      setPageStarts(estimateIPCRPageStarts(sheet, paperSize, orientation));
      buildIPCRPdfBlob(sheet, paperSize, orientation)
        .then(blob => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setPdfUrl(previous => { if (previous) URL.revokeObjectURL(previous); return url; });
        })
        .catch(() => undefined)
        .finally(() => { if (!cancelled) setPdfBusy(false); });
    }, 650);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printView, filled, paperSize, orientation, previewKey]);
  useEffect(() => () => { setPdfUrl(previous => { if (previous) URL.revokeObjectURL(previous); return null; }); }, []);


  // Ctrl+P (or Cmd+P) prints the finished document — not the page around it. Not while the sheet editor is open.
  useEffect(() => {
    if (layoutOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        const sheet = forExport();
        if (sheet) printIPCRPdf(sheet, paperSize, orientation);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutOpen, filled, paperSize, orientation]);
  const filename = `IPCR-${(label || "form").replace(/\s+/g, "-")}`;
  const finalRating = computeFinalRating(fields, values);

  // The sheet editor (layout, images, cell text) for the rare case the template itself needs changing.
  const asTemplate = useMemo<IPCRTemplate | undefined>(() => submission && grid ? {
    id: submission.id, name: label, grid, fields_config: fields, paper_size: paperSize, orientation,
    created_at: submission.created_at, updated_at: submission.updated_at, can_manage: submission.can_manage,
  } : undefined, [submission, grid, fields, label, paperSize, orientation]);

  if (loadError) {
    return (
      <div className="etm-error" style={{ margin: 24 }}>
        <div><strong>IPCR unavailable</strong><p>{loadError}</p></div>
        <button type="button" className="etm-button ghost" onClick={() => navigate("/etms/ipcr")}>Go back</button>
      </div>
    );
  }
  if (!submission || !grid || !asTemplate) return null;

  if (layoutOpen) {
    return (
      <IPCRTemplateForm
        submissionMode
        template={asTemplate}
        onCancel={() => setLayoutOpen(false)}
        onSave={async input => {
          setGrid(input.grid);
          setFields(input.fields_config);
          setLabel(input.name);
          setPaperSize(input.paper_size);
          setOrientation(input.orientation);
          setLayoutEdited(true);
          setDirty(true);
          setLayoutOpen(false);
        }}
      />
    );
  }

  const marks = [
    ...Object.entries(grid.expandable?.cols ?? {}).map(([index, mark]) => ({ axis: "col" as Axis, index: Number(index), mark })),
  ];
  const describe = (axis: Axis, index: number) => {
    const cells = axis === "row" ? grid.data[index] ?? [] : grid.data.map(row => row[index]);
    const text = cells.map(cell => String(cell ?? "").replace(/\{\{[a-z0-9_]+\}\}/g, "").trim()).find(Boolean);
    const count = grid.expandable?.[axis === "row" ? "rows" : "cols"]?.[index]?.addedAfter ?? 0;
    return `${axis === "row" ? `Row ${index + 1}` : `Column ${columnLetters(index)}`}${text ? ` — ${text.length > 30 ? `${text.slice(0, 30)}…` : text}` : ""}${count ? ` · ${count} added` : ""}`;
  };

  const barButton = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-40 shrink-0";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="min-h-12 border-b border-border bg-card flex flex-wrap items-center px-3 py-1.5 gap-2 shrink-0">
        <button type="button" className={barButton} onClick={() => void goBack()} title="Back to Generate IPCR"><ArrowLeft className="w-3.5 h-3.5" />Back</button>
        <div className="min-w-0 flex-1 basis-48">
          <input value={label} onChange={event => { setLabel(event.target.value); setDirty(true); }} placeholder="File name" maxLength={255} aria-label="File name"
            className="text-sm font-semibold text-foreground bg-transparent border-0 outline-none w-full truncate p-0" />
          <p className="text-[10px] text-muted-foreground leading-tight">Fill in the fields — the preview updates as you type{dirty ? " · unsaved changes" : ""}</p>
        </div>
        {error && <span className="text-[11px] text-destructive">{error}</span>}
        <button type="button" className={`${barButton}${printView ? " bg-primary/10" : ""}`} onClick={() => setPrintView(on => !on)} title="Show the sheet the way it will print — the form on the left stays editable"><Eye className="w-3.5 h-3.5" />{printView ? "Edit sheet" : "Print preview"}</button>
        {template && submission.can_manage && <button type="button" className={barButton} onClick={() => void resetToTemplate()} title="Use the template's current sheet again (removes rows and cell edits you made)"><RefreshCw className="w-3.5 h-3.5" />Reset sheet</button>}
        <button type="button" className={barButton} onClick={() => { const sheet = forExport(); if (sheet) printIPCRPdf(sheet, paperSize, orientation); }} title="Open the PDF to print or save (Ctrl+P)"><Printer className="w-3.5 h-3.5" />Print</button>
        <button type="button" className={barButton} onClick={() => { const sheet = forExport(); if (sheet) void downloadIPCRWorkbook(sheet, filename); }}><Download className="w-3.5 h-3.5" />Excel</button>
        <button type="button" className={barButton} onClick={() => { const sheet = forExport(); if (sheet) downloadIPCRPdf(sheet, filename, paperSize, orientation); }}><FileText className="w-3.5 h-3.5" />PDF</button>
        <button type="button" disabled={saving || !submission.can_manage} onClick={() => void save()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 shrink-0">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{saving ? "Saving…" : "Save"}
        </button>
      </div>

      {!manualAsked && submission.can_manage && (
        <div className="etm-ipcr-manual-ask" role="region" aria-label="Edit the sheet manually">
          <LayoutGrid className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0">Want to edit the sheet itself manually — cells, rows, columns, images and formatting, like editing a template?</span>
          <button type="button" className="etm-button primary small" onClick={() => { setManualAsked(true); setLayoutOpen(true); }}>Yes, edit manually</button>
          <button type="button" className="etm-button ghost small" onClick={() => setManualAsked(true)}>No, thanks</button>
        </div>
      )}
      <div className="etm-ipcr-fill-body">
        <aside className="etm-ipcr-fill-side">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"><FileSpreadsheet className="w-3.5 h-3.5" />Your details</p>
            <p className="text-xs text-muted-foreground mt-1">Fields the system already knows are filled in for you — change any of them if they are not right.</p>
          </div>
          {fields.length === 0 ? <p className="text-xs text-muted-foreground">This template has no fields to fill in.</p> : (
            <IPCRFillForm fields={fields} values={values} meta={meta} groups={groups} onUpdateValue={updateValue} onToggleGroupTag={toggleGroupTag} onFieldFocus={setFocusField} onFieldHover={setHoverField} />
          )}
          {submission.can_manage && (groups.length > 0 || allTasks.length > 0) && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Tasks</p>
              <p style={{ fontSize: 12, color: "var(--etm-muted)", margin: "0 0 6px" }}>Drag a grouped task or a single task onto a cell of the sheet to fill it in.</p>
              <input style={{ width: "100%", boxSizing: "border-box", marginBottom: 6, padding: "8px 10px", border: "1px solid var(--etm-border)", borderRadius: 8, background: "var(--etm-surface-alt)", color: "var(--etm-ink)", font: "inherit", fontSize: 13 }} placeholder="Search tasks…" value={taskSearch} onChange={event => setTaskSearch(event.target.value)} />
              <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 4, padding: 6, border: "1px solid var(--etm-border)", borderRadius: 8, background: "var(--etm-surface-alt)" }}>
                {shownGroups.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--etm-muted)" }}>Grouped tasks</span>}
                {shownGroups.map(group => (
                  <div key={`g${group.id}`} draggable onDragStart={event => dragItem(event, "group", group.id, group.name)} title={group.tasks.map(task => task.title).join("\n")}
                    style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid var(--etm-border)", background: "var(--etm-surface)", color: "var(--etm-ink)", cursor: "grab", fontSize: 12.5 }}>
                    <strong>{group.name}</strong> <span style={{ color: "var(--etm-muted)" }}>({group.tasks.length}/{group.tasks.length})</span>
                    {group.tasks.slice(0, 4).map(task => <div key={task.id} style={{ color: "var(--etm-muted)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>• {task.title}</div>)}
                    {group.tasks.length > 4 && <div style={{ color: "var(--etm-muted)", fontSize: 11.5 }}>+{group.tasks.length - 4} more</div>}
                  </div>
                ))}
                {shownTasks.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--etm-muted)", marginTop: 4 }}>Single tasks</span>}
                {shownTasks.map(task => (
                  <div key={`t${task.id}`} draggable onDragStart={event => dragItem(event, "task", task.id, task.title)}
                    style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid var(--etm-border)", background: "var(--etm-surface)", color: "var(--etm-ink)", cursor: "grab", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                ))}
                {shownGroups.length === 0 && shownTasks.length === 0 && <span style={{ fontSize: 12.5, color: "var(--etm-muted)" }}>Nothing matches.</span>}
              </div>
            </div>
          )}
          {submission.can_manage && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Add rows</p>
              <div className="etm-ipcr-field-list" style={{ margin: 0, display: "grid", gap: 8, padding: 10, border: "1px solid var(--etm-border)", borderRadius: 8, background: "var(--etm-surface-alt)" }}>
                {pickedRow === null ? (
                  <span style={{ fontSize: 12.5, color: "var(--etm-muted)" }}>Click any row in the preview, then choose to add rows above or below it — more items, or a new section.</span>
                ) : (
                  <>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--etm-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pickedRowText}</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                      <button type="button" className="etm-button primary small" onClick={() => void askAddRows(pickedRow)}><Plus size={13} /> Add above or below…</button>
                      <button type="button" className="etm-button ghost small" onClick={() => setPickedRow(null)}>Clear</button>
                    </div>
                  </>
                )}
              </div>
              {marks.length > 0 && (
                <ul className="etm-ipcr-field-list" style={{ margin: "10px 0 0" }}>
                  {marks.map(({ axis, index, mark }) => (
                    <li key={`${axis}-${index}`}>
                      <span style={{ flex: 1, minWidth: 0 }}>{describe(axis, index)}</span>
                      {mark.before && <button type="button" className="etm-button ghost small" onClick={() => addLine(axis, index, "before")}><Plus size={13} /> Column before</button>}
                      {mark.after && <button type="button" className="etm-button ghost small" onClick={() => addLine(axis, index, "after")}><Plus size={13} /> Column after</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {finalRating !== null && <div className="etm-ipcr-final-rating-banner"><Star size={16} /> Final rating so far: {finalRating} — {adjectivalRating(finalRating)}</div>}
        </aside>

        <main className="etm-ipcr-fill-main">
          {printView && (
            <div style={{ display: "grid", gap: 8, marginBottom: 8, color: "var(--etm-ink)" }}>
              <p style={{ margin: 0, fontSize: 12.5 }}>
                <span style={{ color: "var(--etm-muted)" }}>{pdfBusy ? "Updating… " : "This is how it will print; it updates as you change the fields. "}</span>
                A row is never split between two pages. In the page outline on the left, <strong>drag a page line up or down</strong> to change where a page ends, or press ✂ on a row to end the page after it. To change the rows themselves, switch back with “Edit sheet”.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(230px, 300px) 1fr", gap: 10, alignItems: "start" }}>
                <div style={{ height: "calc(100vh - 250px)", minHeight: 420, overflowY: "auto", border: "1px solid var(--etm-border)", borderRadius: 8, background: "var(--etm-surface-alt)" }}>
                  <div ref={outlineRef} style={{ position: "relative", height: (grid?.data.length ?? 0) * 22, userSelect: "none" }}>
                    {(grid?.data ?? []).map((_line, row) => (
                      <div key={row} style={{ position: "absolute", left: 0, right: 0, top: row * 22, height: 22, display: "flex", alignItems: "center", gap: 6, padding: "0 6px", fontSize: 11.5, borderBottom: "1px solid color-mix(in srgb, var(--etm-border) 55%, transparent)" }}>
                        <span style={{ width: 26, textAlign: "right", color: "var(--etm-muted)", flexShrink: 0 }}>{row + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: rowLabel(row) ? "var(--etm-ink)" : "var(--etm-muted)", fontStyle: rowLabel(row) ? "normal" : "italic" }}>{rowLabel(row) || "(empty row)"}</span>
                        {submission.can_manage && row < (grid?.data.length ?? 0) - 1 && !pageStarts.includes(row + 1) && (
                          <button type="button" title={`End the page after row ${row + 1}`} aria-label={`End the page after row ${row + 1}`} onClick={() => setPageBreaks(rows => [...rows, row + 1])}
                            style={{ border: 0, background: "transparent", color: "var(--etm-primary)", cursor: "pointer", fontSize: 13, padding: "0 2px" }}>✂</button>
                        )}
                      </div>
                    ))}
                    {pageStarts.map((start, index) => {
                      const manual = (grid?.pageBreaks ?? []).includes(start);
                      const at = dragBreak && dragBreak.from === start ? dragBreak.to : start;
                      return (
                        <div key={`${start}-${index}`} role="separator" aria-label={`Page ${index + 2} starts at row ${at + 1}`} title="Drag to move where this page starts"
                          onPointerDown={submission.can_manage ? event => { event.currentTarget.setPointerCapture(event.pointerId); setDragBreak({ from: start, to: start }); } : undefined}
                          onPointerMove={event => {
                            if (!dragBreak || dragBreak.from !== start || !outlineRef.current) return;
                            const y = event.clientY - outlineRef.current.getBoundingClientRect().top;
                            const to = Math.max(1, Math.min((grid?.data.length ?? 1) - 1, Math.round(y / 22)));
                            if (to !== dragBreak.to) setDragBreak({ from: start, to });
                          }}
                          onPointerUp={() => {
                            const drag = dragBreak;
                            setDragBreak(null);
                            if (!drag || drag.from !== start || drag.to === start) return;
                            setPageBreaks(rows => [...rows.filter(row => row !== start), drag.to]);
                          }}
                          style={{ position: "absolute", left: 0, right: 0, top: at * 22 - 3, height: 6, cursor: submission.can_manage ? "ns-resize" : "default", zIndex: 2, touchAction: "none",
                            background: manual ? "var(--etm-primary)" : "repeating-linear-gradient(90deg, var(--etm-muted) 0 6px, transparent 6px 10px)", opacity: dragBreak?.from === start ? 1 : 0.9 }}>
                          <span style={{ position: "absolute", right: 4, top: -12, fontSize: 10, fontWeight: 700, padding: "0 5px", borderRadius: 4, background: manual ? "var(--etm-primary)" : "var(--etm-surface)", color: manual ? "#fff" : "var(--etm-muted)", border: manual ? 0 : "1px solid var(--etm-border)" }}>
                            Page {index + 2} starts{manual ? "" : " (automatic)"}
                            {manual && submission.can_manage && <button type="button" aria-label="Remove this page break" onPointerDown={event => event.stopPropagation()} onClick={() => setPageBreaks(rows => rows.filter(row => row !== start))} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", marginLeft: 4, padding: 0 }}>×</button>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {pdfUrl ? <iframe title="Print preview" src={pdfUrl} style={{ width: "100%", height: "calc(100vh - 250px)", minHeight: 420, border: "1px solid var(--etm-border)", borderRadius: 8, background: "#fff" }} /> : <p style={{ color: "var(--etm-muted)" }}>Preparing the preview…</p>}
              </div>
            </div>
          )}
          <div style={printView ? { position: "absolute", left: -10000, top: 0, width: 1800, pointerEvents: "none" } : undefined} aria-hidden={printView || undefined}>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{printView ? "Print preview" : "Live preview"}</p>
          <IPCRLivePreview grid={grid} fields={fields} values={values} refreshKey={previewKey} focusKey={focusField ?? hoverField} onCellDoubleClick={cell => editCell(cell)} onCellClick={cell => setPickedRow(cellCoords(cell).row)} pickedRow={pickedRow} contextItems={sheetMenu} measureRef={measureRef} onDropTask={submission.can_manage ? (cell, payload) => void dropTask(cell, payload) : undefined} />
          </div>
        </main>
      </div>
      {cellEdit && (
        <div role="dialog" aria-modal="true" aria-label={`Edit cell ${cellEdit.cell}`} onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") setCellEdit(null); }}
          onMouseDown={event => { if (event.target === event.currentTarget) setCellEdit(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "rgba(0,0,0,.5)", padding: 16 }}>
          <div style={{ width: "min(560px, 100%)", maxHeight: "92vh", overflow: "auto", background: "var(--etm-surface)", color: "var(--etm-ink)", border: "1px solid var(--etm-border)", borderRadius: 14, padding: 18, display: "grid", gap: 12 }}>
            <div>
              <strong style={{ fontSize: 16 }}>Edit cell {cellEdit.cell}</strong>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--etm-muted)" }}>Format the text, make a bulleted list (type “-” then Space, or use the list button), or insert one of your fields.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 8 }}>
              <select style={selectStyle} value="" aria-label="Insert a field" onChange={event => { const token = event.target.value; if (token) setCellEdit(current => current && ({ ...current, html: `${current.html}${token}` })); }}>
                <option value="">Insert a field…</option>
                {fields.map(field => <option key={field.key} value={`{{${field.key}}}`}>{field.label} ({field.cell})</option>)}
              </select>
              <select style={selectStyle} value={cellEdit.font} aria-label="Font" onChange={event => setCellEdit(current => current && ({ ...current, font: event.target.value }))}>
                <option value="">Font: keep as is</option>
                {["Arial", "Calibri", "Cambria", "Courier New", "Georgia", "Tahoma", "Times New Roman", "Verdana"].map(name => <option key={name} value={name}>{name}</option>)}
                {cellEdit.font && !["Arial", "Calibri", "Cambria", "Courier New", "Georgia", "Tahoma", "Times New Roman", "Verdana"].includes(cellEdit.font) && <option value={cellEdit.font}>{cellEdit.font}</option>}
              </select>
              <select style={selectStyle} value={cellEdit.size} aria-label="Size" onChange={event => setCellEdit(current => current && ({ ...current, size: event.target.value }))}>
                <option value="">Size</option>
                {[8, 9, 10, 11, 12, 14, 16, 18, 20].map(size => <option key={size} value={String(size)}>{size}</option>)}
                {cellEdit.size && ![8, 9, 10, 11, 12, 14, 16, 18, 20].includes(Number(cellEdit.size)) && <option value={cellEdit.size}>{cellEdit.size}</option>}
              </select>
            </div>
            <IPCRRichTextField value={cellEdit.html} onChange={html => setCellEdit(current => current && ({ ...current, html }))} placeholder="Type what this cell should show" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="etm-button ghost" onClick={() => setCellEdit(null)}>Cancel</button>
              <button type="button" className="etm-button primary" onClick={applyCellEdit}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
