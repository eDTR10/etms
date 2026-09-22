import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Sparkles, Trash2, Users, X } from "lucide-react";
import Swal from "sweetalert2";
import { useAuth } from "../../screens/Auth/AuthContext";
import { useTasks } from "../tasks/taskContext";
import { taskService, taskError } from "../tasks/taskService";
import type { GroupedTask } from "../tasks/types";
import { ipcrService } from "./ipcrService";
import { downloadIPCRWorkbook } from "./ipcrExport";
import { downloadIPCRPdf } from "./ipcrPdfExport";
import { adjectivalRating, RATING_SCALE, type IPCRSubmission, type IPCRSubmissionInput, type IPCRSubmissionRow, type IPCRTemplate } from "./types";
import "../tasks/forms.css";
import "./ipcr.css";

function emptyInput(templateId: number | null, rows: IPCRSubmissionRow[]): IPCRSubmissionInput {
  return {
    template: templateId,
    period_label: "",
    commitment_date: new Date().toISOString().slice(0, 10),
    employee_name: "",
    employee_position: "",
    employee_office: "",
    reviewed_by_name: "",
    reviewed_by_title: "",
    approved_by_name: "",
    approved_by_title: "",
    discussed_at: null,
    assessed_at: null,
    final_rating_at: null,
    rows,
    areas_of_strength: [],
    strength_interventions: [],
    areas_for_development: [],
    development_interventions: [],
  };
}

function rowsFromTemplate(template: IPCRTemplate): IPCRSubmissionRow[] {
  return template.rows.map(row => row.kind === "data"
    ? { ...row, grouped_task_ids: [], actual_accomplishments: "", rating_q: null, rating_e: null, rating_t: null, rating_a: null, remarks: "" }
    : { ...row });
}

function composeAccomplishments(groupIds: number[], groups: GroupedTask[]): string {
  return groupIds
    .map(id => groups.find(group => group.id === id))
    .filter((group): group is GroupedTask => !!group)
    .map(group => `${group.name}:\n${group.tasks.map(task => `- ${task.title}`).join("\n") || "(no tasks tagged yet)"}`)
    .join("\n\n");
}

function linesToList(value: string): string[] {
  return value.split("\n").map(line => line.trim()).filter(Boolean);
}
function listToLines(value: string[]): string {
  return value.join("\n");
}

