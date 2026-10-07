import { useEffect, useRef, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Ban, ChevronRight, Grid2x2, PanelBottom, PanelLeft, PanelRight, PanelTop, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine,
  Baseline, Bold, Combine, Eraser, Eye, FileText, FileUp, GripVertical, ImagePlus, Italic, Layers, Loader2,
  MousePointerClick, PaintBucket, RefreshCw, Search, Square, Trash2, Type, Underline, Undo2, Redo2, RotateCcw, Upload, Ungroup, X, ZoomIn, ZoomOut,
} from "lucide-react";
import Swal from "sweetalert2";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { taskService, taskError } from "../tasks/taskService";
import type { GroupedTask } from "../tasks/types";
import IPCRGrid, { type IPCRGridHandle } from "./IPCRGrid";
import IPCRGridImageOverlay from "./IPCRGridImageOverlay";
import { compressImage, formatBytes } from "./imageCompress";
import IPCRGridRichTextOverlay from "./IPCRGridRichTextOverlay";
import IPCRFillForm from "./IPCRFillForm";
import IPCRLivePreview from "./IPCRLivePreview";
import IPCRRichTextField from "./IPCRRichTextField";
import { AUTOFILL_LABEL } from "./ipcrAutofill";
import { cellCoords, cellName, composeGroupedTasksHtml, fillGrid, flattenRuns, htmlToRuns, parseCellStyle, replaceRunsRange, runsNeedRichText, syncTaskCount, runsToEditorHtml } from "./ipcrGridUtils";
import { parseIPCRWorkbookFile } from "./ipcrExport";
import { buildIPCRPdfDocDefinition } from "./ipcrPdfExport";
import { DEFAULT_GRID_COLS, MONTH_NAMES, yearChoices, emptyGrid, fieldToken, slugifyKey, PAPER_SIZE_OPTIONS, type IPCRAutofill, type IPCRExpandable, type IPCRField, type IPCRFieldMetaEntry, type IPCRImageAnchor, type IPCRFieldType, type IPCRFieldValue, type IPCRGridData, type IPCRGridImage, type IPCROrientation, type IPCRPaperSize, type IPCRRichTextRun, type IPCRTemplate, type IPCRTemplateInput, type IPCRTemplateSampleChange } from "./types";
import pdfMake from "pdfmake/build/pdfmake";

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

const FONT_OPTIONS = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New", "Verdana"];

const VALIGN_OPTIONS: SelectOption<"top" | "middle" | "bottom">[] = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];

// A highlighted run of underscores is a fill-in line, which is marked as a whole cell (the line becomes a border).
const isUnderlineText = (text: string) => /^[\s_]{3,}$/.test(text) && text.includes("_");

const GROUP_DRAG_TYPE = "application/x-etm-grouped-task";

function applyRichUpdates(current: Record<string, IPCRRichTextRun[]>, updates: Record<string, IPCRRichTextRun[] | null>): Record<string, IPCRRichTextRun[]> {
  const next = { ...current };
  Object.entries(updates).forEach(([cell, runs]) => { if (runs) next[cell] = runs; else delete next[cell]; });
  return next;
}

// What a grouped task looks like when dropped into a cell: its name in bold, then one bullet per task.
function groupToRuns(group: GroupedTask): IPCRRichTextRun[] {
  const lines = group.tasks.length ? group.tasks.map(task => `\n\u2022 ${task.title}`).join("") : "\n(no tasks tagged yet)";
  return [{ text: `${group.name}(${group.tasks.length}/${group.tasks.length})`, bold: true }, { text: lines }];
}

function readImageFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface IPCRTemplateFormProps {
  template?: IPCRTemplate;
  // The same sheet editor, opened on someone's own generated IPCR instead of an admin template: no field
  // marking or sample document, only editing the sheet and dragging in their grouped activities.
  submissionMode?: boolean;
  onSave: (input: IPCRTemplateInput, sample: IPCRTemplateSampleChange) => Promise<void>;
  onCancel: () => void;
}

const FIELD_TYPE_LABEL: Record<IPCRFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  date: "Date",
  number: "Number",
  rating: "Rating (1–5, included in final rating)",
  month: "Month picker (January–December)",
  year: "Year picker",
  grouped_tasks: "Grouped Tasks (tag activities as evidence)",
};

