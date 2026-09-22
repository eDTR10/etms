import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ClipboardList, FileSpreadsheet, Loader2, Plus, Trash2 } from "lucide-react";
import { taskError } from "../tasks/taskService";
import type { IPCRRowKind, IPCRTemplate, IPCRTemplateInput, IPCRTemplateRow } from "./types";
import "../tasks/forms.css";
import "./ipcr.css";

interface IPCRTemplateFormProps {
  template?: IPCRTemplate;
  onSave: (input: IPCRTemplateInput) => Promise<void>;
  onCancel: () => void;
}

type EditableRow = IPCRTemplateRow & { localKey: string };
type FormErrors = Record<string, string>;

const ROW_LABEL: Record<IPCRRowKind, string> = {
  program: "Program / Activity / Project banner",
  function: "Core / Support Function banner",
  kra: "KRA banner",
  data: "KRA row (Output + Success Indicator)",
};

let rowSeed = 0;
function toEditableRows(rows: IPCRTemplateRow[]): EditableRow[] {
  return rows.map(row => ({ ...row, localKey: `row-${rowSeed++}` }));
}

export default function IPCRTemplateForm({ template, onSave, onCancel }: IPCRTemplateFormProps) {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(template?.name ?? "");
  const [rows, setRows] = useState<EditableRow[]>(() => toEditableRows(template?.rows ?? []));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addRow(kind: IPCRRowKind) {
    const localKey = `row-${rowSeed++}`;
    setRows(current => [...current, kind === "data" ? { kind, output: "", indicator: "", localKey } : { kind, text: "", localKey }]);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-row-key="${localKey}"]`)?.focus());
  }

  function updateRow(localKey: string, change: Partial<IPCRTemplateRow>) {
    setRows(current => current.map(row => row.localKey === localKey ? { ...row, ...change } : row));
    if (errors[localKey]) setErrors(current => ({ ...current, [localKey]: "" }));
  }

  function removeRow(localKey: string) {
    setRows(current => current.filter(row => row.localKey !== localKey));
  }

  function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    setRows(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = "Give this template a name.";
    if (!rows.length) nextErrors.rows = "Add at least one row.";
    rows.forEach(row => {
      if (row.kind === "data" && !(row.output ?? "").trim()) nextErrors[row.localKey] = "Add an output/title for this KRA row.";
      if (row.kind !== "data" && !(row.text ?? "").trim()) nextErrors[row.localKey] = "Add a label for this banner row.";
    });
    setErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        rows: rows.map(row => row.kind === "data"
          ? { kind: "data" as const, output: (row.output ?? "").trim(), indicator: (row.indicator ?? "").trim() }
          : { kind: row.kind, text: (row.text ?? "").trim() }),
      });
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="etm-task-form" onSubmit={handleSubmit} ref={formRef} noValidate aria-busy={saving}>
      <fieldset className="etm-form-fieldset" disabled={saving}>
        <div className="etm-form-section-body" style={{ padding: 0 }}>
          <div className="etm-field">
            <label htmlFor={`${fieldId}-name`}>Template name <span aria-hidden="true">*</span></label>
            <input id={`${fieldId}-name`} value={name} onChange={event => { setName(event.target.value); if (errors.name) setErrors(current => ({ ...current, name: "" })); }} placeholder="e.g. ISA II — Technical Operations" maxLength={255} required aria-invalid={!!errors.name} />
            {errors.name && <p className="etm-field-error">{errors.name}</p>}
          </div>

          <div className="etm-field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><FileSpreadsheet size={16} /> Form rows</label>
            <p className="etm-form-helper">Build the form top to bottom: a Program banner, then a Function banner, then a KRA banner, then its KRA rows (Output + Success Indicator). Repeat for each program.</p>
            {errors.rows && <p className="etm-field-error">{errors.rows}</p>}

            {rows.length === 0 && <div className="etm-subtask-empty"><ClipboardList size={23} /><span>No rows yet. Add the first banner below.</span></div>}

            <div className="etm-ipcr-row-editor">
              {rows.map((row, index) => (
                <div key={row.localKey} className={`etm-ipcr-row-editor-item etm-ipcr-row-${row.kind}`}>
                  <div className="etm-ipcr-row-editor-head">
                    <span className="etm-ipcr-row-kind-label">{ROW_LABEL[row.kind]}</span>
                    <div className="etm-ipcr-row-editor-actions">
                      <button type="button" className="etm-icon-button" aria-label="Move row up" onClick={() => moveRow(index, -1)} disabled={index === 0}><ArrowUp size={14} /></button>
                      <button type="button" className="etm-icon-button" aria-label="Move row down" onClick={() => moveRow(index, 1)} disabled={index === rows.length - 1}><ArrowDown size={14} /></button>
                      <button type="button" className="etm-icon-button" aria-label="Remove row" onClick={() => removeRow(row.localKey)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {row.kind === "data" ? (
                    <div className="etm-ipcr-row-editor-body">
                      <input data-row-key={row.localKey} value={row.output ?? ""} onChange={event => updateRow(row.localKey, { output: event.target.value })} placeholder="KRA / Output" maxLength={2000} aria-invalid={!!errors[row.localKey]} />
                      <textarea value={row.indicator ?? ""} onChange={event => updateRow(row.localKey, { indicator: event.target.value })} placeholder="Success indicator (measures and targets)" rows={2} maxLength={2000} />
                    </div>
                  ) : (
                    <input data-row-key={row.localKey} className="etm-ipcr-row-editor-banner-input" value={row.text ?? ""} onChange={event => updateRow(row.localKey, { text: event.target.value })} placeholder={row.kind === "program" ? "e.g. PROGRAM/ACTIVITY/PROJECT 1: eLGU - Digital Government Program" : row.kind === "function" ? "e.g. CORE FUNCTION" : "e.g. KRA 1: Local Government Digitalization and E-Governance Operations"} maxLength={500} aria-invalid={!!errors[row.localKey]} />
                  )}
                  {errors[row.localKey] && <p className="etm-field-error">{errors[row.localKey]}</p>}
                </div>
              ))}
            </div>

            <div className="etm-ipcr-add-row-buttons">
              <button type="button" className="etm-button ghost small" onClick={() => addRow("program")}><Plus size={14} /> Program banner</button>
              <button type="button" className="etm-button ghost small" onClick={() => addRow("function")}><Plus size={14} /> Function banner</button>
              <button type="button" className="etm-button ghost small" onClick={() => addRow("kra")}><Plus size={14} /> KRA banner</button>
              <button type="button" className="etm-button primary small" onClick={() => addRow("data")}><Plus size={14} /> KRA row</button>
            </div>
          </div>
        </div>
      </fieldset>
      {error && <div className="etm-form-error-banner" role="alert">{error}</div>}
      <div className="etm-form-footer"><span>Users will generate their IPCR from this structure.</span><div><button className="etm-button ghost" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="etm-button primary" type="submit" disabled={saving}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <FileSpreadsheet size={17} />}{saving ? "Saving…" : template ? "Save changes" : "Save template"}</button></div></div>
    </form>
  );
}
