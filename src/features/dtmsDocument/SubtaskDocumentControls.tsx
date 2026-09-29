import { useState } from "react";
import { ExternalLink, FileText, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { taskError } from "../tasks/taskService";
import CreateDocumentDialog from "./CreateDocumentDialog";
import DocumentDetailDialog from "./DocumentDetailDialog";
import type { DtmsDocumentStatus } from "./dtmsDocumentTypes";

const DMT_FRONTEND_URL = (import.meta.env.VITE_DMT_FRONTEND_URL as string | undefined)?.replace(/\/$/, "");

export function openInDmt(tracknumber: string) {
  if (!DMT_FRONTEND_URL) return;
  window.open(`${DMT_FRONTEND_URL}/dtms/sign/${tracknumber}`, "_blank", "noopener,noreferrer");
}

// Display for a subtask already linked to a document — the live status/counts are fetched by
// the caller (SubtaskPanel) on open, not by this component, so opening a task with many linked
// subtasks fires one batched fetch rather than one per chip. Clicking it opens the full
// signatory breakdown; it's a <span role="button">, not a real <button>, because this chip
// renders inside the subtask row's own toggle <button> and nesting buttons is invalid HTML.
export function DocumentStatusChip({ tracknumber, status, loading }: { tracknumber: string; status: DtmsDocumentStatus | null; loading: boolean }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const label = status ? `${status.status}${status.total_signatories ? ` (${status.signed_count}/${status.total_signatories})` : ""}` : (loading ? "Loading…" : tracknumber);

  function openDetail(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    if (status) setDetailOpen(true);
  }

  return (
    <>
      <span
        className="etm-subtask-assignee-chip etm-subtask-doc-chip"
        role="button"
        tabIndex={0}
        title={status ? `${status.title} — click for details` : tracknumber}
        onClick={openDetail}
        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(event); } }}
      >
        <FileText size={11} />{tracknumber} · {label}
      </span>
      <DocumentDetailDialog open={detailOpen} status={status} onClose={() => setDetailOpen(false)} />
    </>
  );
}

export function DocumentActionButtons({ subtaskTitle, tracknumber, refreshing, unlinking, onRefresh, onUnlink }: {
  subtaskTitle: string; tracknumber: string; refreshing: boolean; unlinking: boolean;
  onRefresh: () => void; onUnlink: () => void;
}) {
  return <>
    <button type="button" className="etm-icon-button" aria-label={`Refresh document status for ${subtaskTitle}`} title="Refresh status" disabled={refreshing} onClick={onRefresh}>{refreshing ? <Loader2 size={14} className="etm-form-spinner" /> : <RefreshCw size={14} />}</button>
    {DMT_FRONTEND_URL && <button type="button" className="etm-icon-button" aria-label={`Open ${tracknumber} in DTMS`} title="Open in DTMS" onClick={() => openInDmt(tracknumber)}><ExternalLink size={14} /></button>}
    <button type="button" className="etm-icon-button danger" aria-label={`Unlink document from ${subtaskTitle}`} title="Unlink document" disabled={unlinking} onClick={onUnlink}>{unlinking ? <Loader2 size={14} className="etm-form-spinner" /> : <Unlink size={14} />}</button>
  </>;
}

interface DocumentLinkButtonProps {
  subtaskTitle: string;
  linking: boolean;
  defaultDocumentTemplateId?: number | null;
  onCreated: (tracknumber: string) => Promise<void>;
  onLinkExisting: (tracknumber: string) => Promise<void>;
}

// The unlinked-state trigger: opens either the full Create Document dialog, or a small
// inline "paste a tracking number" fallback for a document already made elsewhere.
export function DocumentLinkButton({ subtaskTitle, linking, defaultDocumentTemplateId, onCreated, onLinkExisting }: DocumentLinkButtonProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [existingTrack, setExistingTrack] = useState("");
  const [linkingExisting, setLinkingExisting] = useState(false);
  const [linkError, setLinkError] = useState("");

  async function submitExisting() {
    if (!existingTrack.trim() || linkingExisting) return;
    setLinkingExisting(true); setLinkError("");
    try {
      await onLinkExisting(existingTrack.trim());
      setExistingTrack("");
      setPanelOpen(false);
    } catch (caught) {
      setLinkError(taskError(caught));
    } finally {
      setLinkingExisting(false);
    }
  }

  return <>
    <button type="button" className="etm-icon-button" aria-label={`Attach a document to subtask: ${subtaskTitle}`} title="Create or link a document" disabled={linking} onClick={() => setPanelOpen(value => !value)}>
      {linking ? <Loader2 size={14} className="etm-form-spinner" /> : <FileText size={14} />}
    </button>
    {panelOpen && (
      <div className="etm-member-picker etm-subtask-assign-picker">
        <div className="etm-form-section-body" style={{ padding: 10, gap: 10 }}>
          <button type="button" className="etm-button primary small" onClick={() => { setCreateOpen(true); setPanelOpen(false); }}><FileText size={14} />Create a new document</button>
          <div className="etm-field" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>Or link an existing tracking number</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={existingTrack} onChange={event => setExistingTrack(event.target.value)} placeholder="DOC2026001" disabled={linkingExisting} />
              <button type="button" className="etm-button ghost small" disabled={linkingExisting || !existingTrack.trim()} onClick={() => void submitExisting()}>{linkingExisting ? <Loader2 size={13} className="etm-form-spinner" /> : <Link2 size={13} />}Link</button>
            </div>
            {linkError && <p className="etm-field-error" role="alert">{linkError}</p>}
          </div>
        </div>
      </div>
    )}
    <CreateDocumentDialog open={createOpen} defaultTitle={subtaskTitle} initialTemplateId={defaultDocumentTemplateId} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
  </>;
}
