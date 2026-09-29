import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, FileText, X } from "lucide-react";
import { formatDate } from "../tasks/types";
import { openInDmt } from "./SubtaskDocumentControls";
import type { DtmsDocumentStatus, DtmsDocumentStatusSignatory } from "./dtmsDocumentTypes";

const SIGNATORY_STATUS_BADGE: Record<DtmsDocumentStatusSignatory["status"], string> = {
  signed: "completed",
  viewed: "in-progress",
  rejected: "blocked-stuck",
  pending: "pending",
};

// Consecutive signatories under the same office are shown as one group, matching how
// DMT-Front-end's Sign Document page presents the signing chain.
function groupByOffice(signatories: DtmsDocumentStatusSignatory[]) {
  const groups: { office: string; rows: DtmsDocumentStatusSignatory[] }[] = [];
  for (const sig of signatories) {
    const office = sig.user_office || "Unspecified office";
    const last = groups[groups.length - 1];
    if (last && last.office === office) last.rows.push(sig);
    else groups.push({ office, rows: [sig] });
  }
  return groups;
}

interface DocumentDetailDialogProps {
  open: boolean;
  status: DtmsDocumentStatus | null;
  onClose: () => void;
}

export default function DocumentDetailDialog({ open, status, onClose }: DocumentDetailDialogProps) {
  if (!open || !status) return null;
  const groups = groupByOffice(status.signatories);
  const uniqueOrders = [...new Set(status.signatories.map(sig => sig.order))].sort((a, b) => a - b);
  const stepNumber = (order: number) => uniqueOrders.indexOf(order) + 1;

  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="etm-dialog-overlay" />
        <Dialog.Content className="etm-dialog etm-taskform-dialog" aria-describedby={undefined}>
          <div className="etm-taskform-dialog-header">
            <Dialog.Title className="etm-taskform-dialog-title">Document details</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="etm-icon-button" aria-label="Close"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="etm-taskform-dialog-body">
            <div className="etm-doc-detail-header">
              <span className="etm-doc-detail-icon" aria-hidden="true"><FileText size={18} /></span>
              <div>
                <strong>{status.title}</strong>
                <p className="etm-doc-detail-meta">{status.tracknumber} · {status.type}{status.to_office_name ? ` · ${status.to_office_name}` : ""}</p>
                <p className="etm-doc-detail-meta">Submitted by {status.requestor}{status.position ? `, ${status.position}` : ""}</p>
              </div>
            </div>
            {status.message && <p className="etm-doc-detail-message">{status.message}</p>}
            {groups.map(group => (
              <div key={group.office}>
                <p className="etm-doc-detail-office-label">{group.office}</p>
                {group.rows.map(sig => (
                  <div key={sig.id} className="etm-doc-detail-sig-row">
                    <span className="etm-sig-row-badge" aria-hidden="true">{stepNumber(sig.order)}</span>
                    <span className="etm-doc-detail-sig-name">
                      <strong>{sig.user_name}</strong>
                      {sig.signed_at && <small>{sig.status === "signed" ? "Signed" : "Updated"} on {formatDate(sig.signed_at, true)}</small>}
                    </span>
                    <span className={`etm-role-pill ${sig.role === "viewer" || sig.role === "reviewer" ? sig.role : "signer"}`}>{sig.role.charAt(0).toUpperCase() + sig.role.slice(1)}</span>
                    <span className={`etm-badge ${SIGNATORY_STATUS_BADGE[sig.status]}`}>{sig.status.charAt(0).toUpperCase() + sig.status.slice(1)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="etm-form-footer">
            <span>{status.status} · {status.signed_count}/{status.total_signatories} signed</span>
            <div>
              <button type="button" className="etm-button ghost" onClick={onClose}>Close</button>
              <button type="button" className="etm-button primary" onClick={() => openInDmt(status.tracknumber)}><ExternalLink size={16} />Open in DTMS</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
