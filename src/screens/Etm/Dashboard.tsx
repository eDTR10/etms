import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, UserX } from "lucide-react";
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
import { useDuplicateTask } from "../../features/tasks/useDuplicateTask";
import { useBulkTaskActions } from "../../features/tasks/useBulkTaskActions";
import { useRowSelection } from "../../features/tasks/useRowSelection";
import { formatDate, isOverdue, memberName, remarkPreview, statusChipLabel, statusSlug, STATUSES, type TaskStatus } from "../../features/tasks/types";
import Modal from "../../components/ui/modal";

interface DashboardOverviewProps {
  onViewMajorTasks: () => void;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  Pending: "#c18a31",
  "In-Progress": "#5484bd",
  Completed: "#3e9276",
  "Blocked/Stuck": "#c0605a",
};

const WORKLOAD_PAGE_SIZE = 5;

function StatusDonut({ segments, centerPct, centerLabel }: { segments: { color: string; start: number; end: number }[]; centerPct: number; centerLabel: string }) {
  const hasData = segments.some(segment => segment.end > segment.start);
  const gradient = hasData
    ? segments.map(segment => `${segment.color} ${segment.start}% ${segment.end}%`).join(", ")
    : "var(--etm-surface-sunken) 0% 100%";
  return (
    <div className="etm-donut-wrap">
      <div className="etm-donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="etm-donut-center">
          <span className="etm-donut-pct">{centerPct}%</span>
          <span className="etm-donut-label">{centerLabel}</span>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="etm-donut-row">
      <div className="etm-donut-row-top">
        <span className="etm-donut-row-label"><span className="etm-donut-dot" style={{ backgroundColor: color }} />{label}</span>
        <span className="etm-donut-row-count">{count}</span>
      </div>
      <div className="etm-donut-row-track"><div className="etm-donut-row-fill" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
      <span className="etm-donut-row-caption">{pct}% of all tasks</span>
    </div>
  );
}

