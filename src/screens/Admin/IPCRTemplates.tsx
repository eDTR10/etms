import { useEffect, useState } from "react";
import { FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import IPCRTemplateFormDialog from "../../features/ipcr/IPCRTemplateFormDialog";
import { ipcrService } from "../../features/ipcr/ipcrService";
import { taskError } from "../../features/tasks/taskService";
import type { IPCRTemplate } from "../../features/ipcr/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";
import "../../features/ipcr/ipcr.css";

function IPCRTemplatesContent() {
  const [templates, setTemplates] = useState<IPCRTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<IPCRTemplate | undefined>(undefined);

  const refresh = () => {
    setLoading(true);
    ipcrService.listTemplates()
      .then(setTemplates)
      .catch(err => setError(taskError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openCreate = () => { setEditingTemplate(undefined); setDialogOpen(true); };
  const openEdit = (template: IPCRTemplate) => { setEditingTemplate(template); setDialogOpen(true); };
  const closeDialog = () => setDialogOpen(false);

  const confirmDelete = async (template: IPCRTemplate) => {
    const result = await Swal.fire({
      title: "Delete this IPCR template?",
      text: `"${template.name}" will be permanently removed. IPCRs already generated from it won't be affected.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-danger-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      await ipcrService.deleteTemplate(template.id);
      setTemplates(current => current.filter(item => item.id !== template.id));
      void Swal.fire({ title: "Template deleted", icon: "success", timer: 1400, showConfirmButton: false });
    } catch (err) {
      void Swal.fire({ title: "Couldn't delete template", text: taskError(err), icon: "error" });
    }
  };

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><FileSpreadsheet size={15} /> IPCR forms</p>
          <h2>IPCR Templates</h2>
          <p>Define the KRA structure users pick from when they generate their own IPCR.</p>
        </div>
        <button type="button" className="etm-button" onClick={openCreate}><Plus size={16} /> New IPCR Template</button>
      </section>

      {error && <p className="etm-report-error">{error}</p>}
      {!loading && !error && (
        <section className="etm-panel etm-table-wrap">
          <table className="etm-tasks-table etm-report-table">
            <thead><tr><th>Template Name</th><th>Rows</th><th>Last updated</th><th className="etm-tasks-table-actions-col">Action Buttons</th></tr></thead>
            <tbody>
              {templates.length ? templates.map(template => (
                <tr key={template.id}>
                  <td className="etm-tasks-table-details-col">{template.name}</td>
                  <td>{template.rows.length}</td>
                  <td>{new Date(template.updated_at).toLocaleDateString()}</td>
                  <td className="etm-report-group-actions">
                    <button type="button" className="etm-icon-button" aria-label={`Edit ${template.name}`} onClick={() => openEdit(template)}><Pencil size={15} /></button>
                    <button type="button" className="etm-icon-button danger" aria-label={`Delete ${template.name}`} onClick={() => void confirmDelete(template)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              )) : <tr><td colSpan={4} className="etm-empty-row">No IPCR templates yet. Create one so users can generate their IPCR from it.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <IPCRTemplateFormDialog
        template={editingTemplate}
        open={dialogOpen}
        onClose={closeDialog}
        onSave={async input => {
          const saved = editingTemplate ? await ipcrService.updateTemplate(editingTemplate.id, input) : await ipcrService.createTemplate(input);
          setTemplates(current => editingTemplate ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
          await Swal.fire({ title: editingTemplate ? "Template updated" : "Template created", icon: "success", timer: 1400, showConfirmButton: false });
        }}
      />
    </div>
  );
}

export default function AdminIPCRTemplates() {
  return (
    <AdminLayout title="IPCR Templates" subtitle="Every saved IPCR template.">
      <IPCRTemplatesContent />
    </AdminLayout>
  );
}
