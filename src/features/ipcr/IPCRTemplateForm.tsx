import { useRef, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine,
  Baseline, Bold, Combine, Eraser, Eye, FileUp, ImagePlus, Italic, Loader2,
  MousePointerClick, PaintBucket, RefreshCw, Search, Square, Trash2, Underline, Undo2, Redo2, Ungroup, X, ZoomIn, ZoomOut,
} from "lucide-react";
import Swal from "sweetalert2";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { taskService, taskError } from "../tasks/taskService";
import type { GroupedTask } from "../tasks/types";
import IPCRGrid, { type IPCRBorderKind, type IPCRGridHandle } from "./IPCRGrid";
import IPCRGridImageOverlay from "./IPCRGridImageOverlay";

import IPCRFillForm from "./IPCRFillForm";
import IPCRLivePreview from "./IPCRLivePreview";
import { composeGroupedTasksHtml, parseCellStyle } from "./ipcrGridUtils";
import { parseIPCRWorkbookFile } from "./ipcrExport";
import { buildIPCRPdfDocDefinition } from "./ipcrPdfExport";
import { emptyGrid, fieldToken, slugifyKey, PAPER_SIZE_OPTIONS, type IPCRField, type IPCRFieldMetaEntry, type IPCRFieldType, type IPCRFieldValue, type IPCRGridData, type IPCRGridImage, type IPCROrientation, type IPCRPaperSize, type IPCRTemplate, type IPCRTemplateInput } from "./types";
import pdfMake from "pdfmake/build/pdfmake";

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

const FONT_OPTIONS = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New", "Verdana"];

const VALIGN_OPTIONS: SelectOption<"top" | "middle" | "bottom">[] = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];

const BORDER_OPTIONS: SelectOption<IPCRBorderKind>[] = [
  { value: "all", label: "All sides" },
  { value: "outer", label: "Outer box" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "none", label: "Clear" },
];

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface IPCRTemplateFormProps {
  template?: IPCRTemplate;
  onSave: (input: IPCRTemplateInput) => Promise<void>;
  onCancel: () => void;
}

const FIELD_TYPE_LABEL: Record<IPCRFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  date: "Date",
  number: "Number",
  rating: "Rating (1–5, included in final rating)",
  grouped_tasks: "Grouped Tasks (tag activities as evidence)",
};

