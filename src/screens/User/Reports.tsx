import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, ChevronRight, FolderKanban, GripVertical, Layers, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import Swal from "sweetalert2";
import Modal from "../../components/ui/modal";
import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import { taskError, taskService } from "../../features/tasks/taskService";
import { formatDate, type GroupedTask, type GroupedTaskInput } from "../../features/tasks/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

const today = () => new Intl.DateTimeFormat("en-PH", {
  month: "short", day: "numeric", year: "numeric",
}).format(new Date());

function suggestedGroupId() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ACT-${stamp}-${String(Date.now()).slice(-4)}`;
}

// Swal's `html` option renders raw markup, and task titles are user input — escape via
// the DOM instead of hand-rolling regex replacement, so it stays correct for every character.
function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function ReportsContent() {
  const { tasks, projects, loading, error, updateTask } = useTasks();
  const completedTasks = useMemo(
    () => tasks.filter(task => task.is_completed || task.status === "Completed"),
    [tasks],
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Snapshot of which tasks the dialog will submit — seeded from the outer Completed
  // Tasks table's checkbox selection (create) or the group's current tags (edit), and
  // shown read-only in the dialog; it's not itself editable there anymore.
  const [dialogTaskIds, setDialogTaskIds] = useState<Set<number>>(new Set());
  const [renamingTaskId, setRenamingTaskId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null);
  const [groups, setGroups] = useState<GroupedTask[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupedTask | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<Omit<GroupedTaskInput, "task_ids">>({
    grouped_task_id: suggestedGroupId(),
    name: "",
    project_name: "",
    has_target: false,
    target_value: null,
    target_type: "number",
  });

  useEffect(() => {
    let cancelled = false;
    taskService.listGroupedTasks()
      .then(rows => { if (!cancelled) setGroups(rows); })
      .catch(err => { if (!cancelled) setGroupsError(taskError(err)); })
      .finally(() => { if (!cancelled) setGroupsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const dismissProjectMenu = (event: PointerEvent) => {
      if (!projectPickerRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismissProjectMenu);
    return () => document.removeEventListener("pointerdown", dismissProjectMenu);
  }, [projectMenuOpen]);

  const matchingProjects = useMemo(() => {
    const search = form.project_name.trim().toLocaleLowerCase();
    return projects.filter(project => project.name.toLocaleLowerCase().includes(search));
  }, [form.project_name, projects]);
  const typedProjectName = form.project_name.trim();
  const canAddTypedProject = !!typedProjectName && !projects.some(
    project => project.name.toLocaleLowerCase() === typedProjectName.toLocaleLowerCase(),
  );

  const selectedCompleted = completedTasks.filter(task => selectedIds.has(task.id));
  const allSelected = completedTasks.length > 0 && completedTasks.every(task => selectedIds.has(task.id));
  const dialogTaggedTasks = completedTasks.filter(task => dialogTaskIds.has(task.id));

  const toggleTask = (id: number) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(current => {
      if (completedTasks.length && completedTasks.every(task => current.has(task.id))) return new Set();
      return new Set(completedTasks.map(task => task.id));
    });
  };

  const openGroupDialog = () => {
    setFormError(null);
    setEditingGroup(null);
    setForm({
      grouped_task_id: suggestedGroupId(),
      name: "",
      project_name: selectedCompleted[0]?.project?.name ?? "",
      has_target: false,
      target_value: null,
      target_type: "number",
    });
    setDialogTaskIds(new Set(selectedIds));
    setProjectMenuOpen(false);
    setGroupDialogOpen(true);
  };

  const openEditGroupDialog = (group: GroupedTask) => {
    setFormError(null);
    setEditingGroup(group);
    setForm({
      grouped_task_id: group.grouped_task_id,
      name: group.name,
      project_name: group.project_name,
      has_target: group.has_target,
      target_value: group.target_value,
      target_type: group.target_type,
    });
    setDialogTaskIds(new Set(group.tasks.map(task => task.id)));
    setProjectMenuOpen(false);
    setGroupDialogOpen(true);
  };

  const closeGroupDialog = () => {
    if (submitting) return;
    setGroupDialogOpen(false);
    setEditingGroup(null);
    setDialogTaskIds(new Set());
  };

  const updateTargetEnabled = (hasTarget: boolean) => {
    setForm(current => ({
      ...current,
      has_target: hasTarget,
      target_value: hasTarget ? (current.target_type === "percent" ? 100 : dialogTaggedTasks.length) : null,
    }));
  };

  const submitGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.grouped_task_id.trim() || !form.name.trim()) {
      setFormError("Grouped task ID and name are required.");
      return;
    }
    if (form.has_target && (!form.target_value || form.target_value < 1)) {
      setFormError("Enter a target greater than zero.");
      return;
    }
    if (form.target_type === "percent" && (form.target_value ?? 0) > 100) {
      setFormError("A percentage target cannot exceed 100.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingGroup) {
        // Tagging is managed outside this dialog now (drag-and-drop to add, the × button
        // in the expanded row to remove), so an edit here only ever touches name/project/target.
        const updated = await taskService.updateGroupedTask(editingGroup.id, form);
        setGroups(current => current.map(group => group.id === updated.id ? updated : group));
        setEditingGroup(null);
      } else {
        const group = await taskService.createGroupedTask({ ...form, task_ids: dialogTaggedTasks.map(task => task.id) });
        setGroups(current => [group, ...current]);
        setExpandedGroupId(group.id);
        setSelectedIds(new Set());
      }
      setDialogTaskIds(new Set());
      setGroupDialogOpen(false);
    } catch (err) {
      setFormError(taskError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const startRenameTask = (taskId: number, title: string) => {
    setRenamingTaskId(taskId);
    setRenameValue(title);
  };

  const cancelRenameTask = () => {
    setRenamingTaskId(null);
    setRenameValue("");
  };

  const saveRenameTask = async (taskId: number) => {
    const title = renameValue.trim();
    if (!title) return;
    setRenaming(true);
    try {
      await updateTask(taskId, { title });
      // `groups` is a separate snapshot from the task list (fetched once, then patched
      // locally on group-mutating actions), so a task rename needs its own patch here —
      // otherwise every group holding this task would keep showing its old title.
      setGroups(current => current.map(group => ({
        ...group,
        tasks: group.tasks.map(item => item.id === taskId ? { ...item, title } : item),
      })));
      setRenamingTaskId(null);
    } catch (err) {
      void Swal.fire({ title: "Couldn't rename task", text: taskError(err), icon: "error" });
    } finally {
      setRenaming(false);
    }
  };

  const removeTaskFromGroup = async (group: GroupedTask, taskId: number) => {
    const task = group.tasks.find(item => item.id === taskId);
    const result = await Swal.fire({
      title: "Remove this task from the group?",
      text: `"${task?.title ?? "This task"}" will be untagged from "${group.name}." The task itself won't be deleted.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try {
      const updated = await taskService.updateGroupedTask(group.id, { task_ids: group.tasks.filter(item => item.id !== taskId).map(item => item.id) });
      setGroups(current => current.map(item => item.id === updated.id ? updated : item));
    } catch (err) {
      void Swal.fire({ title: "Couldn't update group", text: taskError(err), icon: "error" });
    }
  };

  const DRAG_TASK_TYPE = "application/x-etm-task-id";

  const addTaskToGroupByDrag = async (group: GroupedTask, taskId: number) => {
    if (!taskId || Number.isNaN(taskId)) return;
    if (group.tasks.some(item => item.id === taskId)) {
      void Swal.fire({ title: "Already tagged", text: "This task is already part of this group.", icon: "info", timer: 1400, showConfirmButton: false });
      return;
    }
    const task = completedTasks.find(item => item.id === taskId);
    try {
      const updated = await taskService.updateGroupedTask(group.id, { task_ids: [...group.tasks.map(item => item.id), taskId] });
      setGroups(current => current.map(item => item.id === updated.id ? updated : item));
      void Swal.fire({ title: "Task added to group", text: task ? `"${task.title}" was tagged to "${group.name}."` : undefined, icon: "success", timer: 1400, showConfirmButton: false });
    } catch (err) {
      void Swal.fire({ title: "Couldn't add task to group", text: taskError(err), icon: "error" });
    }
  };

  const confirmDeleteGroup = async (group: GroupedTask) => {
    const taskListHtml = group.tasks.length
      ? `<ul class="etm-report-delete-task-list">${group.tasks.map(task => `<li>${escapeHtml(task.title)}</li>`).join("")}</ul>`
      : "";
    const result = await Swal.fire({
      title: "Delete this grouped task?",
      html: `<p>"${escapeHtml(group.name)}" will be permanently removed. The tasks inside it won't be deleted.</p>${taskListHtml}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-danger-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      await taskService.deleteGroupedTask(group.id);
      setGroups(current => current.filter(item => item.id !== group.id));
      setExpandedGroupId(current => current === group.id ? null : current);
      void Swal.fire({ title: "Group deleted", icon: "success", timer: 1400, showConfirmButton: false });
    } catch (err) {
      void Swal.fire({ title: "Couldn't delete group", text: taskError(err), icon: "error" });
    }
  };

  const groupProgress = (group: GroupedTask) => {
    const total = group.tasks.length;
    if (!group.has_target) return `${total}/${total}`;
    if (group.target_type === "percent") return "100%";
    return `${total}/${group.target_value ?? total}`;
  };

  return (
    <div className="etm-reports etm-report-split">
      <div className="etm-report-column">
        <section className="etm-report-heading">
          <div>
            <p className="etm-report-eyebrow"><CheckCircle2 size={15} /> Completed work</p>
            <h2>Completed Tasks</h2>
            <p>Select completed tasks, then collect them into a grouped activity report.</p>
          </div>
          {selectedCompleted.length > 0 && (
            <button type="button" className="etm-button" onClick={openGroupDialog}><Layers size={16} /> Group Activity ({selectedCompleted.length})</button>
          )}
        </section>

        <TaskFeedback />
        {!loading && !error && (
          <section className="etm-panel etm-table-wrap">
            <table className="etm-tasks-table etm-report-table">
              <thead><tr>
                <th className="etm-report-check"><input type="checkbox" aria-label="Select all completed tasks" checked={allSelected} onChange={toggleAll} /></th>
                <th>Task Title</th><th>Date and Time Finished</th><th>Description</th>
              </tr></thead>
              <tbody>
                {completedTasks.length ? completedTasks.map(task => (
                  <tr
                    key={task.id}
                    draggable
                    title="Drag onto a group below to add it there"
                    onDragStart={event => {
                      event.dataTransfer.setData(DRAG_TASK_TYPE, String(task.id));
                      event.dataTransfer.setData("text/plain", String(task.id));
                      event.dataTransfer.effectAllowed = "copy";
                      setDragTaskId(task.id);
                    }}
                    onDragEnd={() => setDragTaskId(null)}
                    className={dragTaskId === task.id ? "etm-report-row-dragging" : undefined}
                  >
                    <td className="etm-report-check"><input type="checkbox" aria-label={`Select ${task.title}`} checked={selectedIds.has(task.id)} onChange={() => toggleTask(task.id)} /></td>
                    <td className="etm-report-task-title"><GripVertical size={13} className="etm-report-drag-handle" aria-hidden="true" />{task.title}</td>
                    <td>{formatDate(task.updated_at, true)}</td>
                    <td className="etm-tasks-table-details-col">{task.details ? <span title={task.details}>{task.details}</span> : <span className="etm-tasks-table-unassigned">No details</span>}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="etm-empty-row">No completed tasks are available yet.</td></tr>}
              </tbody>
            </table>
          </section>
        )}

      </div>

      <div className="etm-report-column">
        <section className="etm-report-groups-section">
          <div className="etm-report-section-title "><div><p className="etm-report-eyebrow"><FolderKanban size={15} /> Activity reports</p><h2>Grouped Tasks</h2></div><div className="etm-report-section-title-actions"><span>{groups.length} {groups.length === 1 ? "group" : "groups"}</span><button type="button" className="etm-button ghost small" onClick={openGroupDialog}><Plus size={14} /> New Group</button></div></div>
          <p className={`etm-report-drag-hint ${dragTaskId !== null ? "active" : ""}`}><GripVertical size={14} aria-hidden="true" />{dragTaskId !== null ? "Drop it on a group to add it." : "Tip: drag a completed task from the left and drop it on a group to add it directly."}</p>
          {groupsError && <p className="etm-report-error">{groupsError}</p>}
          {groupsLoading ? <p className="etm-empty-row">Loading grouped tasks…</p> : (
            <div className="etm-panel etm-table-wrap etm-report-groups">
              <table className="etm-tasks-table etm-report-groups-table">
                <thead><tr><th>Grouped Task</th><th>Project</th><th>Created</th><th className="etm-tasks-table-actions-col">Action Buttons</th></tr></thead>
                <tbody>{groups.length ? groups.map(group => {
                  const expanded = expandedGroupId === group.id;
                  return <Fragment key={group.id}>
                    <tr
                      onDragOver={event => {
                        if (dragTaskId === null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                        if (dragOverGroupId !== group.id) setDragOverGroupId(group.id);
                      }}
                      onDragLeave={() => setDragOverGroupId(current => current === group.id ? null : current)}
                      onDrop={event => {
                        event.preventDefault();
                        setDragOverGroupId(null);
                        setDragTaskId(null);
                        const raw = event.dataTransfer.getData(DRAG_TASK_TYPE) || event.dataTransfer.getData("text/plain");
                        void addTaskToGroupByDrag(group, Number(raw));
                      }}
                      className={dragOverGroupId === group.id ? "etm-report-group-drag-over" : undefined}
                    >
                      <td><button type="button" className="etm-report-group-row" onClick={() => setExpandedGroupId(expanded ? null : group.id)} aria-expanded={expanded} aria-controls={`group-tasks-${group.id}`}><ChevronRight className={expanded ? "open" : ""} size={18} /><span className="etm-report-group-name-block"><small className="etm-report-group-id">{group.grouped_task_id}</small><span className="etm-report-group-name">{group.name} <strong>({groupProgress(group)})</strong></span></span></button></td>
                      <td>{group.project_name || <span className="etm-tasks-table-unassigned">Personal</span>}</td>
                      <td>{formatDate(group.created_at)}</td>
                      <td className="etm-report-group-actions">
                        <button type="button" className="etm-icon-button" aria-label={`Edit ${group.name}`} onClick={() => openEditGroupDialog(group)}><Pencil size={15} /></button>
                        <button type="button" className="etm-icon-button danger" aria-label={`Delete ${group.name}`} onClick={() => void confirmDeleteGroup(group)}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                    {expanded && <tr className="etm-report-group-expanded"><td colSpan={4}><div className="etm-report-group-tasks" id={`group-tasks-${group.id}`}>{group.tasks.length ? group.tasks.map(task => {
                      const isRenaming = renamingTaskId === task.id;
                      return (
                        <div key={task.id}>
                          <CheckCircle2 size={15} />
                          {isRenaming ? (
                            <div className="etm-report-group-task-rename">
                              <input
                                autoFocus
                                className="etm-report-group-task-rename-input"
                                value={renameValue}
                                onChange={event => setRenameValue(event.target.value)}
                                onKeyDown={event => {
                                  if (event.key === "Escape") cancelRenameTask();
                                  else if (event.key === "Enter") { event.preventDefault(); void saveRenameTask(task.id); }
                                }}
                                maxLength={255}
                                disabled={renaming}
                                aria-label={`New title for ${task.title}`}
                              />
                              <button type="button" className="etm-icon-button" aria-label="Save title" onClick={() => void saveRenameTask(task.id)} disabled={renaming}><Check size={14} /></button>
                              <button type="button" className="etm-icon-button" aria-label="Cancel rename" onClick={cancelRenameTask} disabled={renaming}><X size={14} /></button>
                            </div>
                          ) : (
                            <>
                              <span>{task.title}</span>
                              <button type="button" className="etm-icon-button etm-report-group-task-rename-trigger" aria-label={`Rename ${task.title}`} onClick={() => startRenameTask(task.id, task.title)}><Pencil size={12} /></button>
                            </>
                          )}
                          <div className="etm-report-group-task-meta">
                            <small>{task.project_name || "Personal"}</small>
                            <button type="button" className="etm-icon-button" aria-label={`Remove ${task.title} from ${group.name}`} onClick={() => void removeTaskFromGroup(group, task.id)}><X size={13} /></button>
                          </div>
                        </div>
                      );
                    }) : <p className="etm-report-group-tasks-empty">No tasks tagged yet. Drag a completed task from the list on the left onto this row to add one.</p>}</div></td></tr>}
                  </Fragment>;
                }) : <tr><td colSpan={4} className="etm-empty-row">No grouped activities yet. Select completed tasks to create one.</td></tr>}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Modal open={groupDialogOpen} onClose={closeGroupDialog} title={editingGroup ? "Edit Grouped Task" : "Group Activity"}>
        <form className="etm-report-form" onSubmit={submitGroup}>
          <p className="etm-report-form-intro">{editingGroup
            ? "Update this group's name, project, or target."
            : dialogTaggedTasks.length
              ? `Grouping ${dialogTaggedTasks.length} completed ${dialogTaggedTasks.length === 1 ? "task" : "tasks"}.`
              : "Creating this group in advance — you can tag completed tasks later by dragging them onto it."}</p>
          {formError && <p className="etm-report-error">{formError}</p>}
          <label>Grouped Tasks ID<input value={form.grouped_task_id} readOnly aria-label="Automatically generated grouped task ID" /></label>
          <label>Grouped Tasks Name<input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required maxLength={255} placeholder="e.g. eGov Booth Conducted" /></label>
          <label>Created Date<input value={today()} readOnly aria-label="Created date" /></label>
          <label>Project Name<div className="etm-report-project-picker" ref={projectPickerRef}><input value={form.project_name} onFocus={() => setProjectMenuOpen(true)} onChange={event => { setForm(current => ({ ...current, project_name: event.target.value })); setProjectMenuOpen(true); }} placeholder="Type to search projects…" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={projectMenuOpen} aria-controls="report-project-options" onKeyDown={event => { if (event.key === "Escape") setProjectMenuOpen(false); }} /><button type="button" className="etm-report-project-toggle" aria-label="Show project suggestions" onClick={() => setProjectMenuOpen(open => !open)}><ChevronDown size={17} /></button>{projectMenuOpen && <div className="etm-report-project-menu" id="report-project-options" role="listbox"><button type="button" role="option" aria-selected={!form.project_name} onClick={() => { setForm(current => ({ ...current, project_name: "" })); setProjectMenuOpen(false); }}>Personal / no project</button>{canAddTypedProject && <button type="button" className="etm-report-project-add" role="option" onClick={() => setProjectMenuOpen(false)}>Add “{typedProjectName}”</button>}{matchingProjects.length ? matchingProjects.map(project => <button type="button" role="option" aria-selected={form.project_name === project.name} key={project.id} onClick={() => { setForm(current => ({ ...current, project_name: project.name })); setProjectMenuOpen(false); }}>{project.name}</button>) : !canAddTypedProject && <p>No matching project found.</p>}</div>}</div></label>
          <fieldset><legend>Do you have a target?</legend><div className="etm-report-radio-row"><label><input type="radio" checked={!form.has_target} onChange={() => updateTargetEnabled(false)} /> No</label><label><input type="radio" checked={form.has_target} onChange={() => updateTargetEnabled(true)} /> Yes</label></div></fieldset>
          {form.has_target && <div className="etm-report-target-row"><label>Target<input type="number" min="1" max={form.target_type === "percent" ? 100 : undefined} value={form.target_value ?? ""} onChange={event => setForm(current => ({ ...current, target_value: event.target.value === "" ? null : Number(event.target.value) }))} readOnly={form.target_type === "percent"} aria-label={form.target_type === "percent" ? "Percentage target is automatically set to 100 percent" : "Target"} required /></label><label>Unit<select value={form.target_type} onChange={event => setForm(current => ({ ...current, target_type: event.target.value as "number" | "percent", target_value: event.target.value === "percent" ? 100 : dialogTaggedTasks.length }))}><option value="number">Number</option><option value="percent">Percent</option></select></label></div>}
          {dialogTaggedTasks.length > 0 && (
            <div className="etm-report-task-picker">
              <p className="etm-report-task-picker-label">Tasks in this group ({dialogTaggedTasks.length})</p>
              <ul className="etm-report-task-picker-list">
                {dialogTaggedTasks.map(task => (
                  <li key={task.id} className="etm-report-task-picker-row">
                    <span>{task.title}</span>
                    <small>{task.project?.name || "Personal"}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="etm-report-form-actions"><button type="button" className="etm-button ghost" onClick={closeGroupDialog} disabled={submitting}>Cancel</button><button type="submit" className="etm-button" disabled={submitting}>{editingGroup ? <Check size={16} /> : <Target size={16} />}{submitting ? "Saving…" : editingGroup ? "Save changes" : "Submit"}</button></div>
        </form>
      </Modal>
    </div>
  );
}

export default function Reports() {
  return <UserLayout title="Reports" subtitle="Review completed tasks and organize them into grouped activities."><TaskProvider><ReportsContent /></TaskProvider></UserLayout>;
}
