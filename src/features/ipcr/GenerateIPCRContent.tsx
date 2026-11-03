import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FilePlus2, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { taskService, taskError } from "../tasks/taskService";
import { useAuth } from "../../screens/Auth/AuthContext";
import { startingValue } from "./ipcrAutofill";
import { ipcrService } from "./ipcrService";
import { downloadIPCRWorkbook } from "./ipcrExport";
import { buildIPCRPdfBlob, downloadIPCRPdf } from "./ipcrPdfExport";
import CreateDocumentDialog from "../dtmsDocument/CreateDocumentDialog";
import { DocumentActionButtons, DocumentStatusChip, openInDmt } from "../dtmsDocument/SubtaskDocumentControls";
import { dtmsDocumentService } from "../dtmsDocument/dtmsDocumentService";
import type { DtmsDocumentStatus } from "../dtmsDocument/dtmsDocumentTypes";
import { latestSignedFileUrl } from "../dtmsDocument/dtmsDocumentUtils";
import api from "../../plugin/axios";
import { fillGrid } from "./ipcrGridUtils";
import { adjectivalRating, normalizeGrid, type IPCRSubmission, type IPCRTemplate } from "./types";
import "../tasks/forms.css";
import "./ipcr.css";

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

  // Makes the user's own copy of the template (with whatever the account already knows pre-filled) and opens it.
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
        // The fill-in fields stay fields: the next screen shows them as inputs (the ones the account can answer already
        // filled in, still editable) beside a live preview of the document.
        grid_snapshot: normalizeGrid(template.grid),
        fields_snapshot: fields,
        paper_size: template.paper_size,
        orientation: template.orientation,
        field_values: values,
        field_meta: {},
        synced_template_at: template.updated_at,
        layout_edited: false,
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

  // DTMS: start a blank (no template) document with this IPCR's PDF already attached.
  const [dtmsDraft, setDtmsDraft] = useState<{ id: number; title: string; file: File } | null>(null);
  const [docStatuses, setDocStatuses] = useState<Record<string, DtmsDocumentStatus | null>>({});
  const [docLoading, setDocLoading] = useState<Record<string, boolean>>({});
  async function loadDocStatus(tracknumber: string) {
    setDocLoading(current => ({ ...current, [tracknumber]: true }));
    try {
      const status = await dtmsDocumentService.getStatus(tracknumber);
      setDocStatuses(current => ({ ...current, [tracknumber]: status }));
    } catch {
      setDocStatuses(current => ({ ...current, [tracknumber]: null }));
    } finally {
      setDocLoading(current => ({ ...current, [tracknumber]: false }));
    }
  }
  // Fetch each linked document's live status once the list is in (and again for newly linked ones).
  useEffect(() => {
    submissions.forEach(item => {
      if (item.dtms_tracknumber && !(item.dtms_tracknumber in docStatuses)) void loadDocStatus(item.dtms_tracknumber);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions]);
  // PDF button: once the linked DTMS document has a signed copy, that is what gets downloaded.
  async function downloadPdf(submission: IPCRSubmission) {
    const tracknumber = submission.dtms_tracknumber;
    const generated = () => downloadIPCRPdf(fillGrid(normalizeGrid(submission.grid_snapshot), submission.fields_snapshot, submission.field_values), filename(submission), submission.paper_size, submission.orientation);
    if (!tracknumber) { generated(); return; }
    let status = docStatuses[tracknumber] ?? null;
    try { status = await dtmsDocumentService.getStatus(tracknumber); setDocStatuses(current => ({ ...current, [tracknumber]: status })); } catch { /* use what we already have */ }
    const signedUrl = latestSignedFileUrl(status);
    if (!signedUrl) {
      const choice = await Swal.fire({
        title: "Not signed yet",
        text: `${tracknumber} has no signed copy in DTMS${status ? ` (status: ${status.status})` : ""}. Download the unsigned PDF instead?`,
        icon: "info", showCancelButton: true, confirmButtonText: "Download unsigned", cancelButtonText: "Cancel",
      });
      if (choice.isConfirmed) generated();
      return;
    }
    try {
      const response = await api.get<Blob>(signedUrl, { responseType: "blob" });
      const href = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = href; link.download = `${filename(submission)}-signed.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    }
  }
  async function setDocLink(id: number, tracknumber: string) {
    const updated = await ipcrService.updateSubmission(id, { dtms_tracknumber: tracknumber });
    setSubmissions(current => current.map(item => item.id === id ? { ...item, dtms_tracknumber: updated.dtms_tracknumber ?? tracknumber } : item));
  }
  async function unlinkDoc(submission: IPCRSubmission) {
    const result = await Swal.fire({
      title: "Unlink this document?",
      text: `"${submission.dtms_tracknumber}" stays in DTMS untouched — only the link from this IPCR is removed.`,
      icon: "warning", showCancelButton: true, confirmButtonText: "Unlink", cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try { await setDocLink(submission.id, ""); } catch (caught) { void Swal.fire({ title: "Couldn't unlink", text: taskError(caught), icon: "error" }); }
  }
  const [preparingId, setPreparingId] = useState<number | null>(null);
  async function startDtmsDocument(submission: IPCRSubmission) {
    if (preparingId !== null) return;
    setPreparingId(submission.id);
    try {
      const blob = await buildIPCRPdfBlob(fillGrid(normalizeGrid(submission.grid_snapshot), submission.fields_snapshot, submission.field_values), submission.paper_size, submission.orientation);
      setDtmsDraft({ id: submission.id, title: submission.label || "IPCR", file: new File([blob], `${filename(submission)}.pdf`, { type: "application/pdf" }) });
    } catch (caught) {
      void Swal.fire({ title: "Couldn't prepare the PDF", text: taskError(caught), icon: "error" });
    } finally {
      setPreparingId(null);
    }
  }
  async function dtmsCreated(tracknumber: string) {
    const draftId = dtmsDraft?.id;
    if (draftId !== undefined) {
      try { await setDocLink(draftId, tracknumber); } catch { /* document exists in DTMS either way; the link can be re-made */ }
    }
    const result = await Swal.fire({
      title: "Document created",
      text: `Tracking number ${tracknumber}. The IPCR PDF is attached.`,
      icon: "success",
      showCancelButton: !!import.meta.env.VITE_DMT_FRONTEND_URL,
      confirmButtonText: "Done",
      cancelButtonText: "Open in DTMS",
    });
    if (result.dismiss === Swal.DismissReason.cancel) openInDmt(tracknumber);
  }
  const filename = (submission: IPCRSubmission) => `IPCR-${(submission.label || "form").replace(/\s+/g, "-")}`;
  const chosen = templates.find(template => template.id === templateId);

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><FileSpreadsheet size={15} /> Your IPCRs</p>
          <p>Pick a template and name your file — then edit it and drag in your grouped activities.</p>
        </div>
        {!creating && <button type="button" className="etm-button" onClick={() => { setCreating(true); setError(""); }}><Plus size={16} /> New IPCR</button>}
      </section>

      {error && !creating && <p className="etm-report-error">{error}</p>}

      {creating && (
        <section className="etm-panel etm-form-section etm-task-form" style={{ marginTop: 18 }}>
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
                isDisabled={templates.every(template => template.is_enabled === false)}
                isSearchable
                placeholder={templates.some(template => template.is_enabled !== false) ? "Choose an IPCR template…" : "No IPCR templates available"}
                options={templates.filter(template => template.is_enabled !== false).map(template => ({ value: template.id, label: template.name }))}
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
              <input id="ipcr-label" type="text" autoFocus value={label} onChange={event => setLabel(event.target.value)} placeholder="e.g. IPCR January to June 2026" maxLength={255} onKeyDown={event => { if (event.key === "Enter") void generate(); }} />
            </div>
            <div className="etm-form-footer">
              <span>Next you fill in your details with the finished document shown beside them.</span>
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
              <div className="etm-panel etm-quicklink-card etm-ipcr-card" key={submission.id}>
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
                {submission.dtms_tracknumber ? (
                  <div className="etm-ipcr-doc">
                    <span className="etm-ipcr-doc-label">DTMS document</span>
                    <DocumentStatusChip tracknumber={submission.dtms_tracknumber} status={docStatuses[submission.dtms_tracknumber] ?? null} loading={!!docLoading[submission.dtms_tracknumber]} />
                    <span className="etm-ipcr-doc-actions"><DocumentActionButtons subtaskTitle={submission.label || "IPCR"} tracknumber={submission.dtms_tracknumber} refreshing={!!docLoading[submission.dtms_tracknumber]} unlinking={false} onRefresh={() => void loadDocStatus(submission.dtms_tracknumber!)} onUnlink={() => void unlinkDoc(submission)} /></span>
                  </div>
                ) : (
                  <button type="button" className="etm-ipcr-doc-create" disabled={preparingId === submission.id} onClick={() => void startDtmsDocument(submission)}>{preparingId === submission.id ? <Loader2 size={14} className="etm-form-spinner" /> : <FilePlus2 size={14} />}Send for signing in DTMS</button>
                )}
                <div className="etm-ipcr-card-footer">
                  {submission.can_manage && <button type="button" className="etm-button primary small" onClick={() => navigate(`/etms/ipcr/${submission.id}`)}><Pencil size={14} />Edit</button>}
                  <button type="button" className="etm-button ghost small" title={latestSignedFileUrl(submission.dtms_tracknumber ? docStatuses[submission.dtms_tracknumber] : null) ? "Download the signed copy from DTMS" : "Download PDF"} onClick={() => void downloadPdf(submission)}><FileText size={15} />{latestSignedFileUrl(submission.dtms_tracknumber ? docStatuses[submission.dtms_tracknumber] : null) ? "Signed PDF" : "PDF"}</button>
                  <button type="button" className="etm-button ghost small" title="Download Excel" onClick={() => void downloadIPCRWorkbook(fillGrid(normalizeGrid(submission.grid_snapshot), submission.fields_snapshot, submission.field_values), filename(submission))}><Download size={15} />Excel</button>
                  {submission.can_manage && <button type="button" className="etm-icon-button danger etm-ipcr-card-delete" aria-label="Delete" title="Delete" onClick={() => void confirmDelete(submission)}><Trash2 size={15} /></button>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="etm-empty-row">No IPCRs generated yet. Create one to get started.</p>
      )}

      <CreateDocumentDialog open={!!dtmsDraft} defaultTitle={dtmsDraft?.title ?? ""} initialFiles={dtmsDraft ? [dtmsDraft.file] : undefined} onClose={() => setDtmsDraft(null)} onCreated={dtmsCreated} />
    </div>
  );
}
