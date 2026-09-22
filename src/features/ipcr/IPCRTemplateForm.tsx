import { useRef, useState } from "react";
import { Columns, FileSpreadsheet, ImagePlus, Loader2, MousePointerClick, Rows, Tag, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import { taskError } from "../tasks/taskService";
import IPCRGrid, { type IPCRGridHandle } from "./IPCRGrid";
import IPCRGridImageOverlay from "./IPCRGridImageOverlay";
import { emptyGrid, fieldToken, slugifyKey, type IPCRField, type IPCRFieldType, type IPCRGridImage, type IPCRTemplate, type IPCRTemplateInput } from "./types";
import "../tasks/forms.css";
import "./ipcr.css";

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

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
  const [name, setName] = useState(template?.name ?? "");
  const [fields, setFields] = useState<IPCRField[]>(template?.fields_config ?? []);
  const [images, setImages] = useState<IPCRGridImage[]>(template?.grid.images ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      await onSave({ name: name.trim(), grid: { ...snapshot, images }, fields_config: fields });
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="etm-task-form">
      <fieldset className="etm-form-fieldset" disabled={saving}>
        <div className="etm-form-section-body" style={{ padding: 0 }}>
          <div className="etm-field">
            <label htmlFor="ipcr-template-name">Template name <span aria-hidden="true">*</span></label>
            <input id="ipcr-template-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. ISA II — Technical Operations" maxLength={255} required />
          </div>

          <div className="etm-field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><FileSpreadsheet size={16} /> Form layout</label>
            <p className="etm-form-helper">Design the form like a real spreadsheet — type text, resize columns, and use the toolbar or right-click menu to merge cells, color rows, and bold text. Then click a cell and use "Mark as fill-in field" to turn it into a blank users fill in.</p>
            <div className="etm-ipcr-grid-toolbar">
              <button type="button" className="etm-button primary small" onClick={() => void markSelectedCell()}><MousePointerClick size={14} /> Mark selected cell as fill-in field</button>
              <button type="button" className="etm-button ghost small" onClick={() => gridRef.current?.insertColumn()}><Columns size={14} /> Add column</button>
              <button type="button" className="etm-button ghost small" onClick={() => gridRef.current?.insertRow()}><Rows size={14} /> Add row</button>
              <button type="button" className="etm-button ghost small" onClick={() => fileInputRef.current?.click()}><ImagePlus size={14} /> Insert image</button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={event => void handleImagePick(event)} />
            </div>
            <div className="etm-ipcr-grid-overlay-wrap">
              <IPCRGrid key={template?.id ?? "new"} ref={gridRef} value={template?.grid ?? emptyGrid()} editable />
              <IPCRGridImageOverlay images={images} editable onChange={setImages} />
            </div>
          </div>

          <div className="etm-field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><Tag size={16} /> Fill-in fields <span className="etm-form-count">{fields.length}</span></label>
            {fields.length ? (
              <ul className="etm-ipcr-field-list">
                {fields.map(field => (
                  <li key={field.key}>
                    <span className="etm-ipcr-field-cell">{field.cell}</span>
                    <span className="etm-ipcr-field-label">{field.label}</span>
                    <span className="etm-ipcr-field-type">{FIELD_TYPE_LABEL[field.type]}</span>
                    <button type="button" className="etm-icon-button danger" aria-label={`Remove field ${field.label}`} onClick={() => removeField(field.key)}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="etm-empty-row">No fill-in fields yet. Select a cell in the sheet above and mark it.</p>}
          </div>
        </div>
      </fieldset>
      {error && <div className="etm-form-error-banner" role="alert">{error}</div>}
      <div className="etm-form-footer">
        <span>Users will generate their IPCR from this exact layout.</span>
        <div>
          <button className="etm-button ghost" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
          <button className="etm-button primary" type="button" disabled={saving} onClick={() => void handleSave()}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <FileSpreadsheet size={17} />}{saving ? "Saving…" : template ? "Save changes" : "Save template"}</button>
        </div>
      </div>
    </div>
  );
}
