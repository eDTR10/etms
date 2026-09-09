import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, ChevronRight, Circle, Check, Clock3, PlayCircle, PauseCircle, CheckCircle2 } from "lucide-react";
import { useTasks } from "../../features/tasks/taskContext";
import { useTaskFilters } from "../../features/tasks/useTaskFilters";
import TaskFilterBar from "../../features/tasks/TaskFilterBar";
import StatusChips from "../../features/tasks/StatusChips";
import TaskDetails from "../../features/tasks/TaskDetails";
import TaskFormDialog from "../../features/tasks/TaskFormDialog";
import TaskRowActions from "../../features/tasks/TaskRowActions";
import TaskTitleCell from "../../features/tasks/TaskTitleCell";
import BulkActionBar from "../../features/tasks/BulkActionBar";
import { useDeleteTaskConfirm } from "../../features/tasks/useDeleteTaskConfirm";
import { useBulkTaskActions } from "../../features/tasks/useBulkTaskActions";
import { useRowSelection } from "../../features/tasks/useRowSelection";
import { formatDate, remarkPreview, statusChipLabel, type Task, type TaskStatus } from "../../features/tasks/types";

type TaskScope = "assigned" | "personal";

const SCOPE_TABS: { key: TaskScope; label: string }[] = [
  { key: "assigned", label: "Assigned Task" },
  { key: "personal", label: "Personal Task" },
];

const STATUS_KPIS: { status: TaskStatus; icon: typeof Clock3; variant: string }[] = [
  { status: "Pending", icon: Clock3, variant: "warn" },
  { status: "Ongoing", icon: PlayCircle, variant: "" },
  { status: "On hold", icon: PauseCircle, variant: "danger" },
  { status: "Completed", icon: CheckCircle2, variant: "success" },
];