export default function Dashboard({ onViewMajorTasks }: DashboardOverviewProps) {
  const {
    tasks, members, projects, updateTask,
    addProgress, editProgress, deleteProgress,
    addRemark, editRemark, deleteRemark, reactToRemark, addRemarkReply,
    addSubtaskRemark, editSubtaskRemark, deleteSubtaskRemark, reactToSubtaskRemark, addSubtaskRemarkReply, setSubtaskStatus, addSubtask, editSubtask, deleteSubtask, setSubtaskCompletion,
    addRemarkAttachment, deleteRemarkAttachment, addSubtaskRemarkAttachment, deleteSubtaskRemarkAttachment, markCompletionSeen, markViewed,
  } = useTasks();
  const confirmDelete = useDeleteTaskConfirm();
  const { confirmDuplicate, isDuplicating } = useDuplicateTask();
  const { confirmArchive, confirmDelete: confirmBulkDelete } = useBulkTaskActions();
  const {
    filtered, search, setSearch, deadlineDate, setDeadlineDate, quickFilter, setQuickFilter,
    status, setStatus, priority, setPriority, projectFilter, setProjectFilter,
    hasActiveFilters, clearFilters,
  } = useTaskFilters(tasks);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [workloadPage, setWorkloadPage] = useState(0);
  const [workloadSort, setWorkloadSort] = useState<"most" | "fewest">("most");
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

  const statusCounts = useMemo(() => {
    const counts = { Pending: 0, "In-Progress": 0, Completed: 0, "Blocked/Stuck": 0 } as Record<TaskStatus, number>;
    tasks.forEach(task => { counts[task.status] += 1; });
    return counts;
  }, [tasks]);
  const completionPct = totalTasks > 0 ? Math.round((statusCounts.Completed / totalTasks) * 100) : 0;
  const donutSegments = useMemo(() => {
    return STATUSES.map((item, index) => {
      const pct = totalTasks > 0 ? (statusCounts[item] / totalTasks) * 100 : 0;
      const start = totalTasks > 0
        ? STATUSES.slice(0, index).reduce((sum, previous) => sum + (statusCounts[previous] / totalTasks) * 100, 0)
        : 0;
      return { color: STATUS_COLORS[item], start, end: start + pct };
    });
  }, [statusCounts, totalTasks]);

  const recentTasks = useMemo(() => [...filtered].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 6), [filtered]);

  const recentIds = useMemo(() => recentTasks.map(task => task.id), [recentTasks]);
  const selection = useRowSelection(recentIds);

  const viewingTask = tasks.find(task => task.id === viewingId) ?? null;
  const editingTask = tasks.find(task => task.id === editingId) ?? null;
  const sortedMemberCounts = useMemo(() => [...memberCounts].sort((left, right) => {
    const countDifference = workloadSort === "most" ? right.count - left.count : left.count - right.count;
    return countDifference || memberName(left.member).localeCompare(memberName(right.member));
  }), [memberCounts, workloadSort]);
  const workloadPageCount = Math.max(1, Math.ceil(memberCounts.length / WORKLOAD_PAGE_SIZE));
  const currentWorkloadPage = Math.min(workloadPage, workloadPageCount - 1);
  const paginatedMembers = sortedMemberCounts.slice(currentWorkloadPage * WORKLOAD_PAGE_SIZE, (currentWorkloadPage + 1) * WORKLOAD_PAGE_SIZE);
  const selectedMemberWorkload = memberCounts.find(({ member }) => member.id === selectedMemberId) ?? null;
  const selectedMemberTasks = selectedMemberWorkload
    ? tasks.filter(task => task.assignments.some(assignment => assignment.id === selectedMemberWorkload.member.id))
    : [];

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
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Completed Tasks</span><span className="etm-kpi-icon"><CheckCircle2 size={17} /></span></div>
          <span className="etm-kpi-value">{totalCompleted}</span>
        </div>
        <div className="etm-panel etm-kpi-card danger">
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Past Due Tasks</span><span className="etm-kpi-icon"><AlertTriangle size={17} /></span></div>
          <span className="etm-kpi-value">{totalPastDue}</span>
        </div>
      </div>

      <div className="etm-section">
        <div className="etm-section-heading"><div><h2>Insights</h2><p>Team workload and where tasks currently stand.</p></div></div>
        <div className="etm-charts-grid">
          <div className="etm-panel etm-chart-panel">
            <div className="etm-workload-heading"><h3 className="etm-chart-title">Team workload</h3><label>Sort<select value={workloadSort} onChange={event => { setWorkloadSort(event.target.value as "most" | "fewest"); setWorkloadPage(0); }}><option value="most">Most tasks</option><option value="fewest">Fewest tasks</option></select></label></div>
            {memberCounts.length ? <>
              <div className="etm-workload-list">
                {paginatedMembers.map(({ member, count }) => <button type="button" className="etm-member-row" key={member.id} onClick={() => setSelectedMemberId(member.id)} aria-label={`Open workload for ${memberName(member)}`}>
                  <span className="etm-member-row-avatar" aria-hidden="true">{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</span><span className="etm-member-row-name">{memberName(member)}{member.position && <small>{member.position}</small>}</span><span className="etm-member-row-count">{count} {count === 1 ? "task" : "tasks"}</span><ChevronRight className="etm-member-workload-chevron" size={16} />
                </button>)}
              </div>
              <div className="etm-workload-pagination"><button type="button" className="etm-button ghost small" onClick={() => setWorkloadPage(page => Math.max(0, page - 1))} disabled={currentWorkloadPage === 0}>Previous</button><span>Page {currentWorkloadPage + 1} of {workloadPageCount}</span><button type="button" className="etm-button ghost small" onClick={() => setWorkloadPage(page => Math.min(workloadPageCount - 1, page + 1))} disabled={currentWorkloadPage === workloadPageCount - 1}>Next</button></div>
            </> : <p className="etm-empty-row">No one has a task assigned yet.</p>}
          </div>
          <div className="etm-panel etm-chart-panel">
            <h3 className="etm-chart-title">Task progression</h3>
            <StatusDonut segments={donutSegments} centerPct={completionPct} centerLabel="Completed" />
            <div className="etm-donut-rows">
              {STATUSES.map(item => (
                <StatusRow key={item} label={item} count={statusCounts[item]} total={totalTasks} color={STATUS_COLORS[item]} />
              ))}
            </div>
          </div>
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
        <StatusChips value={status} onChange={setStatus} badges={{ Completed: unseenCompleted }} />
        <BulkActionBar
          count={selection.count}
          onArchive={() => void confirmArchive(selection.selectedIds).then(() => selection.clear())}
          onDelete={() => void confirmBulkDelete(selection.selectedIds).then(() => selection.clear())}
          onClear={selection.clear}
        />
        {recentTasks.length ? (
          <div className="etm-panel etm-table-wrap">
            <table className="etm-tasks-table etm-tasks-table-dashboard">
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
                  <th scope="col">Priority</th>
                  <th scope="col">Progress Log</th>
                  <th scope="col" className="etm-tasks-table-actions-col">Action Buttons</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map(task => {
                  const lastRemark = task.remarks[0];
                  return (
                    <tr key={task.id} className="etm-tasks-table-row-clickable" onClick={() => setViewingId(task.id)}>
                      <td className="etm-tasks-table-title-col">
                        <TaskTitleCell task={task} onOpen={() => setViewingId(task.id)}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${task.title}`}
                            checked={selection.isSelected(task.id)}
                            onChange={() => selection.toggle(task.id)}
                          />
                        </TaskTitleCell>
                      </td>
                      <td><div className="etm-task-cell-stack"><span>{formatDate(task.created_at)}</span>{task.deadline && <small>Due {formatDate(task.deadline)}</small>}</div></td>
                      <td><span className={`etm-priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</span></td>
                      <td>
                        <div className="etm-progresslog-cell">
                          <span className={`etm-badge ${statusSlug(task.status)}`}>{statusChipLabel(task)}</span>
                          {lastRemark ? (
                            <p className="etm-progresslog-remark">"{remarkPreview(lastRemark.message)}"<small>— {lastRemark.created_by_name ?? "Unknown"}</small></p>
                          ) : <small className="etm-progresslog-empty">No remarks yet.</small>}
                        </div>
                      </td>
                      <td onClick={event => event.stopPropagation()}><TaskRowActions task={task} onView={() => setViewingId(task.id)} onEdit={() => setEditingId(task.id)} onDelete={() => void confirmDelete(task)} onDuplicate={() => void confirmDuplicate(task)} duplicating={isDuplicating(task.id)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="etm-panel"><p className="etm-empty-row">{tasks.length ? "No tasks match your filters." : "No tasks yet — create your first one from Add Task."}</p></div>}
      </div>

      {viewingTask && <TaskDetails
        task={viewingTask}
        open
        onClose={() => setViewingId(null)}
        onEdit={() => { setEditingId(viewingTask.id); setViewingId(null); }}
        onDuplicate={() => void confirmDuplicate(viewingTask)}
        duplicating={isDuplicating(viewingTask.id)}
        onProgress={(message, status) => addProgress(viewingTask.id, message, status)}
        onEditProgress={(logId, message) => editProgress(viewingTask.id, logId, message)}
        onDeleteProgress={logId => deleteProgress(viewingTask.id, logId)}
        onAddRemark={(message, file) => addRemark(viewingTask.id, message, file)}
        onEditRemark={(remarkId, message) => editRemark(viewingTask.id, remarkId, message)}
        onDeleteRemark={remarkId => deleteRemark(viewingTask.id, remarkId)}
        onReactRemark={(remarkId, emoji) => reactToRemark(viewingTask.id, remarkId, emoji)}
        onAddRemarkReply={(remarkId, message) => addRemarkReply(viewingTask.id, remarkId, message)}
        onAddSubtaskRemark={(subtaskId, message, file) => addSubtaskRemark(viewingTask.id, subtaskId, message, file)}
        onEditSubtaskRemark={(subtaskId, remarkId, message) => editSubtaskRemark(viewingTask.id, subtaskId, remarkId, message)}
        onDeleteSubtaskRemark={(subtaskId, remarkId) => deleteSubtaskRemark(viewingTask.id, subtaskId, remarkId)}
        onReactSubtaskRemark={(subtaskId, remarkId, emoji) => reactToSubtaskRemark(viewingTask.id, subtaskId, remarkId, emoji)}
        onAddSubtaskRemarkReply={(subtaskId, remarkId, message) => addSubtaskRemarkReply(viewingTask.id, subtaskId, remarkId, message)}
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

      <Modal open={!!selectedMemberWorkload} onClose={() => setSelectedMemberId(null)} title={selectedMemberWorkload ? `${memberName(selectedMemberWorkload.member)} — Team Workload` : "Team Workload"}>
        {selectedMemberWorkload && <div className="etm-workload-dialog">
          <p>{selectedMemberTasks.length} assigned {selectedMemberTasks.length === 1 ? "task" : "tasks"}{selectedMemberWorkload.member.position ? ` · ${selectedMemberWorkload.member.position}` : ""}</p>
          <div className="etm-workload-dialog-tasks">
            {selectedMemberTasks.map(task => <button type="button" key={task.id} onClick={() => { setSelectedMemberId(null); navigate(`/etms/tasks/${task.id}`); }}><ClipboardList size={15} /><span>{task.title}<small>{task.status} · {task.project?.name ?? "Personal"}</small></span><ChevronRight size={15} /></button>)}
          </div>
        </div>}
      </Modal>

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
