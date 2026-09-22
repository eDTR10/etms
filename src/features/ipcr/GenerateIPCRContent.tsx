import { useEffect, useState } from "react";
import { CalendarDays, Download, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Sparkles, Star, Trash2, Type, X } from "lucide-react";
import Swal from "sweetalert2";
import { taskService, taskError } from "../tasks/taskService";
import type { GroupedTask } from "../tasks/types";
import { ipcrService } from "./ipcrService";
import IPCRGrid from "./IPCRGrid";
import IPCRGridImageOverlay from "./IPCRGridImageOverlay";
import { downloadIPCRWorkbook } from "./ipcrExport";
import { downloadIPCRPdf } from "./ipcrPdfExport";
import { computeFinalRating, fillGrid } from "./ipcrGridUtils";
import { adjectivalRating, emptyGrid, type IPCRField, type IPCRFieldValue, type IPCRFieldMetaEntry, type IPCRSubmission, type IPCRSubmissionInput, type IPCRTemplate } from "./types";
import "../tasks/forms.css";
import "./ipcr.css";

const FIELD_ICON: Record<IPCRField["type"], typeof Type> = {
  text: Type, textarea: Type, date: CalendarDays, number: Type, rating: Star, grouped_tasks: Sparkles,
};

function newDraft(template: IPCRTemplate | null): { fields: IPCRField[]; values: Record<string, IPCRFieldValue>; meta: Record<string, IPCRFieldMetaEntry> } {
  const fields = template?.fields_config ?? [];
  return {
    fields,
    values: Object.fromEntries(fields.map(field => [field.key, field.type === "number" || field.type === "rating" ? null : ""])),
    meta: {},
  };
}

