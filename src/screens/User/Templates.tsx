import { SortTh, useTableSort } from "../../features/tasks/useTableSort";
import { useState } from "react";
// Needed again if Import Template is turned back on: useRef, type ChangeEvent (react), Upload (lucide-react), readTemplateImportFile (templateShare).
import { Bookmark, CheckCheck, Download, Pencil, Plus, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import TemplateFormDialog from "../../features/tasks/TemplateFormDialog";
import { useTasks } from "../../features/tasks/taskContext";
import { taskError } from "../../features/tasks/taskService";
import { exportTemplate } from "../../features/tasks/templateShare";
import { flattenTemplateSubtasks, type TaskTemplate, type TaskTemplateInput } from "../../features/tasks/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

export function TemplatesContent() {
  const { templates, members, projects, loading, error, createTemplate, updateTemplate, deleteTemplate } = useTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | undefined>(undefined);
  const [importDraft, setImportDraft] = useState<TaskTemplateInput | undefined>(undefined);
  // const importInputRef = useRef<HTMLInputElement>(null);

  const openCreate = () => { setEditingTemplate(undefined); setImportDraft(undefined); setDialogOpen(true); };
  const openEdit = (template: TaskTemplate) => { setEditingTemplate(template); setImportDraft(undefined); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setImportDraft(undefined); };

  // Import Template hidden for now:
  // const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
  //   const file = event.target.files?.[0];
  //   event.target.value = "";
  //   if (!file) return;
  //   try {
  //     const draft = await readTemplateImportFile(file);
  //     setEditingTemplate(undefined);
  //     setImportDraft(draft);
  //     setDialogOpen(true);
  //   } catch (err) {
  //     void Swal.fire({ title: "Couldn't import that file", text: err instanceof Error ? err.message : "Make sure it's a template exported from here.", icon: "error" });
  //   }
  // };

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

  const { sorted: sortedTemplates, sort, toggle: toggleSort } = useTableSort(templates, {
    name: template => template.name,
    title: template => template.title,
    project: template => template.is_personal ? "Personal" : template.project,
    priority: template => ({ Low: 1, Medium: 2, High: 3 } as Record<string, number>)[template.priority],
    subtasks: template => flattenTemplateSubtasks(template.subtasks).length,
  });

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><Bookmark size={15} /> Reusable blueprints</p>
          <p>Save the details you retype every time, then start a new task from a template in one click.</p>
        </div>
        <div className="etm-report-section-title-actions">
          {/* Import Template hidden for now:
          <input ref={importInputRef} type="file" accept=".json,application/json" hidden onChange={event => void handleImportFile(event)} />
          <button type="button" className="etm-button ghost" onClick={() => importInputRef.current?.click()}><Upload size={16} /> Import Template</button>
          */}
          <button type="button" className="etm-button" onClick={openCreate}><Plus size={16} /> New Template</button>
        </div>
      </section>

      <TaskFeedback />
      {!loading && !error && (
        <section className="etm-panel etm-table-wrap">
          <table className="etm-tasks-table etm-report-table">
            <thead><tr>
              <SortTh sortKey="name" sort={sort} onSort={toggleSort}>Template Name</SortTh><SortTh sortKey="title" sort={sort} onSort={toggleSort}>Default Title</SortTh><SortTh sortKey="project" sort={sort} onSort={toggleSort}>Project</SortTh><SortTh sortKey="priority" sort={sort} onSort={toggleSort}>Priority</SortTh><SortTh sortKey="subtasks" sort={sort} onSort={toggleSort}>Subtasks</SortTh><th className="etm-tasks-table-actions-col">Action Buttons</th>
            </tr></thead>
            <tbody>
              {sortedTemplates.length ? sortedTemplates.map(template => (
                <tr key={template.id}>
                  <td className="etm-tasks-table-details-col">{template.name}</td>
                  <td>{template.title || <span className="etm-tasks-table-unassigned">Not set</span>}</td>
                  <td>{template.is_personal ? "Personal" : template.project || <span className="etm-tasks-table-unassigned">Not set</span>}</td>
                  <td className={template.priority.toLowerCase()}>{template.priority}</td>
                  <td>{template.subtasks.length ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CheckCheck size={13} />{flattenTemplateSubtasks(template.subtasks).length}</span> : <span className="etm-tasks-table-unassigned">None</span>}</td>
                  <td className="etm-report-group-actions">
                    <button type="button" className="etm-icon-button" aria-label={`Export ${template.name}`} title="Download as JSON" onClick={() => exportTemplate(template)}><Download size={15} /></button>
                    {template.can_manage ? <>
                      <button type="button" className="etm-icon-button" aria-label={`Edit ${template.name}`} onClick={() => openEdit(template)}><Pencil size={15} /></button>
                      <button type="button" className="etm-icon-button danger" aria-label={`Delete ${template.name}`} onClick={() => void confirmDelete(template)}><Trash2 size={15} /></button>
                    </> : <span className="etm-tasks-table-unassigned">Shared</span>}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="etm-empty-row">No templates yet. Create one to speed up task creation next time.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <TemplateFormDialog
        template={editingTemplate}
        initialInput={importDraft}
        members={members}
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
    <UserLayout title="Task Template" subtitle="Reuse task details instead of retyping them.">
      <TaskProvider>
        <TemplatesContent />
      </TaskProvider>
    </UserLayout>
  );
}
