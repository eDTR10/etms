import { useEffect, useState } from "react";
import { Download, Eye, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { taskService, taskError } from "../tasks/taskService";
import { useAuth } from "../../screens/Auth/AuthContext";
import { autofillValue } from "./ipcrAutofill";
import { repeatLine, type Axis, type Side } from "./ipcrExpand";
import type { GroupedTask } from "../tasks/types";
import { ipcrService } from "./ipcrService";
import IPCRFillForm from "./IPCRFillForm";
import IPCRLivePreview from "./IPCRLivePreview";
import { downloadIPCRWorkbook } from "./ipcrExport";
import { downloadIPCRPdf } from "./ipcrPdfExport";
import { composeGroupedTasksHtml, computeFinalRating, fillGrid } from "./ipcrGridUtils";
import { adjectivalRating, emptyGrid, normalizeGrid, type IPCRField, type IPCRFieldValue, type IPCRFieldMetaEntry, type IPCROrientation, type IPCRPaperSize, type IPCRSubmission, type IPCRSubmissionInput, type IPCRTemplate } from "./types";
import type { UserProfile } from "../../screens/Auth/authService";
import "../tasks/forms.css";
import "./ipcr.css";

// Today as the YYYY-MM-DD a date input uses (local time, not UTC, so it is the right day late in the evening).
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// What a field starts out as: blank, or filled from the account / today's date if the template says so.
function startingValue(field: IPCRField, profile: UserProfile | null, officeName: string): IPCRFieldValue {
  if (field.type === "number" || field.type === "rating" || field.type === "month" || field.type === "year") return null;
  if (field.type === "date" && field.dateMode === "today") return todayIso();
  return field.autofill ? autofillValue(field.autofill, profile, officeName) : "";
}

function newDraft(template: IPCRTemplate | null, profile: UserProfile | null, officeName: string): { fields: IPCRField[]; values: Record<string, IPCRFieldValue>; meta: Record<string, IPCRFieldMetaEntry> } {
  const fields = template?.fields_config ?? [];
  return {
    fields,
    values: Object.fromEntries(fields.map(field => [field.key, startingValue(field, profile, officeName)])),
    meta: {},
  };
}

export default function GenerateIPCRContent() {
  const { user: profile } = useAuth();
  const [officeName, setOfficeName] = useState("");
  const [templates, setTemplates] = useState<IPCRTemplate[]>([]);
  const [groups, setGroups] = useState<GroupedTask[]>([]);
  const [submissions, setSubmissions] = useState<IPCRSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [grid, setGrid] = useState(emptyGrid());
  const [paperSize, setPaperSize] = useState<IPCRPaperSize>("a3");
  const [orientation, setOrientation] = useState<IPCROrientation>("landscape");
  const [fields, setFields] = useState<IPCRField[]>([]);
  const [values, setValues] = useState<Record<string, IPCRFieldValue>>({});
  const [meta, setMeta] = useState<Record<string, IPCRFieldMetaEntry>>({});
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<IPCRSubmission | null>(null);
  const [testPreview, setTestPreview] = useState(false);
  const [testRefreshKey, setTestRefreshKey] = useState(0);

  // The account only stores the office's id; look its name up once.
  useEffect(() => {
    if (!profile?.office) return;
    taskService.projects().then(offices => setOfficeName(offices.find(office => office.id === profile.office)?.name ?? "")).catch(() => undefined);
  }, [profile?.office]);

  useEffect(() => {
    Promise.all([ipcrService.listTemplates(), taskService.listGroupedTasks(), ipcrService.listSubmissions()])
      .then(([templateRows, groupRows, submissionRows]) => { setTemplates(templateRows); setGroups(groupRows); setSubmissions(submissionRows); })
      .catch(err => setError(taskError(err)))
      .finally(() => setLoading(false));
  }, []);

  function startNew() {
    setTemplateId(null);
    const draft = newDraft(null, profile, officeName);
    setGrid(emptyGrid()); setPaperSize("a3"); setOrientation("landscape"); setFields(draft.fields); setValues(draft.values); setMeta(draft.meta);
    setLabel(""); setPreview(null); setError(""); setTestPreview(false);
    setEditingId("new");
  }

  function startEdit(submission: IPCRSubmission) {
    setTemplateId(submission.template);
    setGrid(normalizeGrid(submission.grid_snapshot));
    setPaperSize(submission.paper_size);
    setOrientation(submission.orientation);
    setFields(submission.fields_snapshot);
    setValues(submission.field_values);
    setMeta(submission.field_meta);
    setLabel(submission.label);
    setPreview(submission);
    setError(""); setTestPreview(false);
    setEditingId(submission.id);
  }

  function applyTemplate(id: number) {
    const template = templates.find(item => item.id === id);
    if (!template) return;
    setTemplateId(id);
    setGrid(normalizeGrid(template.grid));
    setPaperSize(template.paper_size);
    setOrientation(template.orientation);
    const draft = newDraft(template, profile, officeName);
    setFields(draft.fields); setValues(draft.values); setMeta(draft.meta);
    setTestPreview(false);
  }

  // Add a copy of a row / column the template's author marked as repeatable. The copy brings its own fields along
  // (new keys), so it is filled in separately from the line it was copied from.
  function addLine(axis: Axis, index: number, side: Side) {
    const result = repeatLine(grid, fields, axis, index, side);
    const known = new Set(fields.map(field => field.key));
    const added = result.fields.filter(field => !known.has(field.key));
    setGrid(result.grid);
    setFields(result.fields);
    setValues(current => ({
      ...current,
      ...Object.fromEntries(added.map(field => [field.key, startingValue(field, profile, officeName)])),
    }));
    if (testPreview) setTestRefreshKey(key => key + 1);
  }

  function updateValue(key: string, value: IPCRFieldValue) {
    setValues(current => ({ ...current, [key]: value }));
  }

  function toggleGroupTag(field: IPCRField, groupId: number) {
    const current = meta[field.key]?.grouped_task_ids ?? [];
    const next = current.includes(groupId) ? current.filter(id => id !== groupId) : [...current, groupId];
    setMeta(currentMeta => ({ ...currentMeta, [field.key]: { grouped_task_ids: next } }));
    updateValue(field.key, composeGroupedTasksHtml(next, groups));
  }

  async function handleSave() {
    if (saving) return;
    if (templateId === null && !fields.length) { setError("Choose a template above first."); return; }
    setSaving(true);
    setError("");
    const payload: IPCRSubmissionInput = {
      template: templateId,
      label: label.trim(),
      grid_snapshot: grid,
      fields_snapshot: fields,
      paper_size: paperSize,
      orientation: orientation,
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
                    <button type="button" className="etm-icon-button" aria-label="Download Excel" onClick={() => void downloadIPCRWorkbook(fillGrid(normalizeGrid(submission.grid_snapshot), submission.fields_snapshot, submission.field_values), filename(submission))}><Download size={15} /></button>
                    <button type="button" className="etm-icon-button" aria-label="Download PDF" onClick={() => downloadIPCRPdf(fillGrid(normalizeGrid(submission.grid_snapshot), submission.fields_snapshot, submission.field_values), filename(submission), submission.paper_size, submission.orientation)}><FileText size={15} /></button>
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
              <ThemedSelect<SelectOption<number>>
                inputId="ipcr-template"
                classNamePrefix="etm-ipcr-template-select"
                isDisabled={templates.length === 0}
                isSearchable
                placeholder={templates.length ? "Choose an IPCR template…" : "No IPCR templates available"}
                options={templates.map(template => ({ value: template.id, label: template.name }))}
                value={templates.filter(template => template.id === templateId).map(template => ({ value: template.id, label: template.name }))[0] ?? null}
                onChange={option => applyTemplate(option?.value ?? 0)}
              />
              {(() => {
                const chosen = templates.find(template => template.id === templateId);
                return chosen?.sample_document_url ? (
                  <p className="etm-form-helper" style={{ marginTop: 8 }}>
                    <FileText size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                    <a href={chosen.sample_document_url} target="_blank" rel="noreferrer">View sample document{chosen.sample_document_name ? ` (${chosen.sample_document_name})` : ""}</a>
                  </p>
                ) : null;
              })()}
            </div>

            {(fields.length > 0 || templateId !== null) && <>
              <div className="etm-field">
                <label htmlFor="ipcr-label">Label for this IPCR <span className="etm-form-optional">(optional, e.g. the review period)</span></label>
                <input id="ipcr-label" value={label} onChange={event => setLabel(event.target.value)} placeholder="e.g. January to June 2026" maxLength={255} />
              </div>

              {fields.length === 0 && <p className="etm-form-helper">This template has no fill-in fields, so there is nothing to type. Save it to get the document as it is.</p>}
              <div className="etm-field">
                <label>Fill in the marked portions</label>
                <IPCRFillForm fields={fields} values={values} meta={meta} groups={groups} onUpdateValue={updateValue} onToggleGroupTag={toggleGroupTag} />
              </div>

              {(() => {
                const marks = [
                  ...Object.entries(grid.expandable?.rows ?? {}).map(([index, mark]) => ({ axis: "row" as Axis, index: Number(index), mark })),
                  ...Object.entries(grid.expandable?.cols ?? {}).map(([index, mark]) => ({ axis: "col" as Axis, index: Number(index), mark })),
                ];
                if (!marks.length) return null;
                const letters = (index: number) => { let name = ""; let n = index; do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0); return name; };
                const describe = (axis: Axis, index: number) => {
                  const cells = axis === "row" ? grid.data[index] ?? [] : grid.data.map(row => row[index]);
                  const text = cells.map(cell => String(cell ?? "").replace(/\{\{[a-z0-9_]+\}\}/g, "").trim()).find(Boolean);
                  return `${axis === "row" ? `Row ${index + 1}` : `Column ${letters(index)}`}${text ? ` — ${text.length > 36 ? `${text.slice(0, 36)}…` : text}` : ""}`;
                };
                return (
                  <div className="etm-field">
                    <label>Add rows and columns</label>
                    <ul className="etm-ipcr-field-list" style={{ margin: 0 }}>
                      {marks.map(({ axis, index, mark }) => (
                        <li key={`${axis}-${index}`}>
                          <span style={{ flex: 1, minWidth: 0 }}>{describe(axis, index)}</span>
                          {mark.before && <button type="button" className="etm-button ghost small" onClick={() => addLine(axis, index, "before")}><Plus size={13} /> {axis === "row" ? "Row above" : "Column before"}</button>}
                          {mark.after && <button type="button" className="etm-button ghost small" onClick={() => addLine(axis, index, "after")}><Plus size={13} /> {axis === "row" ? "Row below" : "Column after"}</button>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {liveFinalRating !== null && <div className="etm-ipcr-final-rating-banner"><Star size={16} /> Final rating so far: {liveFinalRating} — {adjectivalRating(liveFinalRating)}</div>}

              <div className="etm-field">
                <div className="etm-ipcr-preview-actions">
                  <button type="button" className="etm-button ghost small" onClick={() => { setTestPreview(true); setTestRefreshKey(key => key + 1); }}><Eye size={14} /> {testPreview ? "Update test preview" : "Test with these values"}</button>
                </div>
                {testPreview && <IPCRLivePreview grid={grid} fields={fields} values={values} refreshKey={testRefreshKey} />}
              </div>
            </>}

            <div className="etm-form-footer">
              <span>{templateId === null && fields.length === 0 ? "Choose a template above to see the fill-in fields." : "Save to generate the downloadable IPCR."}</span>
              <div>
                <button type="button" className="etm-button ghost" onClick={() => setEditingId(null)}>{editingId === "new" ? "Cancel" : "Back to list"}</button>
                <button type="button" className="etm-button primary" onClick={() => void handleSave()} disabled={saving || (templateId === null && fields.length === 0)}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <FileSpreadsheet size={17} />}{saving ? "Saving…" : "Save & generate"}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {preview && editingId === preview.id && (
        <section className="etm-panel etm-ipcr-preview-wrap" style={{ padding: 18 }}>
          <div className="etm-report-section-title">
            <div><p className="etm-report-eyebrow">Saved IPCR</p><h2>{preview.label || "IPCR"}</h2></div>
          </div>
          <div className="etm-ipcr-preview-actions">
            <button type="button" className="etm-button ghost small" onClick={() => void downloadIPCRWorkbook(fillGrid(normalizeGrid(preview.grid_snapshot), preview.fields_snapshot, preview.field_values), filename(preview))}><Download size={14} /> Download .xlsx</button>
            <button type="button" className="etm-button ghost small" onClick={() => downloadIPCRPdf(fillGrid(normalizeGrid(preview.grid_snapshot), preview.fields_snapshot, preview.field_values), filename(preview), preview.paper_size, preview.orientation)}><FileText size={14} /> Download PDF</button>
          </div>
          <IPCRLivePreview grid={normalizeGrid(preview.grid_snapshot)} fields={preview.fields_snapshot} values={preview.field_values} refreshKey={`${preview.id}-${preview.updated_at}`} />
        </section>
      )}
    </div>
  );
}
