import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { taskService, taskError } from "../tasks/taskService";
import { useAuth } from "../../screens/Auth/AuthContext";
import { autofillValue } from "./ipcrAutofill";
import { ipcrService } from "./ipcrService";
import { downloadIPCRWorkbook } from "./ipcrExport";
import { downloadIPCRPdf } from "./ipcrPdfExport";
import { fillGrid } from "./ipcrGridUtils";
import { adjectivalRating, normalizeGrid, type IPCRField, type IPCRFieldValue, type IPCRSubmission, type IPCRTemplate } from "./types";
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

export default function GenerateIPCRContent() {
  const { user: profile } = useAuth();
  const navigate = useNavigate();
  const [officeName, setOfficeName] = useState("");
  const [templates, setTemplates] = useState<IPCRTemplate[]>([]);
  const [submissions, setSubmissions] = useState<IPCRSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // The account only stores the office's id; look its name up once.
  useEffect(() => {
    if (!profile?.office) return;
    taskService.projects().then(offices => setOfficeName(offices.find(office => office.id === profile.office)?.name ?? "")).catch(() => undefined);
  }, [profile?.office]);

  useEffect(() => {
    Promise.all([ipcrService.listTemplates(), ipcrService.listSubmissions()])
      .then(([templateRows, submissionRows]) => { setTemplates(templateRows); setSubmissions(submissionRows); })
      .catch(err => setError(taskError(err)))
      .finally(() => setLoading(false));
  }, []);

  // Makes the user's own copy of the template (with whatever the account already knows filled in) and opens it for editing.
  async function generate() {
    const template = templates.find(item => item.id === templateId);
    if (!template) { setError("Choose a template first."); return; }
    if (!label.trim()) { setError("Give your IPCR a file name."); return; }
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const fields = template.fields_config;
      const values = Object.fromEntries(fields.map(field => [field.key, startingValue(field, profile, officeName)]));
      const saved = await ipcrService.createSubmission({
        template: template.id,
        label: label.trim(),
        grid_snapshot: fillGrid(normalizeGrid(template.grid), fields, values),
        fields_snapshot: [],
        paper_size: template.paper_size,
        orientation: template.orientation,
        field_values: {},
        field_meta: {},
      });
      navigate(`/etms/ipcr/${saved.id}`);
    } catch (caught) {
      setError(taskError(caught));
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
    } catch (err) {
      void Swal.fire({ title: "Couldn't delete IPCR", text: taskError(err), icon: "error" });
    }
  }

  const filename = (submission: IPCRSubmission) => `IPCR-${(submission.label || "form").replace(/\s+/g, "-")}`;
  const chosen = templates.find(template => template.id === templateId);

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><FileSpreadsheet size={15} /> Your IPCRs</p>
          <h2>Generate IPCR</h2>
          <p>Pick a template and name your file — then edit it and drag in your grouped activities.</p>
        </div>
        {!creating && <button type="button" className="etm-button" onClick={() => { setCreating(true); setError(""); }}><Plus size={16} /> New IPCR</button>}
      </section>

      {error && !creating && <p className="etm-report-error">{error}</p>}

      {creating && (
        <section className="etm-panel etm-form-section" style={{ marginTop: 18 }}>
          <div className="etm-form-section-heading">
            <span className="etm-form-section-icon"><FileSpreadsheet size={19} /></span>
            <div><h2>New IPCR</h2><p>Choose a template and give your file a name.</p></div>
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
                value={chosen ? { value: chosen.id, label: chosen.name } : null}
                onChange={option => setTemplateId(option?.value ?? null)}
              />
              {chosen?.sample_document_url && (
                <p className="etm-form-helper" style={{ marginTop: 8 }}>
                  <FileText size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                  <a href={chosen.sample_document_url} target="_blank" rel="noreferrer">View sample document{chosen.sample_document_name ? ` (${chosen.sample_document_name})` : ""}</a>
                </p>
              )}
            </div>
            <div className="etm-field">
              <label htmlFor="ipcr-label">File name <span aria-hidden="true">*</span></label>
              <input id="ipcr-label" value={label} onChange={event => setLabel(event.target.value)} placeholder="e.g. IPCR January to June 2026" maxLength={255} onKeyDown={event => { if (event.key === "Enter") void generate(); }} />
            </div>
            <div className="etm-form-footer">
              <span>You can edit the whole sheet on the next screen.</span>
              <div>
                <button type="button" className="etm-button ghost" onClick={() => { setCreating(false); setError(""); }} disabled={saving}>Cancel</button>
                <button type="button" className="etm-button primary" onClick={() => void generate()} disabled={saving || !templateId || !label.trim()}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <FileSpreadsheet size={17} />}{saving ? "Generating…" : "Save & generate"}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {!loading && !creating && (
        submissions.length ? (
          <div className="etm-quicklinks-grid">
            {submissions.map(submission => (
              <div className="etm-panel etm-quicklink-card" key={submission.id}>
                <button type="button" className="etm-quicklink-card-open" style={{ background: "none", border: 0, padding: 0, textAlign: "left", font: "inherit", color: "inherit", cursor: submission.can_manage ? "pointer" : "default" }}
                  onClick={() => { if (submission.can_manage) navigate(`/etms/ipcr/${submission.id}`); }} aria-label={`Open ${submission.label || "IPCR"}`}>
                  <span className="etm-quicklink-card-icon"><FileSpreadsheet size={19} /></span>
                  <span className="etm-quicklink-card-body">
                    <strong>{submission.label || "Untitled IPCR"}</strong>
                    <small title={templates.find(t => t.id === submission.template)?.name}>{templates.find(t => t.id === submission.template)?.name ?? "Deleted template"}</small>
                    {submission.final_rating !== null && <small>Final rating: {submission.final_rating} — {adjectivalRating(submission.final_rating)}</small>}
                    <span className="etm-quicklink-card-url">Updated {new Date(submission.updated_at).toLocaleDateString()}</span>
                  </span>
                </button>
                <div className="etm-quicklink-card-actions">
                  {submission.can_manage && <button type="button" className="etm-icon-button" aria-label="Edit" title="Edit" onClick={() => navigate(`/etms/ipcr/${submission.id}`)}><Pencil size={15} /></button>}
                  <button type="button" className="etm-icon-button" aria-label="Download Excel" title="Download Excel" onClick={() => void downloadIPCRWorkbook(fillGrid(normalizeGrid(submission.grid_snapshot), submission.fields_snapshot, submission.field_values), filename(submission))}><Download size={15} /></button>
                  <button type="button" className="etm-icon-button" aria-label="Download PDF" title="Download PDF" onClick={() => downloadIPCRPdf(fillGrid(normalizeGrid(submission.grid_snapshot), submission.fields_snapshot, submission.field_values), filename(submission), submission.paper_size, submission.orientation)}><FileText size={15} /></button>
                  {submission.can_manage && <button type="button" className="etm-icon-button danger" aria-label="Delete" title="Delete" onClick={() => void confirmDelete(submission)}><Trash2 size={15} /></button>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="etm-empty-row">No IPCRs generated yet. Create one to get started.</p>
      )}
    </div>
  );
}