export default function GenerateIPCRContent() {
  const [templates, setTemplates] = useState<IPCRTemplate[]>([]);
  const [groups, setGroups] = useState<GroupedTask[]>([]);
  const [submissions, setSubmissions] = useState<IPCRSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [grid, setGrid] = useState(emptyGrid());
  const [fields, setFields] = useState<IPCRField[]>([]);
  const [values, setValues] = useState<Record<string, IPCRFieldValue>>({});
  const [meta, setMeta] = useState<Record<string, IPCRFieldMetaEntry>>({});
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<IPCRSubmission | null>(null);

  useEffect(() => {
    Promise.all([ipcrService.listTemplates(), taskService.listGroupedTasks(), ipcrService.listSubmissions()])
      .then(([templateRows, groupRows, submissionRows]) => { setTemplates(templateRows); setGroups(groupRows); setSubmissions(submissionRows); })
      .catch(err => setError(taskError(err)))
      .finally(() => setLoading(false));
  }, []);

  function startNew() {
    setTemplateId(null);
    const draft = newDraft(null);
    setGrid(emptyGrid()); setFields(draft.fields); setValues(draft.values); setMeta(draft.meta);
    setLabel(""); setPreview(null); setError("");
    setEditingId("new");
  }

  function startEdit(submission: IPCRSubmission) {
    setTemplateId(submission.template);
    setGrid(submission.grid_snapshot);
    setFields(submission.fields_snapshot);
    setValues(submission.field_values);
    setMeta(submission.field_meta);
    setLabel(submission.label);
    setPreview(submission);
    setError("");
    setEditingId(submission.id);
  }

  function applyTemplate(id: number) {
    const template = templates.find(item => item.id === id);
    if (!template) return;
    setTemplateId(id);
    setGrid(template.grid);
    const draft = newDraft(template);
    setFields(draft.fields); setValues(draft.values); setMeta(draft.meta);
  }

  function updateValue(key: string, value: IPCRFieldValue) {
    setValues(current => ({ ...current, [key]: value }));
  }

  function toggleGroupTag(field: IPCRField, groupId: number) {
    const current = meta[field.key]?.grouped_task_ids ?? [];
    const next = current.includes(groupId) ? current.filter(id => id !== groupId) : [...current, groupId];
    setMeta(currentMeta => ({ ...currentMeta, [field.key]: { grouped_task_ids: next } }));
    const composed = next
      .map(id => groups.find(group => group.id === id))
      .filter((group): group is GroupedTask => !!group)
      .map(group => `${group.name}:\n${group.tasks.map(task => `- ${task.title}`).join("\n") || "(no tasks tagged yet)"}`)
      .join("\n\n");
    updateValue(field.key, composed);
  }

  async function handleSave() {
    if (saving) return;
    if (!fields.length) { setError("Choose a template above first."); return; }
    setSaving(true);
    setError("");
    const payload: IPCRSubmissionInput = {
      template: templateId,
      label: label.trim(),
      grid_snapshot: grid,
      fields_snapshot: fields,
      field_values: values,
      field_meta: meta,
    };
    try {
      const saved = editingId === "new" || editingId === null
        ? await ipcrService.createSubmission(payload)
        : await ipcrService.updateSubmission(editingId, payload);
      setSubmissions(current => editingId === "new" || editingId === null ? [saved, ...current] : current.map(item => item.id === saved.id ? saved : item));
      setPreview(saved);
      setEditingId(saved.id);
      void Swal.fire({ title: "IPCR saved", icon: "success", timer: 1400, showConfirmButton: false });
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(submission: IPCRSubmission) {
    const result = await Swal.fire({
      title: "Delete this IPCR?",
      text: `"${submission.label || "This IPCR"}" will be permanently removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-danger-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      await ipcrService.deleteSubmission(submission.id);
      setSubmissions(current => current.filter(item => item.id !== submission.id));
      if (editingId === submission.id) { setEditingId(null); }
    } catch (err) {
      void Swal.fire({ title: "Couldn't delete IPCR", text: taskError(err), icon: "error" });
    }
  }

  const liveFinalRating = computeFinalRating(fields, values);
  const filename = (submission: IPCRSubmission) => `IPCR-${(submission.label || "form").replace(/\s+/g, "-")}`;

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><FileSpreadsheet size={15} /> Performance review</p>
          <h2>Generate IPCR</h2>
          <p>Pick a template, then simply fill in the marked portions — the layout is already done for you.</p>
        </div>
        {editingId === null && <button type="button" className="etm-button" onClick={startNew}><Plus size={16} /> New IPCR</button>}
      </section>

      {!loading && editingId === null && (
        <section className="etm-panel etm-table-wrap">
          <table className="etm-tasks-table etm-report-table">
            <thead><tr><th>Label</th><th>Template</th><th>Final rating</th><th>Updated</th><th className="etm-tasks-table-actions-col">Action Buttons</th></tr></thead>
            <tbody>
              {submissions.length ? submissions.map(submission => (
                <tr key={submission.id}>
                  <td className="etm-tasks-table-details-col">{submission.label || <span className="etm-tasks-table-unassigned">Not set</span>}</td>
                  <td>{templates.find(t => t.id === submission.template)?.name ?? <span className="etm-tasks-table-unassigned">Deleted template</span>}</td>
                  <td>{submission.final_rating !== null ? `${submission.final_rating} — ${adjectivalRating(submission.final_rating)}` : <span className="etm-tasks-table-unassigned">Not rated</span>}</td>
                  <td>{new Date(submission.updated_at).toLocaleDateString()}</td>
                  <td className="etm-report-group-actions">
                    {submission.can_manage && <button type="button" className="etm-icon-button" aria-label="Edit" onClick={() => startEdit(submission)}><Pencil size={15} /></button>}
                    <button type="button" className="etm-icon-button" aria-label="Download Excel" onClick={() => void downloadIPCRWorkbook(fillGrid(submission.grid_snapshot, submission.fields_snapshot, submission.field_values), filename(submission))}><Download size={15} /></button>
                    <button type="button" className="etm-icon-button" aria-label="Download PDF" onClick={() => downloadIPCRPdf(fillGrid(submission.grid_snapshot, submission.fields_snapshot, submission.field_values), filename(submission))}><FileText size={15} /></button>
                    {submission.can_manage && <button type="button" className="etm-icon-button danger" aria-label="Delete" onClick={() => void confirmDelete(submission)}><Trash2 size={15} /></button>}
                  </td>
                </tr>
              )) : <tr><td colSpan={5} className="etm-empty-row">No IPCRs generated yet.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {editingId !== null && (
        <section className="etm-panel etm-form-section" style={{ marginTop: 18 }}>
          <div className="etm-form-section-heading">
            <span className="etm-form-section-icon"><FileSpreadsheet size={19} /></span>
            <div><h2>{editingId === "new" ? "New IPCR" : "Edit IPCR"}</h2><p>Pick a template, then fill in your details below.</p></div>
          </div>
          <div className="etm-form-section-body">
            {error && <div className="etm-form-error-banner" role="alert">{error}</div>}

            <div className="etm-field">
              <label htmlFor="ipcr-template">Start from a template</label>
              <select id="ipcr-template" value={templateId ?? ""} onChange={event => applyTemplate(Number(event.target.value))} disabled={templates.length === 0}>
                <option value="" disabled>{templates.length ? "Choose an IPCR template…" : "No IPCR templates available"}</option>
                {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>

            {fields.length > 0 && <>
              <div className="etm-field">
                <label htmlFor="ipcr-label">Label for this IPCR <span className="etm-form-optional">(optional, e.g. the review period)</span></label>
                <input id="ipcr-label" value={label} onChange={event => setLabel(event.target.value)} placeholder="e.g. January to June 2026" maxLength={255} />
              </div>

              <div className="etm-field">
                <label>Fill in the marked portions</label>
                <div className="etm-ipcr-fill-form">
                  {fields.map(field => {
                    const Icon = FIELD_ICON[field.type];
                    if (field.type === "grouped_tasks") {
                      const taggedIds = meta[field.key]?.grouped_task_ids ?? [];
                      const taggedGroups = groups.filter(group => taggedIds.includes(group.id));
                      return (
                        <div className="etm-ipcr-fill-field" key={field.key}>
                          <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
                          <div className="etm-ipcr-group-tag-row">
                            {taggedGroups.map(group => (
                              <span key={group.id} className="etm-ipcr-group-tag">{group.name}<button type="button" aria-label={`Untag ${group.name}`} onClick={() => toggleGroupTag(field, group.id)}><X size={12} /></button></span>
                            ))}
                            <select value="" onChange={event => { if (event.target.value) toggleGroupTag(field, Number(event.target.value)); }}>
                              <option value="">Tag a Grouped Task…</option>
                              {groups.filter(group => !taggedIds.includes(group.id)).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                            </select>
                          </div>
                          <textarea value={String(values[field.key] ?? "")} onChange={event => updateValue(field.key, event.target.value)} placeholder="Composed automatically from tagged tasks — editable." />
                        </div>
                      );
                    }
                    if (field.type === "textarea") {
                      return (
                        <div className="etm-ipcr-fill-field" key={field.key}>
                          <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
                          <textarea value={String(values[field.key] ?? "")} onChange={event => updateValue(field.key, event.target.value)} />
                        </div>
                      );
                    }
                    if (field.type === "rating") {
                      return (
                        <div className="etm-ipcr-fill-field" key={field.key}>
                          <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
                          <select value={values[field.key] ?? ""} onChange={event => updateValue(field.key, event.target.value ? Number(event.target.value) : null)}>
                            <option value="">—</option>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} — {adjectivalRating(n)}</option>)}
                          </select>
                        </div>
                      );
                    }
                    return (
                      <div className="etm-ipcr-fill-field" key={field.key}>
                        <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
                        <input type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} value={values[field.key] ?? ""} onChange={event => updateValue(field.key, event.target.value)} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {liveFinalRating !== null && <div className="etm-ipcr-final-rating-banner"><Star size={16} /> Final rating so far: {liveFinalRating} — {adjectivalRating(liveFinalRating)}</div>}
            </>}

            <div className="etm-form-footer">
              <span>{fields.length === 0 ? "Choose a template above to see the fill-in fields." : "Save to generate the previewable, downloadable IPCR."}</span>
              <div>
                <button type="button" className="etm-button ghost" onClick={() => setEditingId(null)}>{editingId === "new" ? "Cancel" : "Back to list"}</button>
                <button type="button" className="etm-button primary" onClick={() => void handleSave()} disabled={saving || fields.length === 0}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <FileSpreadsheet size={17} />}{saving ? "Saving…" : "Save & generate"}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {preview && (
        <section className="etm-panel etm-ipcr-preview-wrap" style={{ padding: 18 }}>
          <div className="etm-report-section-title">
            <div><p className="etm-report-eyebrow">Preview</p><h2>{preview.label || "IPCR"}</h2></div>
          </div>
          <div className="etm-ipcr-preview-actions">
            <button type="button" className="etm-button ghost small" onClick={() => void downloadIPCRWorkbook(fillGrid(preview.grid_snapshot, preview.fields_snapshot, preview.field_values), filename(preview))}><Download size={14} /> Download .xlsx</button>
            <button type="button" className="etm-button ghost small" onClick={() => downloadIPCRPdf(fillGrid(preview.grid_snapshot, preview.fields_snapshot, preview.field_values), filename(preview))}><FileText size={14} /> Download PDF</button>
          </div>
          <div className="etm-ipcr-grid-overlay-wrap">
            <IPCRGrid key={`preview-${preview.id}-${preview.updated_at}`} value={fillGrid(preview.grid_snapshot, preview.fields_snapshot, preview.field_values)} editable={false} />
            <IPCRGridImageOverlay images={preview.grid_snapshot.images ?? []} editable={false} />
          </div>
        </section>
      )}
    </div>
  );
}
