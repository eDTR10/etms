import { useState } from "react";
import { Bookmark, CheckCheck, Pencil, Plus, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import TemplateFormDialog from "../../features/tasks/TemplateFormDialog";
import { useTasks } from "../../features/tasks/taskContext";
import { taskError } from "../../features/tasks/taskService";
import { flattenTemplateSubtasks, type TaskTemplate } from "../../features/tasks/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

export function TemplatesContent() {
  const { templates, projects, loading, error, createTemplate, updateTemplate, deleteTemplate } = useTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | undefined>(undefined);

  const openCreate = () => { setEditingTemplate(undefined); setDialogOpen(true); };
  const openEdit = (template: TaskTemplate) => { setEditingTemplate(template); setDialogOpen(true); };
  const closeDialog = () => setDialogOpen(false);

  const confirmDelete = async (template: TaskTemplate) => {
    const result = await Swal.fire({
      title: "Delete this template?",
      text: `"${template.name}" will be permanently removed. Tasks already created from it won't be affected.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-danger-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      await deleteTemplate(template.id);
      void Swal.fire({ title: "Template deleted", icon: "success", timer: 1400, showConfirmButton: false });
    } catch (err) {
      void Swal.fire({ title: "Couldn't delete template", text: taskError(err), icon: "error" });
    }
  };

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><Bookmark size={15} /> Reusable blueprints</p>
          <h2>Task Templates</h2>
          <p>Save the details you retype every time, then start a new task from a template in one click.</p>
        </div>
        <button type="button" className="etm-button" onClick={openCreate}><Plus size={16} /> New Template</button>
      </section>

      <TaskFeedback />
      {!loading && !error && (
        <section className="etm-panel etm-table-wrap">
          <table className="etm-tasks-table etm-report-table">
            <thead><tr>
              <th>Template Name</th><th>Default Title</th><th>Project</th><th>Priority</th><th>Subtasks</th><th className="etm-tasks-table-actions-col">Action Buttons</th>
            </tr></thead>
            <tbody>
              {templates.length ? templates.map(template => (
                <tr key={template.id}>
                  <td className="etm-tasks-table-details-col">{template.name}</td>
                  <td>{template.title || <span className="etm-tasks-table-unassigned">Not set</span>}</td>
                  <td>{template.is_personal ? "Personal" : template.project || <span className="etm-tasks-table-unassigned">Not set</span>}</td>
                  <td className={template.priority.toLowerCase()}>{template.priority}</td>
                  <td>{template.subtasks.length ? <span><CheckCheck size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />{flattenTemplateSubtasks(template.subtasks).length}</span> : <span className="etm-tasks-table-unassigned">None</span>}</td>
                  <td className="etm-report-group-actions">
                    <button type="button" className="etm-icon-button" aria-label={`Edit ${template.name}`} onClick={() => openEdit(template)}><Pencil size={15} /></button>
                    <button type="button" className="etm-icon-button danger" aria-label={`Delete ${template.name}`} onClick={() => void confirmDelete(template)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="etm-empty-row">No templates yet. Create one to speed up task creation next time.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <TemplateFormDialog
        template={editingTemplate}
        projects={projects}
        open={dialogOpen}
        onClose={closeDialog}
        onSave={async input => {
          if (editingTemplate) await updateTemplate(editingTemplate.id, input);
          else await createTemplate(input);
          await Swal.fire({ title: editingTemplate ? "Template updated" : "Template created", icon: "success", timer: 1400, showConfirmButton: false });
        }}
      />
    </div>
  );
}

export default function Templates() {
  return (
    <UserLayout title="Task Templates" subtitle="Reuse task details instead of retyping them.">
      <TaskProvider>
        <TemplatesContent />
      </TaskProvider>
    </UserLayout>
  );
}