export default function IPCRTemplateForm({ template, onSave, onCancel }: IPCRTemplateFormProps) {
  const gridRef = useRef<IPCRGridHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);
  const textColorRef = useRef<HTMLInputElement>(null);
  const fillColorRef = useRef<HTMLInputElement>(null);
  const borderColorRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(template?.name ?? "");
  const [fields, setFields] = useState<IPCRField[]>(template?.fields_config ?? []);
  const [images, setImages] = useState<IPCRGridImage[]>(template?.grid.images ?? []);
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
  const [zoom, setZoom] = useState(1);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [formulaValue, setFormulaValue] = useState("");
  const [dims, setDims] = useState({ rows: 0, cols: 0 });
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");

  const [testOpen, setTestOpen] = useState(false);
  const [testGrid, setTestGrid] = useState<IPCRGridData | null>(null);
  const [testValues, setTestValues] = useState<Record<string, IPCRFieldValue>>({});
  const [testMeta, setTestMeta] = useState<Record<string, IPCRFieldMetaEntry>>({});
  const [testGroups, setTestGroups] = useState<GroupedTask[]>([]);
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
    setTestGrid({ ...snapshot, images });
    setTestRefreshKey(key => key + 1);
  }

  // While a cell is open for editing (double-click / F2 / just start typing), B/I/U format only the
  // words selected inside it; otherwise they style the whole selected cell(s).
  // The sheet closes its open cell editor on any mousedown outside the cell (a document-level
  // listener). Toolbar B/I/U must not trigger that, or the selected words lose their selection and
  // formatting falls back to the whole cell — so keep focus in the cell and stop the event here.
  function keepCellEditing(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function formatText(command: "bold" | "italic" | "underline", property: "font-weight" | "font-style" | "text-decoration", value: string) {
    if (gridRef.current?.isEditing()) gridRef.current.formatSelection(command);
    else runStyleAction(() => gridRef.current?.toggleStyle(property, value));
  }

  function openTest() {
    setTestOpen(true);
    setTestValues(current => {
      const next = { ...current };
      fields.forEach(field => { if (!(field.key in next)) next[field.key] = field.type === "number" || field.type === "rating" ? null : ""; });
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

  async function handleImportXlsx(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const parsed = await parseIPCRWorkbookFile(file);
      setImportedGrid(current => ({ seed: (current?.seed ?? 0) + 1, data: parsed }));
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
    // Only when the text was actually changed here — re-saving an unchanged value would flatten
    // the cell's word-level bold/italic/underline.
    if (gridRef.current?.getCellValue(selectedCell) === formulaValue) return;
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
    setSelectedCell(null);
    setFormulaValue("");
    setSelectedStyle("");
  }

  async function handleImagePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      void Swal.fire({ title: "Image is too large", text: "Please use an image under 1.5MB (resize it first).", icon: "error" });
      return;
    }
    const dataUrl = await readImageFile(file);
    setImages(current => [...current, { id: `img-${Date.now()}`, dataUrl, x: 20, y: 20, width: 90, height: 90 }]);
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

    let key = slugifyKey(label);
    if (fields.some(field => field.key === key)) key = `${key}_${fields.length + 1}`;

    grid.setCellValue(cell, fieldToken(key));
    grid.markCell(cell, true);
    setFields(current => [...current, { cell, key, label: label.trim(), type: type as IPCRFieldType }]);
  }

  function removeField(key: string) {
    const field = fields.find(item => item.key === key);
    if (field) {
      gridRef.current?.setCellValue(field.cell, "");
      gridRef.current?.markCell(field.cell, false);
    }
    setFields(current => current.filter(item => item.key !== key));
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      const snapshot = gridRef.current?.getSnapshot() ?? emptyGrid();
      const blob = await pdfMake.createPdf(buildIPCRPdfDocDefinition({ ...snapshot, images }, paperSize, orientation)).getBlob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch {
      void Swal.fire({ icon: "error", title: "Preview failed", text: "Could not generate the preview PDF." });
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave() {
    if (saving) return;
    if (!name.trim()) {
      setError("Give this template a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const snapshot = gridRef.current?.getSnapshot() ?? emptyGrid();
      await onSave({ name: name.trim(), grid: { ...snapshot, images }, fields_config: fields, paper_size: paperSize, orientation });
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
        <button type="button" onClick={onCancel} className={tb} title="Close designer"><X className="w-4 h-4" /></button>
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Template name"
            maxLength={255}
            className="text-sm font-semibold text-foreground bg-transparent border-0 outline-none w-full truncate p-0"
          />
          <p className="text-[10px] text-muted-foreground leading-tight">IPCR Template Designer</p>
        </div>
        {error && <span className="text-[11px] text-destructive shrink-0">{error}</span>}
        <button type="button" onClick={() => void handlePreview()} disabled={previewing}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-40 shrink-0">
          <Eye className="w-3.5 h-3.5" />{previewing ? "Generating..." : "Preview"}
        </button>
        <button type="button" onClick={() => void handleSave()} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 shrink-0">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{saving ? "Saving..." : template ? "Save changes" : "Save template"}
        </button>
      </div>

      {/* PDF preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
              <p className="text-sm font-semibold text-foreground">
                PDF Preview
                <span className="text-xs text-muted-foreground font-normal ml-2">fill-in field placeholders render blank — nothing is saved</span>
              </p>
              <button type="button" onClick={() => setPreviewUrl(null)} className="p-1 rounded hover:bg-accent" title="Close preview">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <iframe src={`${previewUrl}#zoom=page-width`} title="Design preview" className="flex-1 w-full border-0 bg-muted/30" />
          </div>
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
              <div>{testGrid && <IPCRLivePreview grid={testGrid} fields={fields} values={testValues} paperSize={paperSize} orientation={orientation} refreshKey={testRefreshKey} />}</div>
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
            portal
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
            portal
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

        <button type="button" disabled={!sel} onMouseDown={keepCellEditing} onClick={() => formatText("bold", "font-weight", "bold")} className={tbActive(currentStyle.bold)} title="Bold (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={!sel} onMouseDown={keepCellEditing} onClick={() => formatText("italic", "font-style", "italic")} className={tbActive(currentStyle.italic)} title="Italic (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></button>
        <button type="button" disabled={!sel} onMouseDown={keepCellEditing} onClick={() => formatText("underline", "text-decoration", "underline")} className={tbActive(currentStyle.underline)} title="Underline (Ctrl+U)"><Underline className="w-3.5 h-3.5" /></button>
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
            portal
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
        <div className="shrink-0" style={{ width: 96, opacity: sel ? 1 : 0.4 }} title="Apply borders to the selection">
          <ThemedSelect<SelectOption<IPCRBorderKind>>
            size="mini"
            portal
            classNamePrefix="etm-border-select"
            isSearchable={false}
            isDisabled={!sel}
            placeholder="Borders…"
            options={BORDER_OPTIONS}
            value={null}
            onChange={option => { if (option) gridRef.current?.applyBorder(option.value, borderColor); }}
          />
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
            <div className="relative inline-block pb-10 pr-10 etm-ipcr-grid-overlay-wrap">
              <IPCRGrid
                key={importedGrid ? `import-${importedGrid.seed}` : (template?.id ?? "new")}
                ref={gridRef}
                value={importedGrid?.data ?? template?.grid ?? emptyGrid()}
                editable
                onSelectionChange={info => { setSelectedCell(info?.cell ?? null); setFormulaValue(info?.value ?? ""); setSelectedStyle(info?.style ?? ""); }}
                onDimensionsChange={setDims}
              />
              <IPCRGridImageOverlay images={images} editable onChange={setImages} />
            </div>
          </div>
        </div>

        {/* Fill-in fields sidebar */}
        <div className="w-64 border-l border-border bg-card flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fill-in fields</p>
            <button type="button" onClick={() => void markSelectedCell()}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90">
              <MousePointerClick className="w-3.5 h-3.5" /> Mark selected cell
            </button>
            <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
              Select a cell in the sheet, then use the button above to turn it into a blank users fill in.
            </p>
          </div>
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
                <div key={field.key} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs hover:border-primary/40">
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">{field.cell}</span>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-foreground block truncate">{field.label}</span>
                    <span className="text-muted-foreground block truncate text-[10px]">{FIELD_TYPE_LABEL[field.type]}</span>
                  </span>
                  <button type="button" aria-label={`Remove field ${field.label}`} onClick={() => removeField(field.key)} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
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
          <div className="p-2 border-t border-border text-[10px] text-muted-foreground">
            {dims.rows} rows × {dims.cols} cols{images.length > 0 ? ` · ${images.length} image${images.length > 1 ? "s" : ""}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
