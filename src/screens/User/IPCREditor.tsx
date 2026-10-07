import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import IPCRTemplateForm from "../../features/ipcr/IPCRTemplateForm";
import { ipcrService } from "../../features/ipcr/ipcrService";
import { taskError } from "../../features/tasks/taskService";
import { normalizeGrid, type IPCRSubmission, type IPCRTemplate } from "../../features/ipcr/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";
import "../../features/ipcr/ipcr.css";

// A user's own IPCR, opened in the sheet editor on a screen of its own: the X / Back returns to Generate IPCR.
export default function IPCREditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<IPCRSubmission | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    ipcrService.listSubmissions()
      .then(rows => {
        if (cancelled) return;
        const found = rows.find(row => row.id === Number(id));
        if (found) setSubmission(found); else setError("This IPCR could not be found.");
      })
      .catch(err => { if (!cancelled) setError(taskError(err)); });
    return () => { cancelled = true; };
  }, [id]);

  // The sheet editor is built around a template; give it the user's copy in that shape.
  const asTemplate = useMemo<IPCRTemplate | undefined>(() => submission ? {
    id: submission.id,
    name: submission.label,
    grid: normalizeGrid(submission.grid_snapshot),
    fields_config: submission.fields_snapshot,
    paper_size: submission.paper_size,
    orientation: submission.orientation,
    created_at: submission.created_at,
    updated_at: submission.updated_at,
    can_manage: submission.can_manage,
  } : undefined, [submission]);

  const goBack = () => navigate("/etms/ipcr");

  if (error) {
    return (
      <div className="etm-error" style={{ margin: 24 }}>
        <div><strong>IPCR unavailable</strong><p>{error}</p></div>
        <button type="button" className="etm-button ghost" onClick={goBack}>Go back</button>
      </div>
    );
  }
  if (!submission || !asTemplate) return null;

  return (
    <IPCRTemplateForm
      submissionMode
      template={asTemplate}
      onCancel={goBack}
      onSave={async input => {
        const saved = await ipcrService.updateSubmission(submission.id, {
          label: input.name,
          grid_snapshot: input.grid,
          fields_snapshot: input.fields_config,
          paper_size: input.paper_size,
          orientation: input.orientation,
        });
        setSubmission(saved);
        await Swal.fire({ title: "IPCR saved", icon: "success", timer: 1400, showConfirmButton: false });
      }}
    />
  );
}
