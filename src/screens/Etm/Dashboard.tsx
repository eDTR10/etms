import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, UserX } from "lucide-react";
import { useTasks } from "../../features/tasks/taskContext";
import { useTaskFilters } from "../../features/tasks/useTaskFilters";
import TaskFilterBar from "../../features/tasks/TaskFilterBar";
import StatusChips from "../../features/tasks/StatusChips";
import TaskDetails from "../../features/tasks/TaskDetails";
import TaskFormDialog from "../../features/tasks/TaskFormDialog";
import TaskCard from "../../features/tasks/TaskCard";
import BulkActionBar from "../../features/tasks/BulkActionBar";
import { useDeleteTaskConfirm } from "../../features/tasks/useDeleteTaskConfirm";
import { useBulkTaskActions } from "../../features/tasks/useBulkTaskActions";
import { useRowSelection } from "../../features/tasks/useRowSelection";
import { isOverdue, memberName } from "../../features/tasks/types";

interface DashboardOverviewProps {
  onViewMajorTasks: () => void;
}

export default function Dashboard({ onViewMajorTasks }: DashboardOverviewProps) {
  const {
    tasks, members, projects, updateTask,
    addProgress, editProgress, deleteProgress,
    addRemark, editRemark, deleteRemark, reactToRemark,
    addSubtaskRemark, editSubtaskRemark, deleteSubtaskRemark, reactToSubtaskRemark, setSubtaskStatus, addSubtask, editSubtask, deleteSubtask, setSubtaskCompletion,
    addRemarkAttachment, deleteRemarkAttachment, addSubtaskRemarkAttachment, deleteSubtaskRemarkAttachment, markCompletionSeen, markViewed,
  } = useTasks();
  const confirmDelete = useDeleteTaskConfirm();
  const { confirmArchive, confirmDelete: confirmBulkDelete } = useBulkTaskActions();
  const {
    filtered, search, setSearch, deadlineDate, setDeadlineDate, quickFilter, setQuickFilter,
    status, setStatus, priority, setPriority, projectFilter, setProjectFilter,
    hasActiveFilters, clearFilters,
  } = useTaskFilters(tasks);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const navigate = useNavigate();

  const totalTasks = tasks.length;
  const totalUnassigned = useMemo(() => tasks.filter(task => task.assignments.length === 0).length, [tasks]);
  const totalCompleted = useMemo(() => tasks.filter(task => task.status === "Completed").length, [tasks]);
  const totalPastDue = useMemo(() => tasks.filter(isOverdue).length, [tasks]);
  const unseenCompleted = useMemo(() => tasks.filter(task => task.is_creator && task.status === "Completed" && !task.completion_seen).length, [tasks]);

  const memberCounts = useMemo(() => members
    .map(member => ({ member, count: tasks.filter(task => task.assignments.some(a => a.id === member.id)).length }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count), [members, tasks]);

  const recentTasks = useMemo(() => [...filtered].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 6), [filtered]);

  const recentIds = useMemo(() => recentTasks.map(task => task.id), [recentTasks]);
  const selection = useRowSelection(recentIds);

  const viewingTask = tasks.find(task => task.id === viewingId) ?? null;
  const editingTask = tasks.find(task => task.id === editingId) ?? null;

  return (
    <div>
      <div className="etm-kpi-grid">
        <div className="etm-panel etm-kpi-card">
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Total Tasks</span><span className="etm-kpi-icon"><ClipboardList size={17} /></span></div>
          <span className="etm-kpi-value">{totalTasks}</span>
        </div>
        <div className="etm-panel etm-kpi-card warn">
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Unassigned Tasks</span><span className="etm-kpi-icon"><UserX size={17} /></span></div>
          <span className="etm-kpi-value">{totalUnassigned}</span>
        </div>
        <div className="etm-panel etm-kpi-card success">
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Completed Tasks</span><span className="etm-kpi-icon"><CheckCircle2 size={17} />{unseenCompleted > 0 && <span className="etm-kpi-badge" title={`${unseenCompleted} completed task${unseenCompleted === 1 ? "" : "s"} you haven't viewed yet`}>{unseenCompleted > 9 ? "9+" : unseenCompleted}</span>}</span></div>
          <span className="etm-kpi-value">{totalCompleted}</span>
        </div>
        <div className="etm-panel etm-kpi-card danger">
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Past Due Tasks</span><span className="etm-kpi-icon"><AlertTriangle size={17} /></span></div>
          <span className="etm-kpi-value">{totalPastDue}</span>
        </div>
      </div>

      <div className="etm-section">
        <div className="etm-section-heading"><div><h2>Team workload</h2><p>Members who currently have at least one task assigned.</p></div></div>
        <div className="etm-panel">
          {memberCounts.length ? memberCounts.map(({ member, count }) => {
            const memberTasks = tasks.filter(task => task.assignments.some(assignment => assignment.id === member.id));
            const expanded = expandedMemberId === member.id;
            return <div className={`etm-member-workload ${expanded ? "expanded" : ""}`} key={member.id}>
              <button type="button" className="etm-member-row" onClick={() => setExpandedMemberId(expanded ? null : member.id)} aria-expanded={expanded} aria-controls={`member-tasks-${member.id}`}>
                <span className="etm-member-row-avatar" aria-hidden="true">{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</span><span className="etm-member-row-name">{memberName(member)}{member.position && <small>{member.position}</small>}</span><span className="etm-member-row-count">{count} {count === 1 ? "task" : "tasks"}</span><ChevronRight className="etm-member-workload-chevron" size={16} />
              </button>
              {expanded && <div className="etm-member-workload-tasks" id={`member-tasks-${member.id}`}>{memberTasks.map(task => <button type="button" key={task.id} onClick={() => navigate(`/tm/tasks/${task.id}`)}><ClipboardList size={15} /><span>{task.title}<small>{task.status} · {task.project?.name ?? "Personal"}</small></span><ChevronRight size={15} /></button>)}</div>}
            </div>;
          }) : <p className="etm-empty-row">No one has a task assigned yet.</p>}
        </div>
      </div>

      <div className="etm-section">
        <div className="etm-section-heading"><div><h2>Recently added tasks</h2><p>The latest tasks created.</p></div><button type="button" className="etm-button ghost small" onClick={onViewMajorTasks}>View all</button></div>
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
        {recentTasks.length > 0 && <div className="etm-task-card-toolbar"><button type="button" className="etm-inline-link-button" onClick={selection.toggleAll}>{selection.isAllSelected ? "Clear selection" : "Select all"}</button></div>}
        <BulkActionBar
          count={selection.count}
          onArchive={() => void confirmArchive(selection.selectedIds).then(() => selection.clear())}
          onDelete={() => void confirmBulkDelete(selection.selectedIds).then(() => selection.clear())}
          onClear={selection.clear}
        />
        {recentTasks.length ? (
          <div className="etm-task-card-grid">
            {recentTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                selected={selection.isSelected(task.id)}
                onToggleSelect={() => selection.toggle(task.id)}
                onView={() => setViewingId(task.id)}
                onEdit={() => setEditingId(task.id)}
                onDelete={() => void confirmDelete(task)}
              />
            ))}
          </div>
        ) : <div className="etm-panel"><p className="etm-empty-row">{tasks.length ? "No tasks match your filters." : "No tasks yet — create your first one from Add Task."}</p></div>}
      </div>

      {viewingTask && <TaskDetails
        task={viewingTask}
        open
        onClose={() => setViewingId(null)}
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