export default function IPCRTemplateForm({ template, onSave, onCancel, submissionMode = false }: IPCRTemplateFormProps) {
  const gridRef = useRef<IPCRGridHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  // The sample document: a file picked now (uploaded when the template is saved), or the saved one marked for removal.
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [removeSample, setRemoveSample] = useState(false);
  const xlsxInputRef = useRef<HTMLInputElement>(null);
  const textColorRef = useRef<HTMLInputElement>(null);
  const fillColorRef = useRef<HTMLInputElement>(null);
  const borderColorRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(template?.name ?? "");
  const [fields, setFields] = useState<IPCRField[]>(template?.fields_config ?? []);
  const [images, setImages] = useState<IPCRGridImage[]>(template?.grid.images ?? []);
  const [richText, setRichText] = useState<Record<string, IPCRRichTextRun[]>>(template?.grid.richText ?? {});
  // Rows / columns marked so whoever fills in the IPCR can add copies of them. Saved with the sheet.
  const [expandable, setExpandable] = useState<IPCRExpandable>(template?.grid.expandable ?? { rows: {}, cols: {} });
  const [richTextModalOpen, setRichTextModalOpen] = useState(false);
  // The cell the mixed-formatting editor is open on.
  const [richTextCell, setRichTextCell] = useState<string | null>(null);
  const [richTextDraft, setRichTextDraft] = useState("");
  const [paperSize, setPaperSize] = useState<IPCRPaperSize>(template?.paper_size ?? "a3");
  const [orientation, setOrientation] = useState<IPCROrientation>(template?.orientation ?? "landscape");
  // Set only after an .xlsx import — bumping `seed` forces IPCRGrid (a mount-once, imperative
  // library wrapper — see its own header comment) to remount with the imported sheet as its new
  // starting content, the same way switching templates already does via the `key` prop below.
  const [importedGrid, setImportedGrid] = useState<{ seed: number; data: IPCRGridData } | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [borderColor, setBorderColor] = useState("#000000");
  const [borderWidth, setBorderWidth] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const selectedCellRef = useRef<string | null>(null);
  const richTextRef = useRef<Record<string, IPCRRichTextRun[]>>({});
  const pasteRichHistory = useRef(new Map<number, { before: Record<string, IPCRRichTextRun[] | null>; after: Record<string, IPCRRichTextRun[] | null> }>());
  selectedCellRef.current = selectedCell;
  richTextRef.current = richText;
  const [selectedStyle, setSelectedStyle] = useState("");
  // What is typed in the "add rows / columns" boxes (empty until the author types), and the ticks shown once it is valid.
  const [rowText, setRowText] = useState("");
  const [colText, setColText] = useState("");
  const [rowAbove, setRowAbove] = useState(true);
  const [rowBelow, setRowBelow] = useState(true);
  const [colBefore, setColBefore] = useState(true);
  const [colAfter, setColAfter] = useState(true);
  // Until the author edits the tags themselves, the last column of the sheet is repeatable by default.
  const hasSavedTags = (grid?: { expandable?: IPCRExpandable }) => !!grid?.expandable && (Object.keys(grid.expandable.rows).length > 0 || Object.keys(grid.expandable.cols).length > 0);
  const expandableTouched = useRef(hasSavedTags(template?.grid));
  const editExpandable = (change: (current: IPCRExpandable) => IPCRExpandable) => { expandableTouched.current = true; setExpandable(change); };
  const [formulaValue, setFormulaValue] = useState("");
  // Text currently highlighted inside a cell (open in-cell editor) or in the formula bar, so just that
  // text can be turned into a fill-in field. `value` is the whole text it was selected from.
  // Sample text typed under each field in the side panel, previewed live in the sheet (never saved).
  // The cell whose in-cell editor is open. The text layers drawn over the sheet (mixed formatting, sample preview)
  // are opaque, so they are held back from that cell or they would hide the editor and its highlighted text.
  const [editingCell, setEditingCell] = useState<string | null>(null);
  // The cell a grouped task being dragged would land in right now (highlighted while dragging).
  const [dropCell, setDropCell] = useState<string | null>(null);
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({});
  const [samplePreview, setSamplePreview] = useState<IPCRGridData | null>(null);
  const [textSelection, setTextSelection] = useState<{ start: number; end: number; text: string; value: string } | null>(null);
  const [dims, setDims] = useState({ rows: 0, cols: 0 });

  useEffect(() => {
    if (expandableTouched.current || dims.cols < 1) return;
    setExpandable({ rows: {}, cols: { [dims.cols - 1]: { before: true, after: true } } });
  }, [dims.cols]);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");

  const [testOpen, setTestOpen] = useState(false);
  const [testGrid, setTestGrid] = useState<IPCRGridData | null>(null);
  const [testValues, setTestValues] = useState<Record<string, IPCRFieldValue>>({});
  const [testMeta, setTestMeta] = useState<Record<string, IPCRFieldMetaEntry>>({});
  const [testGroups, setTestGroups] = useState<GroupedTask[]>([]);
  // The signed-in user's grouped tasks, always listed in the side panel so they can be previewed
  // and dropped into the sheet while designing.
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [previewGroupId, setPreviewGroupId] = useState<number | null>(null);
  // Bumped when a column/row is dragged to a new size so overlays laid over the grid re-measure.
  const [layoutVersion, setLayoutVersion] = useState(0);
  // Bumped by Reset: part of the grid's key, so it remounts from the saved template.
  const [resetVersion, setResetVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    taskService.listGroupedTasks()
      .then(list => { if (!cancelled) setTestGroups(list); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setGroupsLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [testRefreshKey, setTestRefreshKey] = useState(0);

  const currentStyle = parseCellStyle(selectedStyle);
  const sel = !!selectedCell;

  // Runs a grid-mutating action, then re-reads the selected cell's style so the toolbar's
  // active/pressed states (bold, font, colors, ...) reflect the change immediately — jspreadsheet
  // is imperative, so nothing here re-renders on its own the way DMT's own React-state grid does.
  function runStyleAction(action: () => void) {
    action();
    if (selectedCell) setSelectedStyle(gridRef.current?.getCellStyle(selectedCell) ?? "");
  }

  function refreshTest() {
    const snapshot = gridRef.current?.getSnapshot() ?? emptyGrid();
    setTestGrid({ ...snapshot, images, richText, expandable });
    setTestRefreshKey(key => key + 1);
  }

  function insertGroupIntoCell(group: GroupedTask, cell: string | null) {
    if (!cell) {
      void Swal.fire({ title: "Select a cell first", text: "Click a cell in the sheet, then insert the grouped task into it.", icon: "info", timer: 2200, showConfirmButton: false });
      return;
    }
    const handle = gridRef.current;
    if (!handle) return;
    const runs = groupToRuns(group);
    const before = richText[cell] ?? null;
    // One undoable step: the cell text AND the alignment change together. A list reads best left-aligned from
    // the top, whatever alignment the cell had (e.g. a centred column heading). Borders and fill are not touched.
    const stepId = handle.runAsOneStep(() => {
      handle.setCellValue(cell, flattenRuns(runs));
      handle.setCellStyle(cell, "text-align", "left");
      handle.setCellStyle(cell, "vertical-align", "top");
    });
    setRichText(current => ({ ...current, [cell]: runs }));
    // The mixed-formatting version lives outside the grid, so remember it for Ctrl+Z / Ctrl+Y to put back.
    if (stepId !== null) pasteRichHistory.current.set(stepId, { before: { [cell]: before }, after: { [cell]: runs } });
    setSelectedStyle(handle.getCellStyle(cell));
  }

  function handleGridDrop(event: React.DragEvent<HTMLDivElement>) {
    const raw = event.dataTransfer.getData(GROUP_DRAG_TYPE);
    if (!raw) return;
    event.preventDefault();
    const group = testGroups.find(item => item.id === Number(raw));
    if (!group) return;
    // jspreadsheet marks every cell with its coordinates; dropping elsewhere falls back to the selection.
    const td = (event.target as HTMLElement).closest<HTMLElement>("td[data-x][data-y]");
    const target = td ? cellName(Number(td.dataset.x), Number(td.dataset.y)) : selectedCell;
    insertGroupIntoCell(group, target);
  }

  function openRichTextEditor(cell: string | null = selectedCell) {
    if (!cell) return;
    const existing = richText[cell];
    const seed = runsToEditorHtml(existing ?? [{ text: gridRef.current?.getCellValue(cell) ?? "" }]);
    setRichTextCell(cell);
    setRichTextDraft(seed);
    setRichTextModalOpen(true);
  }

  function applyRichText() {
    const cell = richTextCell;
    const handle = gridRef.current;
    if (!cell || !handle) return;
    const runs = syncTaskCount(htmlToRuns(richTextDraft));
    const before = richText[cell] ?? null;
    const after = runsNeedRichText(runs) ? runs : null;
    // Keep the underlying plain cell in sync — it's what the grid itself renders/edits, and the
    // fallback if the richText overlay/export path is ever bypassed. One undoable step, with the
    // mixed-formatting version (kept outside the grid) following it.
    const stepId = handle.runAsOneStep(() => handle.setCellValue(cell, flattenRuns(runs)));
    setRichText(current => applyRichUpdates(current, { [cell]: after }));
    if (stepId !== null) pasteRichHistory.current.set(stepId, { before: { [cell]: before }, after: { [cell]: after } });
    setRichTextModalOpen(false);
  }

  // Double-clicking a cell with mixed formatting (a bold name in a list, a sentence with one underlined word) would
  // open the grid's plain text box, which cannot show bold or underline and so flattens how it looks while you
  // type. Those cells open the formatting editor instead.
  function handleEditingChange(cell: string | null) {
    setEditingCell(cell);
    if (cell && richText[cell]) {
      window.setTimeout(() => { gridRef.current?.cancelEdit(); setEditingCell(null); openRichTextEditor(cell); }, 0);
    }
  }

  function openTest() {
    setTestOpen(true);
    setTestValues(current => {
      const next = { ...current };
      fields.forEach(field => { if (!(field.key in next)) next[field.key] = field.type === "number" || field.type === "rating" || field.type === "month" || field.type === "year" ? null : ""; });
      return next;
    });
    if (!testGroups.length) taskService.listGroupedTasks().then(setTestGroups).catch(() => undefined);
    refreshTest();
  }

  function updateTestValue(key: string, value: IPCRFieldValue) {
    setTestValues(current => ({ ...current, [key]: value }));
  }

  function toggleTestGroupTag(field: IPCRField, groupId: number) {
    const current = testMeta[field.key]?.grouped_task_ids ?? [];
    const next = current.includes(groupId) ? current.filter(id => id !== groupId) : [...current, groupId];
    setTestMeta(currentMeta => ({ ...currentMeta, [field.key]: { grouped_task_ids: next } }));
    updateTestValue(field.key, composeGroupedTasksHtml(next, testGroups));
  }

  // Imported pictures know their cell + an offset inside it. The grid builds its rows/merges over the
  // next few frames, so measure twice: once it has mounted, and again after row heights settle.
  function placeAnchoredImages(anchors: IPCRImageAnchor[]) {
    if (!anchors.length) return;
    const place = () => {
      const handle = gridRef.current;
      if (!handle) return;
      const placed: IPCRGridImage[] = [];
      anchors.forEach(anchor => {
        const rect = handle.getCellRect(cellName(anchor.col, anchor.row));
        // The image layer starts 10px below the top of the grid wrapper (see .etm-ipcr-image-overlay).
        if (rect) placed.push({ id: anchor.id, dataUrl: anchor.dataUrl, x: Math.max(0, rect.left + anchor.dx), y: Math.max(0, rect.top + anchor.dy - 10), width: anchor.width, height: anchor.height });
      });
      if (placed.length) setImages(placed);
    };
    window.setTimeout(place, 400);
    window.setTimeout(place, 1500);
  }

  // Build the "what it would look like" layer: the sheet's own text with each field's sample text swapped in
  // for its {{token}}. It is drawn over the sheet (like mixed-formatting text), so the cells themselves — and
  // what gets saved — keep their tokens.
  useEffect(() => {
    const filledFields = fields.filter(field => field.type !== "grouped_tasks" && (sampleValues[field.key] ?? "").trim() !== "");
    const handle = gridRef.current;
    if (!filledFields.length || !handle) { setSamplePreview(null); return; }
    const snapshot = handle.getSnapshot();
    const filled = fillGrid({ ...snapshot, richText }, filledFields, sampleValues);
    const cells: Record<string, IPCRRichTextRun[]> = {};
    new Set(filledFields.map(field => field.cell)).forEach(cell => {
      if (cell === editingCell) return;
      const { col, row } = cellCoords(cell);
      const runs = filled.richText?.[cell];
      // A plain cell's bold / italic / underline lives on the cell, not on any text run — carry it onto the
      // preview text, or a bold cell would preview in regular weight.
      const own = parseCellStyle(snapshot.style[cell]);
      cells[cell] = runs && runs.length
        ? runs
        : [{ text: String(filled.data[row]?.[col] ?? ""), bold: own.bold || undefined, italic: own.italic || undefined, underline: own.underline || undefined }];
    });
    setSamplePreview({ ...filled, richText: cells });
  }, [sampleValues, fields, richText, formulaValue, selectedCell, editingCell, layoutVersion, dims.rows, dims.cols]);

  // Delete / Backspace on a selected cell (or range) empties it — text and mixed formatting; borders, fill and fonts stay.
  // Ignored while typing in an editor or any field, where the keys edit text as usual.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== "Delete" && event.key !== "Backspace") || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && !target.classList?.contains("jss_textarea") && target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const handle = gridRef.current;
      if (!handle || richTextModalOpen || testOpen || previewUrl) return;
      const cells = handle.getSelectedCells();
      if (!cells.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const before: Record<string, IPCRRichTextRun[] | null> = {};
      const after: Record<string, IPCRRichTextRun[] | null> = {};
      cells.forEach(cell => { before[cell] = richTextRef.current[cell] ?? null; after[cell] = null; });
      const stepId = handle.runAsOneStep(() => cells.forEach(cell => handle.setCellValue(cell, "")));
      setRichText(current => applyRichUpdates(current, after));
      if (stepId !== null) pasteRichHistory.current.set(stepId, { before, after });
      // A fill-in field whose cell was emptied no longer exists in the sheet.
      setFields(current => current.filter(field => field.inline || !cells.includes(field.cell)));
      setFormulaValue("");
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [richTextModalOpen, testOpen, previewUrl]);

  // Follow the highlighted text in the cell editor / formula bar. The grid closes its cell editor the moment the
  // mouse is pressed anywhere outside the sheet — including on the right-panel button — so the highlight is
  // remembered here (not cleared when the editor loses focus) until a different cell is selected or it is used.
  useEffect(() => {
    const isOurs = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && (el.hasAttribute("data-ipcr-formula") || !!el.closest(".etm-ipcr-grid-host"));
    const read = () => {
      const el = document.activeElement;
      if (!isOurs(el)) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      setTextSelection(end > start ? { start, end, text: el.value.slice(start, end), value: el.value } : null);
    };
    document.addEventListener("selectionchange", read);
    document.addEventListener("mouseup", read, true);
    document.addEventListener("keyup", read, true);
    return () => {
      document.removeEventListener("selectionchange", read);
      document.removeEventListener("mouseup", read, true);
      document.removeEventListener("keyup", read, true);
    };
  }, []);

  // One path for every way an image gets in (Image button, paste, drag-and-drop): size check, read,
  // scale a big picture down to a sensible first size, and place it at `at` (grid-wrapper pixels).
  async function addImageFromFile(file: File, at?: { x: number; y: number }) {
    let blob: Blob = file;
    if (file.size > MAX_IMAGE_BYTES) {
      // Over the limit: shrink it instead of refusing, and say what happened either way.
      void Swal.fire({ title: "Compressing image…", text: `${formatBytes(file.size)} is over the ${formatBytes(MAX_IMAGE_BYTES)} limit.`, allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
      let result: Awaited<ReturnType<typeof compressImage>>;
      try {
        result = await compressImage(file, MAX_IMAGE_BYTES);
      } catch {
        void Swal.fire({ title: "Couldn't read that image", text: "It may be damaged or in a format the browser can't open.", icon: "error" });
        return;
      }
      if (!result.fits) {
        void Swal.fire({
          title: "Image is still too large",
          html: `Original: <b>${formatBytes(result.originalBytes)}</b><br/>Smallest after compressing: <b>${formatBytes(result.finalBytes)}</b><br/>Limit: <b>${formatBytes(MAX_IMAGE_BYTES)}</b><br/><br/>Try a smaller or simpler image, or crop it first.`,
          icon: "error",
        });
        return;
      }
      blob = result.blob;
      void Swal.fire({ title: "Image compressed", text: `${formatBytes(result.originalBytes)} → ${formatBytes(result.finalBytes)}`, icon: "success", timer: 2200, showConfirmButton: false });
    }
    const dataUrl = await readImageFile(blob);
    const size = await new Promise<{ width: number; height: number }>(resolve => {
      const probe = new Image();
      probe.onload = () => resolve({ width: probe.naturalWidth || 90, height: probe.naturalHeight || 90 });
      probe.onerror = () => resolve({ width: 90, height: 90 });
      probe.src = dataUrl;
    });
    const scale = Math.min(1, 220 / Math.max(size.width, 1));
    const selectedRect = selectedCellRef.current ? gridRef.current?.getCellRect(selectedCellRef.current) : null;
    const x = at?.x ?? selectedRect?.left ?? 20;
    const y = at?.y ?? (selectedRect ? selectedRect.top - 10 : 20);
    setImages(current => [...current, {
      id: `img-${Date.now()}-${current.length}`, dataUrl,
      x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)),
      width: Math.max(24, Math.round(size.width * scale)), height: Math.max(24, Math.round(size.height * scale)),
    }]);
  }

  function handleImageDrop(event: React.DragEvent<HTMLDivElement>) {
    const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith("image/"));
    if (!files.length) return false;
    event.preventDefault();
    // Dropped coordinates -> pixels inside the grid wrapper. The wrapper sits inside the zoom container,
    // whose scale has to be undone to get wrapper-local CSS pixels.
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / zoom;
    const y = (event.clientY - box.top) / zoom - 10;
    files.forEach((file, index) => { void addImageFromFile(file, { x: x + index * 24, y: y + index * 24 }); });
    return true;
  }

  // An image copied from anywhere (a screenshot, "Copy image" in the browser) can be pasted straight
  // in: it lands at the selected cell, ready to drag and resize.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !target.classList?.contains("jss_textarea") && target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const file = Array.from(event.clipboardData?.files ?? []).find(item => item.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      void addImageFromFile(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dropping a file anywhere the designer doesn't handle would make the browser open it in the tab
  // (and throw the unsaved template away) — swallow those.
  useEffect(() => {
    const hasFiles = (event: DragEvent) => !!event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");
    const block = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault(); };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => { window.removeEventListener("dragover", block); window.removeEventListener("drop", block); };
  }, []);

  async function handleImportXlsx(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const parsed = await parseIPCRWorkbookFile(file);
      setImportedGrid(current => ({ seed: (current?.seed ?? 0) + 1, data: parsed }));
      setRichText(parsed.richText ?? {});
      // The new sheet replaces the old one, pictures included; the imported ones are placed once the
      // new grid is on screen (their position is a cell + offset, which needs real cell positions).
      setImages([]);
      // Pictures over the size limit are compressed like any other upload; any that still don't fit are reported.
      const prepared: IPCRImageAnchor[] = [];
      const tooLarge: string[] = [];
      let shrunk = 0;
      for (const anchor of parsed.imageAnchors) {
        if (anchor.bytes <= MAX_IMAGE_BYTES) { prepared.push(anchor); continue; }
        try {
          const result = await compressImage(await (await fetch(anchor.dataUrl)).blob(), MAX_IMAGE_BYTES);
          if (result.fits) { prepared.push({ ...anchor, dataUrl: await readImageFile(result.blob), bytes: result.finalBytes }); shrunk++; }
          else tooLarge.push(`${formatBytes(result.originalBytes)} → ${formatBytes(result.finalBytes)}`);
        } catch { tooLarge.push(formatBytes(anchor.bytes)); }
      }
      placeAnchoredImages(prepared);
      if (tooLarge.length) {
        void Swal.fire({ title: `${tooLarge.length} picture${tooLarge.length > 1 ? "s" : ""} still too large`, html: `Even after compressing, ${tooLarge.length > 1 ? "they stay" : "it stays"} over the ${formatBytes(MAX_IMAGE_BYTES)} limit (${tooLarge.join("; ")}), so ${tooLarge.length > 1 ? "they were" : "it was"} left out. Add a smaller version with the Image button.`, icon: "warning" });
      } else if (shrunk) {
        void Swal.fire({ title: "Pictures compressed", text: `${shrunk} picture${shrunk > 1 ? "s were" : " was"} over ${formatBytes(MAX_IMAGE_BYTES)} and ${shrunk > 1 ? "were" : "was"} compressed to fit.`, icon: "info", timer: 2600, showConfirmButton: false });
      }
      setSelectedCell(null);
      setFormulaValue("");
      setSelectedStyle("");
    } catch {
      void Swal.fire({ title: "Couldn't read that file", text: "Make sure it's a valid .xlsx spreadsheet.", icon: "error" });
    } finally {
      setImporting(false);
    }
  }

  function commitFormulaBar() {
    if (!selectedCell) return;
    gridRef.current?.setCellValue(selectedCell, formulaValue);
  }

  async function handleClearSheet() {
    const result = await Swal.fire({
      title: "Clear the sheet?",
      text: "This removes every cell, style, merge, and image in the layout below. This can't be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Clear",
      confirmButtonColor: "#c0605a",
    });
    if (!result.isConfirmed) return;
    setImportedGrid(current => ({ seed: (current?.seed ?? 0) + 1, data: emptyGrid() }));
    setImages([]);
    setRichText({});
    setSelectedCell(null);
    setFormulaValue("");
    setSelectedStyle("");
  }

  async function handleImagePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await addImageFromFile(file, { x: 20, y: 20 });
  }

  // For a Date field: whether it starts as today's date or is left for the person to pick. Null = cancelled.
  async function askDateMode(): Promise<"today" | "choose" | null> {
    const { value, isDismissed } = await Swal.fire({
      title: "Which date?",
      text: "Should this date be the current date, or should whoever fills in the IPCR choose it?",
      input: "select",
      inputOptions: { today: "Current date (filled in automatically)", choose: "Let them choose the date" },
      inputValue: "choose",
      showCancelButton: true,
      confirmButtonText: "Add field",
    });
    if (isDismissed) return null;
    return value === "today" ? "today" : "choose";
  }

  // For a text field: the "utilize the existing information" choice. Returns undefined when the admin picks "no".
  async function askAutofill(): Promise<IPCRAutofill | undefined | null> {
    const { value, isDismissed } = await Swal.fire({
      title: "Utilize the existing information?",
      text: "Start this field filled in with the details of whoever is making the IPCR. They can still change it.",
      input: "select",
      inputOptions: { none: "No — leave it blank", ...AUTOFILL_LABEL },
      inputValue: "none",
      showCancelButton: true,
      confirmButtonText: "Add field",
    });
    if (isDismissed) return null;
    return value && value !== "none" ? (value as IPCRAutofill) : undefined;
  }

  // Turn just the highlighted words of a cell (e.g. "<NAME>" inside a sentence) into a fill-in field: the words
  // are swapped for a {{token}} that is filled with the user's answer in place, surrounding text untouched.
  async function markSelectedText() {
    const grid = gridRef.current;
    const selection = textSelection;
    const cell = selectedCell;
    if (!grid || !selection || !cell) return;
    const suggestion = selection.text.replace(/[<>{}[\]]/g, "").trim().toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase());
    const { value: label } = await Swal.fire({
      title: `Make "${selection.text.length > 40 ? `${selection.text.slice(0, 40)}…` : selection.text}" a fill-in field`,
      input: "text",
      inputLabel: "What should users see for this field?",
      inputValue: suggestion,
      inputPlaceholder: "e.g. Employee name",
      showCancelButton: true,
      confirmButtonText: "Next",
      inputValidator: value => (!value || !value.trim() ? "Give this field a label." : undefined),
    });
    if (typeof label !== "string" || !label.trim()) return;

    const { grouped_tasks: _groupedTasks, ...inlineTypes } = FIELD_TYPE_LABEL;
    const { value: type } = await Swal.fire({
      title: "Field type",
      input: "select",
      inputOptions: inlineTypes,
      inputValue: "text",
      showCancelButton: true,
      confirmButtonText: "Add field",
    });
    if (typeof type !== "string" || !type) return;
    const autofill = type === "text" ? await askAutofill() : undefined;
    if (autofill === null) return;
    const dateMode = type === "date" ? await askDateMode() : undefined;
    if (dateMode === null) return;

    let key = slugifyKey(label);
    if (fields.some(field => field.key === key)) key = `${key}_${fields.length + 1}`;
    const token = fieldToken(key);

    grid.cancelEdit();
    const newValue = selection.value.slice(0, selection.start) + token + selection.value.slice(selection.end);
    const runs = richText[cell];
    setRichText(current => {
      if (!runs) return current;
      const next = { ...current };
      // Keep the cell's mixed formatting if the runs still match what was highlighted; otherwise drop them.
      if (flattenRuns(runs) === selection.value) next[cell] = replaceRunsRange(runs, selection.start, selection.end, token);
      else delete next[cell];
      return next;
    });
    grid.setCellValue(cell, newValue);
    setFormulaValue(newValue);
    setTextSelection(null);
    setFields(current => [...current, { cell, key, label: label.trim(), type: type as IPCRFieldType, inline: true, placeholder: selection.text, ...(autofill ? { autofill } : {}), ...(dateMode ? { dateMode } : {}) }]);
  }

  async function markSelectedCell() {
    const grid = gridRef.current;
    if (!grid) return;
    const cell = grid.getSelectedCell();
    if (!cell) {
      void Swal.fire({ title: "Select a cell first", text: "Click a cell in the sheet, then mark it as a fill-in field.", icon: "info" });
      return;
    }
    const { value: label } = await Swal.fire({
      title: `Mark ${cell} as a fill-in field`,
      input: "text",
      inputLabel: "What should users see for this field?",
      inputPlaceholder: "e.g. Employee name",
      showCancelButton: true,
      confirmButtonText: "Next",
      inputValidator: value => (!value || !value.trim() ? "Give this field a label." : undefined),
    });
    if (typeof label !== "string" || !label.trim()) return;

    const { value: type } = await Swal.fire({
      title: "Field type",
      input: "select",
      inputOptions: FIELD_TYPE_LABEL,
      inputValue: "text",
      showCancelButton: true,
      confirmButtonText: "Add field",
    });
    if (typeof type !== "string" || !type) return;
    const autofill = type === "text" ? await askAutofill() : undefined;
    if (autofill === null) return;
    const dateMode = type === "date" ? await askDateMode() : undefined;
    if (dateMode === null) return;

    let key = slugifyKey(label);
    if (fields.some(field => field.key === key)) key = `${key}_${fields.length + 1}`;

    // A cell that is just a typed line of underscores ("________") is a signature / fill-in line. Marking it would wipe the
    // line out, so turn it into a real bottom border instead and sit the value on top of it.
    const originalText = grid.getCellValue(cell);
    const wasUnderline = /^[\s_]{3,}$/.test(originalText) && originalText.includes("_");
    grid.setCellValue(cell, fieldToken(key));
    grid.markCell(cell, true);
    if (wasUnderline) {
      // After markCell, whose dashed outline would otherwise cover the new bottom border.
      grid.setCellStyle(cell, "border-bottom", "1px solid #000000");
      grid.setCellStyle(cell, "vertical-align", "bottom");
      grid.setCellStyle(cell, "text-align", "center");
      setSelectedStyle(grid.getCellStyle(cell));
    }
    setFields(current => [...current, { cell, key, label: label.trim(), type: type as IPCRFieldType, ...(autofill ? { autofill } : {}), ...(dateMode ? { dateMode } : {}), ...(wasUnderline ? { placeholder: originalText } : {}) }]);
  }

  function removeField(key: string) {
    const field = fields.find(item => item.key === key);
    if (field?.inline) {
      // Only part of the cell was the field: put the original words back instead of blanking the cell.
      const token = fieldToken(key);
      const original = field.placeholder ?? "";
      gridRef.current?.setCellValue(field.cell, gridRef.current.getCellValue(field.cell).split(token).join(original));
      setRichText(current => {
        const runs = current[field.cell];
        return runs ? { ...current, [field.cell]: runs.map(run => ({ ...run, text: run.text.split(token).join(original) })) } : current;
      });
    } else if (field) {
      gridRef.current?.setCellValue(field.cell, field.placeholder ?? "");
      gridRef.current?.markCell(field.cell, false);
    }
    setSampleValues(current => { const next = { ...current }; delete next[key]; return next; });
    setFields(current => current.filter(item => item.key !== key));
  }

  async function handlePreview() {
    // The preview shows fill-in fields as their raw {{placeholder}} text. Say so before opening it, naming the fields.
    const raw = gridRef.current?.getSnapshot() ?? emptyGrid();
    // Fill in what the author already supplied: the sample text typed under a field in the right panel, and today's
    // date for a Current-date field (that is what a user would get). Anything else is left as its placeholder.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const previewValues: Record<string, string> = {};
    fields.forEach(field => {
      const sample = (sampleValues[field.key] ?? "").trim();
      if (field.type !== "grouped_tasks" && sample) previewValues[field.key] = sample;
      else if (field.type === "date" && field.dateMode === "today") previewValues[field.key] = today;
    });
    const filledFields = fields.filter(field => field.key in previewValues);
    const current = filledFields.length ? fillGrid({ ...raw, richText }, filledFields, previewValues) : { ...raw, richText };
    const shown = new Set<string>();
    current.data.forEach(row => row.forEach(cell => {
      if (typeof cell === "string") for (const match of cell.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)) shown.add(match[1]);
    }));
    if (shown.size > 0) {
      const names = Array.from(shown).map(key => fields.find(field => field.key === key)?.label ?? key);
      const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const result = await Swal.fire({
        title: "Placeholders will show in the preview",
        html: `There ${shown.size === 1 ? "is still 1 field" : `are still ${shown.size} fields`} showing as a placeholder instead of a value:<br/><br/><b>${names.slice(0, 8).map(escape).join(", ")}${names.length > 8 ? `, and ${names.length - 8} more` : ""}</b><br/><br/>Are you sure you want to continue?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Continue to preview",
        cancelButtonText: "Cancel",
      });
      if (!result.isConfirmed) return;
    }
    setPreviewing(true);
    try {
      const snapshot = current;
      const blob = await pdfMake.createPdf(buildIPCRPdfDocDefinition({ ...snapshot, images, expandable }, paperSize, orientation)).getBlob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      // The preview is a page of its own: give it a history entry so the browser's Back button returns to the
      // designer (with every unsaved edit still in place) instead of leaving the screen.
      window.history.pushState({ ipcrPreview: true }, "");
    } catch {
      void Swal.fire({ icon: "error", title: "Preview failed", text: "Could not generate the preview PDF." });
    } finally {
      setPreviewing(false);
    }
  }

  // Throw away everything done since the designer was opened and go back to the template as it was last
  // saved (or to a blank sheet for a template that was never saved).
  function closePreview() {
    // Going through history keeps it in step with the browser's Back button; popstate does the closing.
    if (window.history.state?.ipcrPreview) window.history.back();
    else setPreviewUrl(null);
  }

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      // Leave our own history entry alone for the router: it knows nothing about it.
      if (event.state?.ipcrPreview) event.stopImmediatePropagation();
      else setPreviewUrl(current => { if (current) URL.revokeObjectURL(current); return null; });
    };
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, []);

  async function handleReset() {
    const result = await Swal.fire({
      title: template ? "Reset to the saved version?" : "Start over?",
      text: template
        ? "Everything you changed since opening this template — cells, formatting, fields, pictures, the name and page settings — is discarded, and it goes back to how it was last saved."
        : "The sheet, fields, pictures and settings go back to a blank template.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Reset",
      confirmButtonColor: "#c0392b",
    });
    if (!result.isConfirmed) return;
    setName(template?.name ?? "");
    setFields(template?.fields_config ?? []);
    setImages(template?.grid.images ?? []);
    setRichText(template?.grid.richText ?? {});
    setSampleFile(null); setRemoveSample(false);
    expandableTouched.current = hasSavedTags(template?.grid);
    setExpandable(template?.grid.expandable ?? { rows: {}, cols: {} });
    setRowText(""); setColText("");
    setPaperSize(template?.paper_size ?? "a3");
    setOrientation(template?.orientation ?? "landscape");
    setImportedGrid(null);
    setSampleValues({});
    setSamplePreview(null);
    setSelectedCell(null);
    setSelectedStyle("");
    setFormulaValue("");
    setTextSelection(null);
    setEditingCell(null);
    setPreviewGroupId(null);
    setError("");
    pasteRichHistory.current.clear();
    setLayoutVersion(version => version + 1);
    setResetVersion(version => version + 1);
  }

  async function handleSave() {
    if (saving) return;
    if (!name.trim()) {
      setError(submissionMode ? "Give this IPCR a file name." : "Give this template a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const snapshot = gridRef.current?.getSnapshot() ?? emptyGrid();
      await onSave({ name: name.trim(), grid: { ...snapshot, images, richText, expandable }, fields_config: fields, paper_size: paperSize, orientation }, { file: sampleFile, remove: removeSample && !sampleFile });
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSaving(false);
    }
  }

  const filteredFields = fieldSearch.trim()
    ? fields.filter(field => field.label.toLowerCase().includes(fieldSearch.trim().toLowerCase()) || field.cell.toLowerCase().includes(fieldSearch.trim().toLowerCase()))
    : fields;

  const tb = "p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:pointer-events-none text-muted-foreground";
  const tbActive = (on: boolean) => `p-1.5 rounded ${on ? "bg-primary/15 text-primary" : "hover:bg-accent text-muted-foreground"}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background select-none">
      {/* Header */}
      <div className="h-11 border-b border-border bg-card flex items-center px-3 gap-2 shrink-0">
        <button type="button" onClick={onCancel} className={tb} title={submissionMode ? "Back to Generate IPCR" : "Close designer"}><X className="w-4 h-4" /></button>
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder={submissionMode ? "File name" : "Template name"}
            maxLength={255}
            className="text-sm font-semibold text-foreground bg-transparent border-0 outline-none w-full truncate p-0"
          />
          <p className="text-[10px] text-muted-foreground leading-tight">{submissionMode ? "Editing your IPCR — drag your grouped activities into the sheet" : "IPCR Template Designer"}</p>
        </div>
        {error && <span className="text-[11px] text-destructive shrink-0">{error}</span>}
        <button type="button" onClick={() => void handleReset()} disabled={saving}
          title={template ? "Discard all changes and go back to the saved version" : "Clear everything and start over"}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 shrink-0">
          <RotateCcw className="w-3.5 h-3.5" />Reset
        </button>
        <button type="button" onClick={() => void handlePreview()} disabled={previewing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-40 shrink-0">
          <Eye className="w-3.5 h-3.5" />{previewing ? "Generating..." : "Preview"}
        </button>
        <button type="button" onClick={() => void handleSave()} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 shrink-0">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{saving ? "Saving..." : template ? "Save changes" : "Save template"}
        </button>
      </div>

      {/* PDF preview: a full-screen page, with a breadcrumb and Back to return to the designer */}
      {previewUrl && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background">
          <div className="h-12 border-b border-border bg-card flex items-center px-3 gap-3 shrink-0">
            <button type="button" onClick={closePreview} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-accent shrink-0" title="Back to the designer">
              <ArrowLeft className="w-3.5 h-3.5" />Back
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="text-muted-foreground shrink-0">{submissionMode ? "Generate IPCR" : "IPCR Templates"}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <button type="button" onClick={closePreview} className="text-muted-foreground hover:text-foreground hover:underline truncate max-w-[40vw]" title="Back to the designer">
                {name.trim() || "Untitled template"}
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold text-foreground shrink-0" aria-current="page">Preview</span>
            </nav>
            <p className="ml-auto text-[11px] text-muted-foreground truncate hidden md:block">Fill-in field placeholders render blank — nothing is saved</p>
          </div>
          <iframe src={`${previewUrl}#zoom=page-width`} title="Design preview" className="flex-1 w-full border-0 bg-muted/30" />
        </div>
      )}

      {/* Test-fill preview modal */}
      {testOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
              <p className="text-sm font-semibold text-foreground">Test this template<span className="text-xs text-muted-foreground font-normal ml-2">fill in values to see exactly what a user would see — nothing is saved</span></p>
              <button type="button" onClick={() => setTestOpen(false)} className="p-1 rounded hover:bg-accent" title="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid gap-4" style={{ gridTemplateColumns: "320px 1fr" }}>
              <div>
                <IPCRFillForm fields={fields} values={testValues} meta={testMeta} groups={testGroups} onUpdateValue={updateTestValue} onToggleGroupTag={toggleTestGroupTag} />
                <button type="button" className="etm-button primary small" style={{ marginTop: 10 }} onClick={refreshTest}><RefreshCw size={14} /> Refresh preview</button>
              </div>
              <div>{testGrid && <IPCRLivePreview grid={testGrid} fields={fields} values={testValues} refreshKey={testRefreshKey} />}</div>
            </div>
          </div>
        </div>
      )}

      {/* Rich text editing modal — for cells like "I, NAME, TITLE of OFFICE, commit to..." where
          only part of the text is bold/underlined, which the grid's one-style-per-cell model
          can't represent directly. */}
      {richTextModalOpen && richTextCell && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
              <p className="text-sm font-semibold text-foreground">Mixed formatting — cell {richTextCell}</p>
              <button type="button" onClick={() => setRichTextModalOpen(false)} className="p-1 rounded hover:bg-accent" title="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-2">Select part of the text and bold/underline just that part — e.g. a name inside a sentence.</p>
              <IPCRRichTextField value={richTextDraft} onChange={setRichTextDraft} placeholder="Cell text" />
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button type="button" className="etm-button ghost small" onClick={() => setRichTextModalOpen(false)}>Cancel</button>
              <button type="button" className="etm-button primary small" onClick={applyRichText}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-10 border-b border-border bg-card flex items-center px-2 gap-1 shrink-0 overflow-x-auto">
        <button type="button" onClick={() => gridRef.current?.undo()} className={tb} title="Undo"><Undo2 className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => gridRef.current?.redo()} className={tb} title="Redo"><Redo2 className="w-3.5 h-3.5" /></button>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />
        <button type="button" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)))} className={tb} title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
        <span className="text-[10px] text-muted-foreground w-9 text-center shrink-0">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} className={tb} title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        <div className="shrink-0" style={{ width: 92 }} title="Paper size — used when generating a PDF">
          <ThemedSelect<SelectOption<IPCRPaperSize>>
            size="mini"
            classNamePrefix="etm-papersize-select"
            isSearchable={false}
            options={PAPER_SIZE_OPTIONS.map(option => ({ value: option.value, label: option.label }))}
            value={PAPER_SIZE_OPTIONS.map(option => ({ value: option.value, label: option.label })).find(option => option.value === paperSize)}
            onChange={option => setPaperSize(option?.value ?? paperSize)}
          />
        </div>
        <div className="flex rounded border border-border overflow-hidden h-6 shrink-0">
          <button type="button" onClick={() => setOrientation("portrait")} title="Portrait"
            className={`px-1.5 text-[10px] ${orientation === "portrait" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>P</button>
          <button type="button" onClick={() => setOrientation("landscape")} title="Landscape"
            className={`px-1.5 text-[10px] ${orientation === "landscape" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>L</button>
        </div>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        <div className="shrink-0" style={{ width: 120, opacity: sel ? 1 : 0.4 }} title="Font family — applies on screen and in the .xlsx export; PDF export uses a fixed font">
          <ThemedSelect<SelectOption<string>>
            size="mini"
            classNamePrefix="etm-fontfamily-select"
            isSearchable={false}
            isDisabled={!sel}
            options={FONT_OPTIONS.map(font => ({ value: font, label: font }))}
            value={{ value: currentStyle.fontFamily ?? FONT_OPTIONS[0], label: currentStyle.fontFamily ?? FONT_OPTIONS[0] }}
            onChange={option => { if (option) runStyleAction(() => gridRef.current?.setFontFamily(option.value)); }}
          />
        </div>
        <input type="number" min={5} max={72} disabled={!sel} value={currentStyle.fontSize ?? 12}
          onChange={event => runStyleAction(() => gridRef.current?.setFontSize(Math.max(5, Math.min(72, Number(event.target.value) || 12))))}
          className="w-12 text-[11px] border border-border rounded px-1.5 bg-background h-6 shrink-0 disabled:opacity-40" title="Font size (px)" />
        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        <button type="button" disabled={!sel} onClick={() => runStyleAction(() => gridRef.current?.toggleStyle("font-weight", "bold"))} className={tbActive(currentStyle.bold)} title="Bold"><Bold className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={!sel} onClick={() => runStyleAction(() => gridRef.current?.toggleStyle("font-style", "italic"))} className={tbActive(currentStyle.italic)} title="Italic"><Italic className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={!sel} onClick={() => runStyleAction(() => gridRef.current?.toggleStyle("text-decoration", "underline"))} className={tbActive(currentStyle.underline)} title="Underline"><Underline className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={!sel} onClick={() => openRichTextEditor()} className={tbActive(!!richText[selectedCell ?? ""])} title="Mixed formatting within this cell — bold/underline just part of the text (e.g. a name inside a sentence)"><Type className="w-3.5 h-3.5" /></button>
        <label className={`${tb} relative cursor-pointer ${!sel ? "opacity-30 pointer-events-none" : ""}`} title="Text color">
          <Baseline className="w-3.5 h-3.5" />
          <span className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-sm" style={{ backgroundColor: currentStyle.color || "#000000" }} />
          <input ref={textColorRef} type="color" value={currentStyle.color || "#000000"}
            onChange={event => runStyleAction(() => gridRef.current?.setSelectionColor("color", event.target.value))}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <label className={`${tb} relative cursor-pointer ${!sel ? "opacity-30 pointer-events-none" : ""}`} title="Fill color">
          <PaintBucket className="w-3.5 h-3.5" />
          <span className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-sm border border-border/50" style={{ backgroundColor: currentStyle.backgroundColor || "transparent" }} />
          <input ref={fillColorRef} type="color" value={currentStyle.backgroundColor || "#ffffff"}
            onChange={event => runStyleAction(() => gridRef.current?.setSelectionColor("background-color", event.target.value))}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <button type="button" disabled={!sel} onClick={() => runStyleAction(() => gridRef.current?.clearSelectionFill())} className={tb} title="Clear fill"><Eraser className="w-3.5 h-3.5" /></button>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        <button type="button" disabled={!sel} onClick={() => runStyleAction(() => gridRef.current?.alignSelection("left"))} className={tbActive(!currentStyle.align || currentStyle.align === "left")} title="Align left"><AlignLeft className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={!sel} onClick={() => runStyleAction(() => gridRef.current?.alignSelection("center"))} className={tbActive(currentStyle.align === "center")} title="Align center"><AlignCenter className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={!sel} onClick={() => runStyleAction(() => gridRef.current?.alignSelection("right"))} className={tbActive(currentStyle.align === "right")} title="Align right"><AlignRight className="w-3.5 h-3.5" /></button>
        <div className="shrink-0" style={{ width: 74, opacity: sel ? 1 : 0.4 }} title="Vertical alignment">
          <ThemedSelect<SelectOption<"top" | "middle" | "bottom">>
            size="mini"
            classNamePrefix="etm-valign-select"
            isSearchable={false}
            isDisabled={!sel}
            options={VALIGN_OPTIONS}
            value={VALIGN_OPTIONS.find(option => option.value === (currentStyle.valign ?? "top"))}
            onChange={option => { if (option) runStyleAction(() => gridRef.current?.setVerticalAlign(option.value)); }}
          />
        </div>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        <button type="button" onClick={() => gridRef.current?.mergeSelection()} className={`${tb} text-[10px] font-medium px-1.5 shrink-0`} title="Merge selected cells"><Combine className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => gridRef.current?.unmergeSelection()} className={`${tb} text-[10px] font-medium px-1.5 shrink-0`} title="Unmerge cell"><Ungroup className="w-3.5 h-3.5" /></button>
        <div className={`flex items-center shrink-0 ${!sel ? "opacity-40 pointer-events-none" : ""}`} role="group" aria-label="Cell borders">
          <button type="button" className={tb} title="Top border (click again to remove)" onClick={() => gridRef.current?.applyBorder("top", borderColor, borderWidth)}><PanelTop className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb} title="Left border (click again to remove)" onClick={() => gridRef.current?.applyBorder("left", borderColor, borderWidth)}><PanelLeft className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb} title="Bottom border (click again to remove)" onClick={() => gridRef.current?.applyBorder("bottom", borderColor, borderWidth)}><PanelBottom className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb} title="Right border (click again to remove)" onClick={() => gridRef.current?.applyBorder("right", borderColor, borderWidth)}><PanelRight className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb} title="Border around every cell" onClick={() => gridRef.current?.applyBorder("all", borderColor, borderWidth)}><Grid2x2 className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb} title="Outer box around the selection" onClick={() => gridRef.current?.applyBorder("outer", borderColor, borderWidth)}><Square className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb} title="Clear borders" onClick={() => gridRef.current?.applyBorder("none", borderColor, borderWidth)}><Ban className="w-3.5 h-3.5" /></button>
          <select value={borderWidth} onChange={event => setBorderWidth(Number(event.target.value))} title="Border thickness"
            className="w-12 text-[11px] border border-border rounded px-1 bg-background text-foreground h-6 shrink-0">
            <option value={1}>1px</option>
            <option value={2}>2px</option>
            <option value={3}>3px</option>
          </select>
        </div>
        <label className={`${tb} relative cursor-pointer ${!sel ? "opacity-30 pointer-events-none" : ""}`} title="Border color">
          <Square className="w-3.5 h-3.5" />
          <span className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-sm" style={{ backgroundColor: borderColor }} />
          <input ref={borderColorRef} type="color" value={borderColor} onChange={event => setBorderColor(event.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        <span className="text-[9px] text-muted-foreground uppercase font-semibold shrink-0">Rows</span>
        <button type="button" onClick={() => gridRef.current?.insertRow("above")} className={`${tb} text-[10px] px-1 shrink-0`} title="Insert row above"><ArrowUpToLine className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => gridRef.current?.insertRow("below")} className={`${tb} text-[10px] px-1 shrink-0`} title="Insert row below"><ArrowDownToLine className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => gridRef.current?.deleteRow()} className={`${tb} shrink-0`} title="Delete selected row(s)"><Trash2 className="w-3 h-3" /></button>
        <span className="text-[9px] text-muted-foreground uppercase font-semibold ml-1 shrink-0">Cols</span>
        <button type="button" onClick={() => gridRef.current?.insertColumn("left")} className={`${tb} text-[10px] px-1 shrink-0`} title="Insert column left"><ArrowLeftToLine className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => gridRef.current?.insertColumn("right")} className={`${tb} text-[10px] px-1 shrink-0`} title="Insert column right"><ArrowRightToLine className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => gridRef.current?.deleteColumn()} className={`${tb} shrink-0`} title="Delete selected column(s)"><Trash2 className="w-3 h-3" /></button>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        <input ref={xlsxInputRef} type="file" accept=".xlsx" className="hidden" onChange={event => void handleImportXlsx(event)} />
        <button type="button" onClick={() => xlsxInputRef.current?.click()} disabled={importing} className={`${tb} flex items-center gap-1 text-[10px] px-1.5 shrink-0`} title="Import an .xlsx file as the starting layout (first sheet only)">
          {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}XLSX
        </button>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={event => void handleImagePick(event)} />
        <button type="button" onClick={() => fileInputRef.current?.click()} className={`${tb} flex items-center gap-1 text-[10px] px-1.5 shrink-0`} title="Insert an image (e.g. a logo)">
          <ImagePlus className="w-3.5 h-3.5" />Image
        </button>
        <button type="button" onClick={() => void handleClearSheet()} className={`${tb} flex items-center gap-1 text-[10px] px-1.5 text-destructive shrink-0`} title="Clear the sheet">
          <Trash2 className="w-3 h-3" />Clear
        </button>
      </div>

      {/* Formula bar */}
      <div className="h-8 border-b border-border bg-card flex items-center gap-2 px-2 shrink-0">
        <div className="w-20 h-6 border border-border rounded text-[11px] flex items-center justify-center text-muted-foreground bg-background shrink-0">
          {selectedCell || "—"}
        </div>
        <span className="text-xs italic font-serif text-muted-foreground shrink-0">fx</span>
        <input
          data-ipcr-formula="true"
          value={formulaValue}
          disabled={!sel}
          onChange={event => setFormulaValue(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitFormulaBar(); } }}
          onBlur={commitFormulaBar}
          placeholder={sel ? "Type a value, or insert a field from the right panel" : "Select a cell to edit"}
          className="flex-1 h-6 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Grid */}
        <div className="flex-1 overflow-auto bg-muted/40">
          <div style={{ zoom }}>
            <div className="relative inline-block pb-10 pr-10 etm-ipcr-grid-overlay-wrap"
              onDragOver={event => {
                const types = Array.from(event.dataTransfer.types);
                if (types.includes(GROUP_DRAG_TYPE) || types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }
                if (types.includes(GROUP_DRAG_TYPE)) {
                  // Same lookup the drop itself uses, so the highlight is exactly where it will land.
                  const td = (event.target as HTMLElement).closest<HTMLElement>("td[data-x][data-y]");
                  const cell = td ? cellName(Number(td.dataset.x), Number(td.dataset.y)) : selectedCell;
                  setDropCell(current => current === cell ? current : cell);
                }
              }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropCell(null); }}
              onDrop={event => { setDropCell(null); if (!handleImageDrop(event)) handleGridDrop(event); }}>
              <IPCRGrid
                key={`${importedGrid ? `import-${importedGrid.seed}` : (template?.id ?? "new")}-reset${resetVersion}`}
                ref={gridRef}
                value={importedGrid?.data ?? template?.grid ?? emptyGrid()}
                editable
                minCols={DEFAULT_GRID_COLS}
                onSelectionChange={info => { if (info?.cell !== selectedCellRef.current) setTextSelection(null); setSelectedCell(info?.cell ?? null); setFormulaValue(info?.value ?? ""); setSelectedStyle(info?.style ?? ""); }}
                onDimensionsChange={setDims}
                onLayoutChange={() => setLayoutVersion(version => version + 1)}
                onEditingChange={handleEditingChange}
                onRichTextPasted={(updates, pasteId) => setRichText(current => {
                  // Remember what these cells held before, so undoing the paste can put it back.
                  const before: Record<string, IPCRRichTextRun[] | null> = {};
                  Object.keys(updates).forEach(cell => { before[cell] = current[cell] ?? null; });
                  pasteRichHistory.current.set(pasteId, { before, after: updates });
                  return applyRichUpdates(current, updates);
                })}
                onPasteHistory={(pasteId, direction) => {
                  const entry = pasteRichHistory.current.get(pasteId);
                  if (entry) setRichText(current => applyRichUpdates(current, direction === "undo" ? entry.before : entry.after));
                }}
                onCellEdited={(cell, value) => {
                  // A cell with mixed formatting is drawn by an opaque overlay on top of the grid, which
                  // would keep showing the old text after the user types a new one — so once the text is
                  // edited by hand, the stale rich-text version is dropped and the typed text shows.
                  setRichText(current => {
                    const runs = current[cell];
                    if (!runs || flattenRuns(runs) === value) return current;
                    const next = { ...current };
                    delete next[cell];
                    return next;
                  });
                  setFormulaValue(value);
                }}
              />
              <IPCRGridImageOverlay images={images} editable onChange={setImages} />
              <IPCRGridRichTextOverlay
                grid={{ ...(importedGrid?.data ?? template?.grid ?? emptyGrid()), richText: Object.fromEntries(Object.entries(richText).filter(([cell]) => cell !== editingCell && !(samplePreview?.richText && cell in samplePreview.richText))) }}
                gridRef={gridRef}
                refreshKey={`${zoom}-${dims.rows}-${dims.cols}-${layoutVersion}-${editingCell ?? ""}-${selectedStyle}`}
                autoFitRows
              />
              {dropCell && (() => {
                const rect = gridRef.current?.getCellRect(dropCell);
                if (!rect) return null;
                return (
                  <div className="pointer-events-none absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, zIndex: 6, outline: "2px solid #0d8a92", outlineOffset: -1, background: "rgba(13,138,146,.16)" }}>
                    <span className="absolute left-0 -top-5 px-1.5 py-0.5 rounded bg-[#0d8a92] text-white text-[10px] font-semibold whitespace-nowrap">Drop in {dropCell}</span>
                  </div>
                );
              })()}
              {samplePreview && (
                <IPCRGridRichTextOverlay
                  grid={samplePreview}
                  gridRef={gridRef}
                  refreshKey={`${zoom}-${dims.rows}-${dims.cols}-${layoutVersion}-sample-${Object.entries(sampleValues).map(([key, value]) => `${key}=${value}`).join("|")}`}
                />
              )}
            </div>
          </div>
        </div>

        {/* Fill-in fields sidebar */}
        <div className="w-64 border-l border-border bg-card flex flex-col shrink-0">
          {!submissionMode && <>
          <div className="p-3 border-b border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fill-in fields</p>
            {/* onMouseDown keeps focus (and the text highlight) in the cell editor when this is clicked. */}
            <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { if (textSelection && !isUnderlineText(textSelection.text)) void markSelectedText(); else { gridRef.current?.cancelEdit(); setTextSelection(null); void markSelectedCell(); } }}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90">
              {textSelection && !isUnderlineText(textSelection.text) ? <Type className="w-3.5 h-3.5" /> : <MousePointerClick className="w-3.5 h-3.5" />}
              {textSelection && !isUnderlineText(textSelection.text) ? "Mark selected text" : "Mark selected cell"}
            </button>
            <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
              {textSelection && !isUnderlineText(textSelection.text)
                ? <>Turns <strong className="text-foreground">&ldquo;{textSelection.text.length > 30 ? `${textSelection.text.slice(0, 30)}…` : textSelection.text}&rdquo;</strong> into a blank users fill in. The rest of the cell stays as it is.</>
                : "Select a cell, then use the button to turn it into a blank users fill in. To make just some words a field, double-click the cell and highlight them first."}
            </p>
          </div>
          {(() => {
            const letter = (index: number) => { let name = ""; let n = index; do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0); return name; };
            const rowNumber = parseInt(rowText, 10);
            const row = rowNumber >= 1 && rowNumber <= dims.rows ? rowNumber - 1 : null;
            const colIndex = colText ? colText.split("").reduce((sum, char) => sum * 26 + (char.charCodeAt(0) - 64), 0) - 1 : -1;
            const col = colIndex >= 0 && colIndex < dims.cols ? colIndex : null;
            const rowMark = row === null ? undefined : expandable.rows[row];
            const colMark = col === null ? undefined : expandable.cols[col];
            const box = "flex items-center gap-1.5 text-[11px] text-foreground";
            const pick = "rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground";
            const tags = [
              ...Object.entries(expandable.rows).map(([index, mark]) => ({ key: `r${index}`, text: `Row ${Number(index) + 1}`, mark, axis: "rows" as const, index: Number(index) })),
              ...Object.entries(expandable.cols).map(([index, mark]) => ({ key: `c${index}`, text: `Column ${letter(Number(index))}`, mark, axis: "cols" as const, index: Number(index) })),
            ];
            const button = "ml-auto rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40";
            return (
              <div className="border-b border-border p-3 flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Let users add rows / columns</p>
                <p className="text-[10px] text-muted-foreground leading-snug">Type a row number or column letter, choose where users may add a copy of it (with its fields), then press Add. The last column is set up by default.</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-semibold text-foreground w-14">Row</span>
                  <input className={`${pick} w-16`} inputMode="numeric" aria-label="Row to tag" placeholder="e.g. 43" value={rowText}
                    onChange={event => setRowText(event.target.value.replace(/\D/g, "").slice(0, 5))} />
                  <span className="text-[10px] text-muted-foreground">1–{dims.rows}</span>
                </div>
                {row !== null ? (
                  <div className="flex items-center gap-3 pl-1">
                    <label className={box}><input type="checkbox" checked={rowAbove} onChange={event => setRowAbove(event.target.checked)} />Above</label>
                    <label className={box}><input type="checkbox" checked={rowBelow} onChange={event => setRowBelow(event.target.checked)} />Below</label>
                    <button type="button" disabled={!rowAbove && !rowBelow} className={button}
                      onClick={() => { editExpandable(current => ({ ...current, rows: { ...current.rows, [row]: { before: rowAbove, after: rowBelow } } })); setRowText(""); setRowAbove(true); setRowBelow(true); }}>{rowMark ? "Update" : "Add"}</button>
                  </div>
                ) : (
                  <button type="button" disabled className={`${button} self-end`}>Add</button>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-semibold text-foreground w-14">Column</span>
                  <input className={`${pick} w-16 uppercase`} aria-label="Column to tag" placeholder="e.g. L" value={colText}
                    onChange={event => setColText(event.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3))} />
                  <span className="text-[10px] text-muted-foreground">A–{letter(Math.max(0, dims.cols - 1))}</span>
                </div>
                {col !== null ? (
                  <div className="flex items-center gap-3 pl-1">
                    <label className={box}><input type="checkbox" checked={colBefore} onChange={event => setColBefore(event.target.checked)} />Before</label>
                    <label className={box}><input type="checkbox" checked={colAfter} onChange={event => setColAfter(event.target.checked)} />After</label>
                    <button type="button" disabled={!colBefore && !colAfter} className={button}
                      onClick={() => { editExpandable(current => ({ ...current, cols: { ...current.cols, [col]: { before: colBefore, after: colAfter } } })); setColText(""); setColBefore(true); setColAfter(true); }}>{colMark ? "Update" : "Add"}</button>
                  </div>
                ) : (
                  <button type="button" disabled className={`${button} self-end`}>Add</button>
                )}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1" aria-label="Tagged rows and columns">
                    {tags.map(tag => (
                      <span key={tag.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold">
                        <button type="button" className="hover:underline" onClick={() => { if (tag.axis === "rows") { setRowText(String(tag.index + 1)); setRowAbove(tag.mark.before); setRowBelow(tag.mark.after); } else { setColText(letter(tag.index)); setColBefore(tag.mark.before); setColAfter(tag.mark.after); } }} title="Edit this one">{tag.text} · {tag.mark.before && tag.mark.after ? (tag.axis === "rows" ? "above & below" : "before & after") : tag.mark.before ? (tag.axis === "rows" ? "above" : "before") : (tag.axis === "rows" ? "below" : "after")}</button>
                        <button type="button" aria-label={`Remove tag from ${tag.text}`} onClick={() => editExpandable(current => { const next = { ...current[tag.axis] }; delete next[tag.index]; return { ...current, [tag.axis]: next }; })}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          </>}
          <div className={`border-b border-border p-2 overflow-y-auto ${submissionMode ? "flex-1" : "max-h-[45%] shrink-0"}`}>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1"><Layers className="w-3 h-3" /> {submissionMode ? "Your grouped activities" : "Grouped tasks"}</p>
            {groupsLoading ? <p className="text-xs text-muted-foreground px-1 py-1">Loading…</p>
              : testGroups.length === 0 ? <p className="text-xs text-muted-foreground px-1 py-1">No grouped tasks yet. Create some in Task Grouping.</p>
              : <div className="flex flex-col gap-1">
                {testGroups.map(group => {
                  const open = previewGroupId === group.id;
                  return (
                    <div key={group.id} className={`rounded-lg border text-xs ${open ? "border-primary/60 bg-primary/5" : "border-border"}`}>
                      <div
                        draggable
                        onDragEnd={() => setDropCell(null)}
                        onDragStart={event => { event.dataTransfer.setData(GROUP_DRAG_TYPE, String(group.id)); event.dataTransfer.setData("text/plain", group.name); event.dataTransfer.effectAllowed = "copy"; }}
                        onClick={() => setPreviewGroupId(open ? null : group.id)}
                        title="Click to preview, or drag onto a cell to insert it there"
                        className="flex items-center gap-1.5 px-2 py-1.5 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-foreground block truncate">{group.name}</span>
                          <span className="text-muted-foreground block truncate text-[10px]">{group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}</span>
                        </span>
                      </div>
                      {open && (
                        <div className="border-t border-border px-2 py-1.5 flex flex-col gap-1.5">
                          <ul className="list-disc pl-4 text-[11px] text-foreground flex flex-col gap-0.5">
                            {group.tasks.length ? group.tasks.map(task => <li key={task.id}>{task.title}</li>) : <li className="list-none -ml-4 text-muted-foreground">(no tasks tagged yet)</li>}
                          </ul>
                          <button type="button" disabled={!sel} onClick={() => insertGroupIntoCell(group, selectedCell)}
                            className="w-full px-2 py-1 rounded bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 disabled:opacity-40">
                            {sel ? `Insert into ${selectedCell}` : "Select a cell to insert"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}
          </div>
          {!submissionMode && <>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {fields.length > 4 && (
              <div className="relative mb-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder="Search fields..."
                  className="w-full pl-6 pr-2 py-1.5 rounded border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
            )}
            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1 py-2">
                No fill-in fields yet. Select a cell in the sheet and click "Mark selected cell."
              </p>
            ) : filteredFields.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1 py-2">No fields match your search.</p>
            ) : (
              filteredFields.map(field => (
                <div key={field.key} className="flex flex-col gap-2 rounded-lg border border-border px-2.5 py-2 text-xs hover:border-primary/40">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">{field.cell}</span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-foreground block truncate">{field.label}</span>
                      <span className="text-muted-foreground block truncate text-[10px]">{FIELD_TYPE_LABEL[field.type]}{field.inline ? " · part of the cell text" : ""}</span>
                    </span>
                    <button type="button" aria-label={`Remove field ${field.label}`} onClick={() => removeField(field.key)} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {field.type === "date" && (
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      Starts as
                      <select value={field.dateMode ?? "choose"} onChange={event => setFields(current => current.map(item => item.key === field.key ? { ...item, dateMode: event.target.value as "today" | "choose" } : item))} aria-label={`Date for ${field.label}`} className="ml-auto rounded border border-border bg-background px-1 py-0.5 text-[10px] text-foreground">
                        <option value="choose">Chosen by the user</option>
                        <option value="today">Current date</option>
                      </select>
                    </label>
                  )}
                  {field.type === "text" && (
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <input type="checkbox" checked={!!field.autofill} onChange={event => setFields(current => current.map(item => item.key === field.key ? { ...item, autofill: event.target.checked ? "name" : undefined } : item))} />
                      Utilize the existing information
                      {field.autofill && (
                        <select value={field.autofill} onChange={event => setFields(current => current.map(item => item.key === field.key ? { ...item, autofill: event.target.value as IPCRAutofill } : item))} aria-label={`Information used for ${field.label}`} className="ml-auto rounded border border-border bg-background px-1 py-0.5 text-[10px] text-foreground">
                          {(Object.keys(AUTOFILL_LABEL) as IPCRAutofill[]).map(kind => <option key={kind} value={kind}>{AUTOFILL_LABEL[kind]}</option>)}
                        </select>
                      )}
                    </label>
                  )}
                  {field.type !== "grouped_tasks" && !(field.type === "date" && field.dateMode === "today") && (() => {
                    const sampleClass = "w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50";
                    const setSample = (value: string) => setSampleValues(current => ({ ...current, [field.key]: value }));
                    const sample = sampleValues[field.key] ?? "";
                    if (field.type === "textarea") return <textarea rows={2} value={sample} onChange={event => setSample(event.target.value)} placeholder="Type sample text to preview…" aria-label={`Sample text for ${field.label}`} className={`${sampleClass} resize-y`} />;
                    if (field.type === "date") return <input type="date" value={sample} onChange={event => setSample(event.target.value)} aria-label={`Sample date for ${field.label}`} className={sampleClass} />;
                    if (field.type === "number") return <input type="number" value={sample} onChange={event => setSample(event.target.value)} placeholder="Type a sample number…" aria-label={`Sample number for ${field.label}`} className={sampleClass} />;
                    if (field.type === "month" || field.type === "year") return (
                      <select value={sample} onChange={event => setSample(event.target.value)} aria-label={`Sample ${field.type} for ${field.label}`} className={sampleClass}>
                        <option value="">{field.type === "month" ? "Preview a month…" : "Preview a year…"}</option>
                        {field.type === "month"
                          ? MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)
                          : yearChoices().map(year => <option key={year} value={year}>{year}</option>)}
                      </select>
                    );
                    if (field.type === "rating") return (
                      <select value={sample} onChange={event => setSample(event.target.value)} aria-label={`Sample rating for ${field.label}`} className={sampleClass}>
                        <option value="">Preview a rating…</option>
                        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                    );
                    return <input type="text" value={sample} onChange={event => setSample(event.target.value)} placeholder="Type sample text to preview…" aria-label={`Sample text for ${field.label}`} className={sampleClass} />;
                  })()}
                </div>
              ))
            )}
          </div>
          {fields.length > 0 && (
            <div className="p-2 border-t border-border">
              <button type="button" onClick={openTest} className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-accent">
                <Eye className="w-3.5 h-3.5" /> Test this template
              </button>
            </div>
          )}
          <div className="p-2 border-t border-border flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sample document</p>
            <input ref={sampleInputRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > 15 * 1024 * 1024) { void Swal.fire({ title: "File is too large", text: "The limit is 15 MB.", icon: "error" }); return; }
                setSampleFile(file);
                setRemoveSample(false);
              }} />
            {(() => {
              const saved = !removeSample && template?.sample_document_url ? { name: template.sample_document_name || "Sample document", url: template.sample_document_url } : null;
              const shown = sampleFile ? { name: sampleFile.name, url: null as string | null } : saved;
              return shown ? (
                <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-[11px]">
                  <FileText className="w-3.5 h-3.5 shrink-0 text-primary" />
                  <span className="flex-1 min-w-0">
                    {shown.url ? <a href={shown.url} target="_blank" rel="noreferrer" className="block truncate font-medium text-foreground hover:underline">{shown.name}</a> : <span className="block truncate font-medium text-foreground">{shown.name}</span>}
                    {sampleFile && <span className="block text-[10px] text-muted-foreground">Will be uploaded when you save</span>}
                  </span>
                  <button type="button" aria-label="Remove sample document" className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"
                    onClick={() => { if (sampleFile) setSampleFile(null); else setRemoveSample(true); }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">{removeSample ? "The sample will be removed when you save." : "No sample document yet."}</p>
              );
            })()}
            <button type="button" onClick={() => sampleInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-accent">
              <Upload className="w-3.5 h-3.5" /> {sampleFile || (template?.sample_document_url && !removeSample) ? "Replace sample document" : "Upload sample document"}
            </button>
            <p className="text-[10px] text-muted-foreground leading-snug">PDF, Word, Excel or an image, up to 15 MB. Users can open it from the template.</p>
          </div>
          </>}
          <div className="p-2 border-t border-border text-[10px] text-muted-foreground">
            {dims.rows} rows × {dims.cols} cols{images.length > 0 ? ` · ${images.length} image${images.length > 1 ? "s" : ""}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