export default function GenerateIPCRContent() {
  const { user } = useAuth();
  const { projects } = useTasks();
  const [templates, setTemplates] = useState<IPCRTemplate[]>([]);
  const [groups, setGroups] = useState<GroupedTask[]>([]);
  const [submissions, setSubmissions] = useState<IPCRSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [form, setForm] = useState<IPCRSubmissionInput | null>(null);
  const [strengthText, setStrengthText] = useState("");
  const [strengthInterventionsText, setStrengthInterventionsText] = useState("");
  const [devText, setDevText] = useState("");
  const [devInterventionsText, setDevInterventionsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<IPCRSubmission | null>(null);

  useEffect(() => {
    Promise.all([ipcrService.listTemplates(), taskService.listGroupedTasks(), ipcrService.listSubmissions()])
      .then(([templateRows, groupRows, submissionRows]) => {
        setTemplates(templateRows);
        setGroups(groupRows);
        setSubmissions(submissionRows);
      })
      .catch(err => setError(taskError(err)))
      .finally(() => setLoading(false));
  }, []);

  const officeName = useMemo(() => projects.find(project => project.id === user?.office)?.name ?? "", [projects, user?.office]);

  function startNew() {
    setSelectedTemplateId(null);
    setForm(emptyInput(null, []));
    setStrengthText(""); setStrengthInterventionsText(""); setDevText(""); setDevInterventionsText("");
    setPreview(null);
    setError("");
    setEditingId("new");
  }

  function startEdit(submission: IPCRSubmission) {
    setSelectedTemplateId(submission.template);
    setForm({
      template: submission.template,
      period_label: submission.period_label,
      commitment_date: submission.commitment_date,
      employee_name: submission.employee_name,
      employee_position: submission.employee_position,
      employee_office: submission.employee_office,
      reviewed_by_name: submission.reviewed_by_name,
      reviewed_by_title: submission.reviewed_by_title,
      approved_by_name: submission.approved_by_name,
      approved_by_title: submission.approved_by_title,
      discussed_at: submission.discussed_at,
      assessed_at: submission.assessed_at,
      final_rating_at: submission.final_rating_at,
      rows: submission.rows,
      areas_of_strength: submission.areas_of_strength,
      strength_interventions: submission.strength_interventions,
      areas_for_development: submission.areas_for_development,
      development_interventions: submission.development_interventions,
    });
    setStrengthText(listToLines(submission.areas_of_strength));
    setStrengthInterventionsText(listToLines(submission.strength_interventions));
    setDevText(listToLines(submission.areas_for_development));
    setDevInterventionsText(listToLines(submission.development_interventions));
    setPreview(submission);
    setError("");
    setEditingId(submission.id);
  }

  function applyTemplate(templateId: number) {
    const template = templates.find(item => item.id === templateId);
    if (!template || !form) return;
    setSelectedTemplateId(templateId);
    setForm({ ...form, template: templateId, rows: rowsFromTemplate(template) });
  }

  function applyMyDetails() {
    if (!form || !user) return;
    setForm({ ...form, employee_name: `${user.first_name} ${user.last_name}`.trim(), employee_position: user.position ?? "", employee_office: officeName });
  }

  function updateRow(index: number, change: Partial<IPCRSubmissionRow>) {
    if (!form) return;
    setForm({ ...form, rows: form.rows.map((row, i) => i === index ? { ...row, ...change } : row) });
  }

  function toggleGroupTag(index: number, groupId: number) {
    if (!form) return;
    const row = form.rows[index];
    const current = row.grouped_task_ids ?? [];
    const next = current.includes(groupId) ? current.filter(id => id !== groupId) : [...current, groupId];
    updateRow(index, { grouped_task_ids: next });
  }

  function composeRow(index: number) {
    if (!form) return;
    const row = form.rows[index];
    updateRow(index, { actual_accomplishments: composeAccomplishments(row.grouped_task_ids ?? [], groups) });
  }

  async function handleSave() {
    if (!form) return;
    if (!form.employee_name.trim() || !form.period_label.trim()) {
      setError("Employee name and the review period are required.");
      return;
    }
    setSaving(true);
    setError("");
    const payload: IPCRSubmissionInput = {
      ...form,
      areas_of_strength: linesToList(strengthText),
      strength_interventions: linesToList(strengthInterventionsText),
      areas_for_development: linesToList(devText),
      development_interventions: linesToList(devInterventionsText),
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
      text: `The IPCR for "${submission.period_label || "this period"}" will be permanently removed.`,
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
      if (editingId === submission.id) { setEditingId(null); setForm(null); setPreview(null); }
    } catch (err) {
      void Swal.fire({ title: "Couldn't delete IPCR", text: taskError(err), icon: "error" });
    }
  }

  const filename = (submission: IPCRSubmission) => `IPCR-${(submission.employee_name || "employee").replace(/\s+/g, "-")}-${submission.period_label || "period"}`;

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><FileSpreadsheet size={15} /> Performance review</p>
          <h2>Generate IPCR</h2>
          <p>Fill in your commitments and accomplishments, tagging Grouped Tasks as evidence, then export.</p>
        </div>
        {editingId === null && <button type="button" className="etm-button" onClick={startNew}><Plus size={16} /> New IPCR</button>}
      </section>

      {!loading && editingId === null && (
        <section className="etm-panel etm-table-wrap">
          <table className="etm-tasks-table etm-report-table">
            <thead><tr><th>Period</th><th>Template</th><th>Final rating</th><th>Updated</th><th className="etm-tasks-table-actions-col">Action Buttons</th></tr></thead>
            <tbody>
              {submissions.length ? submissions.map(submission => (
                <tr key={submission.id}>
                  <td className="etm-tasks-table-details-col">{submission.period_label || <span className="etm-tasks-table-unassigned">Not set</span>}</td>
                  <td>{templates.find(t => t.id === submission.template)?.name ?? <span className="etm-tasks-table-unassigned">Deleted template</span>}</td>
                  <td>{submission.final_rating !== null ? `${submission.final_rating} — ${adjectivalRating(submission.final_rating)}` : <span className="etm-tasks-table-unassigned">Not rated</span>}</td>
                  <td>{new Date(submission.updated_at).toLocaleDateString()}</td>
                  <td className="etm-report-group-actions">
                    {submission.can_manage && <button type="button" className="etm-icon-button" aria-label="Edit" onClick={() => startEdit(submission)}><Pencil size={15} /></button>}
                    <button type="button" className="etm-icon-button" aria-label="Download Excel" onClick={() => void downloadIPCRWorkbook(submission, filename(submission))}><Download size={15} /></button>
                    <button type="button" className="etm-icon-button" aria-label="Download PDF" onClick={() => downloadIPCRPdf(submission, filename(submission))}><FileText size={15} /></button>
                    {submission.can_manage && <button type="button" className="etm-icon-button danger" aria-label="Delete" onClick={() => void confirmDelete(submission)}><Trash2 size={15} /></button>}
                  </td>
                </tr>
              )) : <tr><td colSpan={5} className="etm-empty-row">No IPCRs generated yet.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {form && (
        <section className="etm-panel etm-form-section" style={{ marginTop: 18 }}>
          <div className="etm-form-section-heading">
            <span className="etm-form-section-icon"><FileSpreadsheet size={19} /></span>
            <div><h2>{editingId === "new" ? "New IPCR" : "Edit IPCR"}</h2><p>Pick a template, then fill in your details.</p></div>
          </div>
          <div className="etm-form-section-body">
            {error && <div className="etm-form-error-banner" role="alert">{error}</div>}

            <div className="etm-field">
              <label htmlFor="ipcr-template"><ChevronDown size={14} /> Start from a template</label>
              <select id="ipcr-template" value={selectedTemplateId ?? ""} onChange={event => applyTemplate(Number(event.target.value))} disabled={templates.length === 0}>
                <option value="" disabled>{templates.length ? "Choose an IPCR template…" : "No IPCR templates available"}</option>
                {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>

            {form.rows.length > 0 && <>
              <div className="etm-ipcr-picker">
                <div className="etm-ipcr-header-grid">
                  <label>Review period <input value={form.period_label} onChange={event => setForm({ ...form, period_label: event.target.value })} placeholder="e.g. January to June 2026" /></label>
                  <label>Commitment date <input type="date" value={form.commitment_date ?? ""} onChange={event => setForm({ ...form, commitment_date: event.target.value || null })} /></label>
                  <label>Employee name <input value={form.employee_name} onChange={event => setForm({ ...form, employee_name: event.target.value })} /></label>
                  <label>Position <input value={form.employee_position} onChange={event => setForm({ ...form, employee_position: event.target.value })} /></label>
                  <label>Office <input value={form.employee_office} onChange={event => setForm({ ...form, employee_office: event.target.value })} /></label>
                </div>
                <button type="button" className="etm-button ghost small" style={{ justifySelf: "start" }} onClick={applyMyDetails}><Users size={14} /> Use my profile details</button>

                <div className="etm-ipcr-header-grid">
                  <label>Reviewed by <input value={form.reviewed_by_name} onChange={event => setForm({ ...form, reviewed_by_name: event.target.value })} placeholder="Name" /></label>
                  <label>Reviewer title <input value={form.reviewed_by_title} onChange={event => setForm({ ...form, reviewed_by_title: event.target.value })} placeholder="e.g. Provincial Officer" /></label>
                  <label>Approved by <input value={form.approved_by_name} onChange={event => setForm({ ...form, approved_by_name: event.target.value })} placeholder="Name" /></label>
                  <label>Approver title <input value={form.approved_by_title} onChange={event => setForm({ ...form, approved_by_title: event.target.value })} placeholder="e.g. Director" /></label>
                </div>
              </div>

              <div className="etm-ipcr-kra-editor">
                {form.rows.map((row, index) => {
                  if (row.kind !== "data") {
                    return <div key={index} className={`etm-ipcr-kra-banner ${row.kind}`}>{row.text}</div>;
                  }
                  const taggedGroups = groups.filter(group => (row.grouped_task_ids ?? []).includes(group.id));
                  const average = [row.rating_q, row.rating_e, row.rating_t, row.rating_a].filter((v): v is number => v != null);
                  const rowAvg = average.length ? (average.reduce((a, b) => a + b, 0) / average.length).toFixed(2) : null;
                  return (
                    <div key={index} className="etm-ipcr-kra-card">
                      <div className="etm-ipcr-kra-card-title">{row.output}</div>
                      {row.indicator && <div className="etm-ipcr-kra-card-indicator">{row.indicator}</div>}

                      <div className="etm-ipcr-group-tag-row">
                        {taggedGroups.map(group => (
                          <span key={group.id} className="etm-ipcr-group-tag">{group.name}<button type="button" aria-label={`Untag ${group.name}`} onClick={() => toggleGroupTag(index, group.id)}><X size={12} /></button></span>
                        ))}
                        <select className="etm-ipcr-group-select" value="" onChange={event => { if (event.target.value) toggleGroupTag(index, Number(event.target.value)); }}>
                          <option value="">Tag a Grouped Task…</option>
                          {groups.filter(group => !(row.grouped_task_ids ?? []).includes(group.id)).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                        {(row.grouped_task_ids ?? []).length > 0 && <button type="button" className="etm-button ghost small" onClick={() => composeRow(index)}><Sparkles size={13} /> Compose from tagged</button>}
                      </div>

                      <textarea value={row.actual_accomplishments ?? ""} onChange={event => updateRow(index, { actual_accomplishments: event.target.value })} placeholder="Actual accomplishments for this KRA…" />

                      <div className="etm-ipcr-rating-row">
                        {(["rating_q", "rating_e", "rating_t", "rating_a"] as const).map((field, i) => (
                          <label key={field}>{["Q", "E", "T", "A"][i]}
                            <select value={row[field] ?? ""} onChange={event => updateRow(index, { [field]: event.target.value ? Number(event.target.value) : null })}>
                              <option value="">—</option>
                              {RATING_SCALE.map(item => <option key={item.value} value={item.value}>{item.value}</option>)}
                            </select>
                          </label>
                        ))}
                        {rowAvg && <span className="etm-tasks-table-unassigned">Avg {rowAvg} — {adjectivalRating(Number(rowAvg))}</span>}
                        <label>Remarks <input value={row.remarks ?? ""} onChange={event => updateRow(index, { remarks: event.target.value })} style={{ minWidth: 160 }} /></label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="etm-field">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}><CalendarDays size={16} /> Office development plan <span className="etm-form-optional">(one item per line)</span></label>
                <div className="etm-ipcr-dev-plan">
                  <div className="etm-ipcr-dev-plan-col"><label>Areas of strength</label><textarea value={strengthText} onChange={event => setStrengthText(event.target.value)} /></div>
                  <div className="etm-ipcr-dev-plan-col"><label>Proposed interventions to reinforce strengths</label><textarea value={strengthInterventionsText} onChange={event => setStrengthInterventionsText(event.target.value)} /></div>
                  <div className="etm-ipcr-dev-plan-col"><label>Areas for development</label><textarea value={devText} onChange={event => setDevText(event.target.value)} /></div>
                  <div className="etm-ipcr-dev-plan-col"><label>Proposed interventions for development</label><textarea value={devInterventionsText} onChange={event => setDevInterventionsText(event.target.value)} /></div>
                </div>
              </div>

              <div className="etm-ipcr-header-grid">
                <label>Discussed with — date <input type="date" value={form.discussed_at ?? ""} onChange={event => setForm({ ...form, discussed_at: event.target.value || null })} /></label>
                <label>Assessed by — date <input type="date" value={form.assessed_at ?? ""} onChange={event => setForm({ ...form, assessed_at: event.target.value || null })} /></label>
                <label>Final rating by — date <input type="date" value={form.final_rating_at ?? ""} onChange={event => setForm({ ...form, final_rating_at: event.target.value || null })} /></label>
              </div>
            </>}

            <div className="etm-form-footer">
              <span>{form.rows.length === 0 ? "Choose a template above to start filling in KRAs." : "Save to generate the previewable, downloadable IPCR."}</span>
              <div>
                <button type="button" className="etm-button ghost" onClick={() => { setEditingId(null); setForm(null); setPreview(null); }}>{editingId === "new" ? "Cancel" : "Back to list"}</button>
                <button type="button" className="etm-button primary" onClick={() => void handleSave()} disabled={saving || form.rows.length === 0}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <FileSpreadsheet size={17} />}{saving ? "Saving…" : "Save & generate"}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {preview && (
        <section className="etm-panel" style={{ marginTop: 18, padding: 18 }}>
          <div className="etm-report-section-title">
            <div><p className="etm-report-eyebrow">Preview</p><h2>{preview.period_label || "IPCR"}</h2></div>
            <div className="etm-report-section-title-actions">
              <button type="button" className="etm-button ghost small" onClick={() => void downloadIPCRWorkbook(preview, filename(preview))}><Download size={14} /> Download .xlsx</button>
              <button type="button" className="etm-button ghost small" onClick={() => downloadIPCRPdf(preview, filename(preview))}><FileText size={14} /> Download PDF</button>
            </div>
          </div>
          <div className="etm-ipcr-preview-wrap">
            <table className="etm-ipcr-preview">
              <tbody>
                <tr className="etm-ipcr-title-row"><td colSpan={8}>INDIVIDUAL PERFORMANCE COMMITMENT AND REVIEW (IPCR) FORM</td></tr>
                <tr className="etm-ipcr-commit-row"><td colSpan={8}>I, <u>{preview.employee_name}</u>, <u>{preview.employee_position}</u> of <u>{preview.employee_office}</u>, commit to deliver and agree to be rated on the attainment of the following targets for the period of <u>{preview.period_label}</u>.</td></tr>
                <tr><th>KRA / Output</th><th>Success Indicator</th><th>Actual Accomplishments</th><th>Q</th><th>E</th><th>T</th><th>A</th><th>Remarks</th></tr>
                {preview.rows.map((row, index) => row.kind !== "data" ? (
                  <tr key={index} className={`etm-ipcr-band-${row.kind}`}><td colSpan={8}>{row.text}</td></tr>
                ) : (
                  <tr key={index}>
                    <td>{row.output}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{row.indicator}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{row.actual_accomplishments}</td>
                    <td className="etm-ipcr-rating-num">{row.rating_q ?? ""}</td>
                    <td className="etm-ipcr-rating-num">{row.rating_e ?? ""}</td>
                    <td className="etm-ipcr-rating-num">{row.rating_t ?? ""}</td>
                    <td className="etm-ipcr-rating-num">{row.rating_a ?? ""}</td>
                    <td>{row.remarks}</td>
                  </tr>
                ))}
                <tr className="etm-ipcr-final-row"><td colSpan={3}>FINAL RATING</td><td colSpan={4}>{preview.final_rating ?? "—"}</td><td>{adjectivalRating(preview.final_rating)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="etm-ipcr-preview-signoff">
            <div>Discussed with<strong>{preview.employee_name}</strong></div>
            <div>Assessed by<strong>{preview.reviewed_by_name}</strong></div>
            <div>Final Rating by<strong>{preview.approved_by_name}</strong></div>
          </div>
        </section>
      )}
    </div>
  );
}