export default function MajorTasks() {
  const navigate = useNavigate();
  const {
    tasks, members, projects, updateTask, listArchivedTasks,
    addProgress, editProgress, deleteProgress,
    addRemark, editRemark, deleteRemark, reactToRemark,
    addSubtaskRemark, editSubtaskRemark, deleteSubtaskRemark, reactToSubtaskRemark, setSubtaskStatus, addSubtask, editSubtask, deleteSubtask, setSubtaskCompletion,
    addRemarkAttachment, deleteRemarkAttachment, addSubtaskRemarkAttachment, deleteSubtaskRemarkAttachment, markCompletionSeen, markViewed,
  } = useTasks();
  const confirmDelete = useDeleteTaskConfirm();
  const { confirmArchive, confirmDelete: confirmBulkDelete } = useBulkTaskActions();
  const [scope, setScope] = useState<TaskScope>("assigned");
  const [showArchived, setShowArchived] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  useEffect(() => {
    if (!showArchived) return;
    let cancelled = false;
    setArchivedLoading(true);
    listArchivedTasks()
      .then(rows => { if (!cancelled) setArchivedTasks(rows); })
      .finally(() => { if (!cancelled) setArchivedLoading(false); });
    return () => { cancelled = true; };
  }, [showArchived, listArchivedTasks]);

  const baseTasks = showArchived ? archivedTasks : tasks;
  const scopedTasks = useMemo(() => baseTasks.filter(task => scope === "personal" ? !task.project : !!task.project), [baseTasks, scope]);
  const scopeCounts = useMemo(() => ({
    assigned: baseTasks.filter(task => !!task.project).length,
    personal: baseTasks.filter(task => !task.project).length,
  }), [baseTasks]);

  const statusCounts = useMemo(() => {
    const counts = { Pending: 0, Ongoing: 0, "On hold": 0, Completed: 0 } as Record<TaskStatus, number>;
    scopedTasks.forEach(task => { counts[task.status] += 1; });
    return counts;
  }, [scopedTasks]);

  const {
    filtered, search, setSearch, deadlineDate, setDeadlineDate, quickFilter, setQuickFilter,
    status, setStatus, priority, setPriority, projectFilter, setProjectFilter,
    hasActiveFilters, clearFilters,
  } = useTaskFilters(scopedTasks);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [viewingSubtaskId, setViewingSubtaskId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const filteredIds = useMemo(() => filtered.map(task => task.id), [filtered]);
  const selection = useRowSelection(filteredIds);

  const viewingTask = baseTasks.find(task => task.id === viewingId) ?? null;
  const editingTask = baseTasks.find(task => task.id === editingId) ?? null;

  return (
    <div>
      <div className="etm-major-tasks-toolbar">
        <div className="etm-tabs" role="tablist" aria-label="Task scope">
          {SCOPE_TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={scope === tab.key}
              className={`etm-tab ${scope === tab.key ? "active" : ""}`}
              onClick={() => setScope(tab.key)}
            >
              {tab.label} <span className="etm-tab-count">{scopeCounts[tab.key]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`etm-button ghost small etm-archived-toggle ${showArchived ? "active" : ""}`}
          aria-pressed={showArchived}
          onClick={() => setShowArchived(value => !value)}
        >
          <Archive size={14} />{showArchived ? "Showing Archived" : "Archived"}
        </button>
      </div>
      {showArchived && archivedLoading && <p className="etm-empty-row">Loading archived tasks…</p>}

      <div className="etm-kpi-grid">
        {STATUS_KPIS.map(({ status: kpiStatus, icon: Icon, variant }) => (
          <button
            key={kpiStatus}
            type="button"
            className={`etm-panel etm-kpi-card etm-kpi-card-button ${variant} ${status === kpiStatus ? "selected" : ""}`}
            onClick={() => setStatus(current => current === kpiStatus ? "all" : kpiStatus)}
          >
            <div className="etm-kpi-card-top"><span className="etm-kpi-label">{kpiStatus}</span><span className="etm-kpi-icon"><Icon size={17} /></span></div>
            <span className="etm-kpi-value">{statusCounts[kpiStatus]}</span>
          </button>
        ))}
      </div>

      <TaskFilterBar
        search={search}
        onSearchChange={setSearch}
        deadlineDate={deadlineDate}
        onDeadlineDateChange={setDeadlineDate}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        priority={priority}
        onPriorityChange={setPriority}
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        projects={projects}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      />

      <StatusChips value={status} onChange={setStatus} />

      <BulkActionBar
        count={selection.count}
        onArchive={() => void confirmArchive(selection.selectedIds).then(() => selection.clear())}
        onDelete={() => void confirmBulkDelete(selection.selectedIds).then(() => selection.clear())}
        onClear={selection.clear}
      />

      <div className="etm-panel etm-table-wrap">
        <table className="etm-tasks-table">
          <thead>
            <tr>
              <th scope="col" className="etm-tasks-table-title-col">
                <div className="etm-task-title-heading">
                <input
                  type="checkbox"
                  aria-label="Select all tasks"
                  checked={selection.isAllSelected}
                  ref={el => { if (el) el.indeterminate = selection.isSomeSelected; }}
                  onChange={selection.toggleAll}
                />
                Task Title
                </div>
              </th>
              <th scope="col">Date</th>
              <th scope="col">Progress Log</th>
              <th scope="col" className="etm-tasks-table-actions-col">Action Buttons</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map(task => {
              const expanded = expandedId === task.id;
              const hasSubtasks = task.subtasks.length > 0;
              const lastRemark = task.remarks[0];
              return (
                <Fragment key={task.id}>
                  <tr className={expanded ? "expanded" : ""}>
                    <td className="etm-tasks-table-title-col">
                      <TaskTitleCell task={task} onOpen={() => navigate(`/etms/tasks/${task.id}`)}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${task.title}`}
                        checked={selection.isSelected(task.id)}
                        onChange={() => selection.toggle(task.id)}
                      />
                      {hasSubtasks && (
                        <button
                          type="button"
                          className={`etm-accordion-toggle-icon ${expanded ? "open" : ""}`}
                          onClick={() => setExpandedId(expanded ? null : task.id)}
                          aria-expanded={expanded}
                          aria-controls={`task-subtasks-${task.id}`}
                          aria-label={expanded ? `Collapse subtasks for ${task.title}` : `Expand subtasks for ${task.title}`}
                        >
                          <ChevronRight size={14} />
                        </button>
                      )}
                      </TaskTitleCell>
                    </td>
                    <td><div className="etm-task-cell-stack"><span>{formatDate(task.created_at)}</span>{task.deadline && <small>Due {formatDate(task.deadline)}</small>}</div></td>
                    <td>
                      <div className="etm-progresslog-cell">
                        <span className={`etm-badge ${task.status.toLowerCase().replace(/\s+/g, "-")}`}>{statusChipLabel(task)}</span>
                        {lastRemark ? (
                          <p className="etm-progresslog-remark">"{remarkPreview(lastRemark.message)}"<small>— {lastRemark.created_by_name ?? "Unknown"}</small></p>
                        ) : <small className="etm-progresslog-empty">No remarks yet.</small>}
                      </div>
                    </td>
                    <td><TaskRowActions task={task} onView={() => navigate(`/etms/tasks/${task.id}`)} onEdit={() => setEditingId(task.id)} onDelete={() => void confirmDelete(task)} /></td>
                  </tr>
                  {expanded && (
                    <tr className="etm-tasks-table-subrow" id={`task-subtasks-${task.id}`}>
                      <td colSpan={4}>
                        <div className="etm-accordion-body">
                          {task.subtasks.map((subtask, index) => (
                            <button type="button" className={`etm-accordion-subtask ${subtask.is_completed ? "completed" : ""}`} key={subtask.id ?? index} onClick={() => { setViewingSubtaskId(subtask.id ?? null); setViewingId(task.id); }} aria-label={`Open subtask: ${subtask.title}`}>
                              {subtask.is_completed ? <Check size={13} /> : <Circle size={13} />}
                              <span className="etm-accordion-subtask-text">
                                <span className="etm-accordion-subtask-title-row"><span>{subtask.title}</span><span className={`etm-badge ${subtask.status.toLowerCase().replace(/\s+/g, "-")}`}>{subtask.status}</span></span>
                                {subtask.description && <small>{subtask.description}</small>}
                                <small>Open updates</small>
                              </span>
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            }) : (
              <tr><td colSpan={4} className="etm-empty-row">{
                !tasks.length ? "No tasks yet — create your first one from Add Task."
                : !scopedTasks.length ? (scope === "personal" ? "You don't have any personal tasks yet." : "No assigned tasks yet.")
                : "No tasks match your filters."
              }</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewingTask && <TaskDetails
        task={viewingTask}
        open
        onClose={() => { setViewingId(null); setViewingSubtaskId(null); }}
        initialSubtaskId={viewingSubtaskId}
        onEdit={() => { setEditingId(viewingTask.id); setViewingId(null); }}
        onProgress={(message, status) => addProgress(viewingTask.id, message, status)}
        onEditProgress={(logId, message) => editProgress(viewingTask.id, logId, message)}
        onDeleteProgress={logId => deleteProgress(viewingTask.id, logId)}
        onAddRemark={(message, file) => addRemark(viewingTask.id, message, file)}
        onEditRemark={(remarkId, message) => editRemark(viewingTask.id, remarkId, message)}
        onDeleteRemark={remarkId => deleteRemark(viewingTask.id, remarkId)}
        onReactRemark={(remarkId, emoji) => reactToRemark(viewingTask.id, remarkId, emoji)}
        onAddSubtaskRemark={(subtaskId, message, file) => addSubtaskRemark(viewingTask.id, subtaskId, message, file)}
        onEditSubtaskRemark={(subtaskId, remarkId, message) => editSubtaskRemark(viewingTask.id, subtaskId, remarkId, message)}
        onDeleteSubtaskRemark={(subtaskId, remarkId) => deleteSubtaskRemark(viewingTask.id, subtaskId, remarkId)}
        onReactSubtaskRemark={(subtaskId, remarkId, emoji) => reactToSubtaskRemark(viewingTask.id, subtaskId, remarkId, emoji)}
        onSetSubtaskStatus={(subtaskId, message, status) => setSubtaskStatus(viewingTask.id, subtaskId, message, status)}
        onAddSubtask={(title, description) => addSubtask(viewingTask.id, title, description)}
        onEditSubtask={(subtaskId, input) => editSubtask(viewingTask.id, subtaskId, input)}
        onDeleteSubtask={subtaskId => deleteSubtask(viewingTask.id, subtaskId)}
        onSetSubtaskCompletion={(subtaskId, isCompleted) => setSubtaskCompletion(viewingTask.id, subtaskId, isCompleted)}
        onAddRemarkAttachment={(remarkId, file) => addRemarkAttachment(viewingTask.id, remarkId, file)}
        onDeleteRemarkAttachment={(remarkId, attachmentId) => deleteRemarkAttachment(viewingTask.id, remarkId, attachmentId)}
        onAddSubtaskRemarkAttachment={(subtaskId, remarkId, file) => addSubtaskRemarkAttachment(viewingTask.id, subtaskId, remarkId, file)}
        onDeleteSubtaskRemarkAttachment={(subtaskId, remarkId, attachmentId) => deleteSubtaskRemarkAttachment(viewingTask.id, subtaskId, remarkId, attachmentId)}
        onMarkCompletionSeen={() => markCompletionSeen(viewingTask.id)}
        onMarkViewed={() => markViewed(viewingTask.id)}
      />}

      <TaskFormDialog
        task={editingTask ?? undefined}
        members={members}
        projects={projects}
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        onSave={async input => { if (editingId !== null) await updateTask(editingId, input); }}
      />
    </div>
  );
}
