import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Ban, CheckCircle2, ChevronRight, ClipboardList, Clock, Hourglass, User, UserCheck, UserX } from "lucide-react";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { useTasks } from "../../features/tasks/taskContext";
import { useAuth } from "../Auth/AuthContext";
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
import { SortTh, useTableSort } from "../../features/tasks/useTableSort";
import { dueSoonLabel, formatDate, isDueSoon, isOverdue, memberName, remarkPreview, statusChipLabel, statusSlug, STATUSES, type TaskStatus } from "../../features/tasks/types";
import Modal from "../../components/ui/modal";

interface DashboardOverviewProps {
  onViewMajorTasks: () => void;
  // Lets an admin-mode instance of this same dashboard link within /etms/admin/tasks
  // instead of the regular user's /etms/tasks.
  basePath?: string;
  // Personal-account view: adds the "My Total Tasks" and "Task Assigned" cards.
  userView?: boolean;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  Pending: "#c18a31",
  "In-Progress": "#5484bd",
  Completed: "#3e9276",
  "Blocked/Stuck": "#c0605a",
};

const WORKLOAD_PAGE_SIZE = 5;
const WORKLOAD_SORT_OPTIONS: SelectOption<"most" | "fewest">[] = [
  { value: "most", label: "Most tasks" },
  { value: "fewest", label: "Fewest tasks" },
];

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

export default function Dashboard({ onViewMajorTasks, basePath = "/etms/tasks", userView = false }: DashboardOverviewProps) {
  const { user } = useAuth();
  const {
    tasks, officeScope, members, projects, updateTask,
    addProgress, editProgress, deleteProgress,
    addRemark, editRemark, deleteRemark, reactToRemark, addRemarkReply,
    addSubtaskRemark, editSubtaskRemark, deleteSubtaskRemark, reactToSubtaskRemark, addSubtaskRemarkReply, setSubtaskStatus, addSubtask, editSubtask, deleteSubtask, setSubtaskCompletion, reorderSubtasks, assignSubtask, linkSubtaskDocument, unlinkSubtaskDocument, completeTask, turnoverTask,
    addRemarkAttachment, deleteRemarkAttachment, addSubtaskRemarkAttachment, deleteSubtaskRemarkAttachment, markCompletionSeen, markViewed,
  } = useTasks();
  const confirmDelete = useDeleteTaskConfirm();
  const { confirmDuplicate, isDuplicating } = useDuplicateTask(basePath);
  const { confirmArchive, confirmDelete: confirmBulkDelete } = useBulkTaskActions();
  const {
    filtered, search, setSearch, deadlineDate, setDeadlineDate, quickFilter, setQuickFilter,
    status, setStatus, priority, setPriority, projectFilter, setProjectFilter,
    assignedFilter, setAssignedFilter, overdueOnly, setOverdueOnly,
    dueSoonOnly, setDueSoonOnly, ownership, setOwnership, hasActiveFilters, clearFilters,
  } = useTaskFilters(tasks, { initialStatus: "Pending", userId: user?.id });
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [workloadPage, setWorkloadPage] = useState(0);
  const [memberTaskPage, setMemberTaskPage] = useState(0);
  const [workloadSort, setWorkloadSort] = useState<"most" | "fewest">("most");
  const navigate = useNavigate();
  const recentSectionRef = useRef<HTMLDivElement>(null);

  // Card taps filter the "Recently added tasks" table and smoothly scroll down to it.
  const filterRecent = (kind: "unassigned" | "completed" | "overdue" | "pending" | "dueSoon" | "blocked" | "mine" | "assigned") => {
    clearFilters();
    if (kind === "unassigned") setAssignedFilter("unassigned");
    else if (kind === "completed") setStatus("Completed");
    else if (kind === "pending") setStatus("Pending");
    else if (kind === "blocked") setStatus("Blocked/Stuck");
    else if (kind === "mine") { setOwnership("mine"); setStatus("all"); }
    else if (kind === "assigned") { setOwnership("assigned"); setStatus("all"); }
    else if (kind === "dueSoon") setDueSoonOnly(true);
    else setOverdueOnly(true);
    recentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const activeKpi = ownership !== "all" ? ownership : dueSoonOnly ? "dueSoon" : overdueOnly ? "overdue" : assignedFilter === "unassigned" ? "unassigned" : status === "Completed" ? "completed" : status === "Pending" ? "pending" : status === "Blocked/Stuck" ? "blocked" : null;

  const totalTasks = tasks.length;
  const totalUnassigned = useMemo(() => tasks.filter(task => task.assignments.length === 0).length, [tasks]);
  const totalCompleted = useMemo(() => tasks.filter(task => task.status === "Completed").length, [tasks]);
  const totalPending = useMemo(() => tasks.filter(task => task.status === "Pending").length, [tasks]);
  const totalMine = useMemo(() => tasks.filter(task => task.is_creator).length, [tasks]);
  // Includes tasks you assigned to yourself.
  const totalAssignedToMe = useMemo(() => tasks.filter(task => task.assignments.some(person => person.id === user?.id)).length, [tasks, user?.id]);
  const totalBlocked = useMemo(() => tasks.filter(task => task.status === "Blocked/Stuck").length, [tasks]);
  const totalDueSoon = useMemo(() => tasks.filter(isDueSoon).length, [tasks]);
  const totalPastDue = useMemo(() => tasks.filter(isOverdue).length, [tasks]);
  const unseenCompleted = useMemo(() => tasks.filter(task => task.is_creator && task.status === "Completed" && !task.completion_seen).length, [tasks]);

  // Access-level-2: the workload covers everyone in the user's office and all of their tasks, not just the ones shared with them.
  // A Regular Employee only ever sees their own tasks in the workload; officers see their office / project.
  const isRegularEmployee = !officeScope.enabled && !(user?.etms_roles ?? []).some(role => role !== "regular_employee") && !user?.is_staff && user?.role !== "admin";
  // Who handed the signed-in user work: shown on their own workload row so they know where it came from.
  const assignedToMeByOthers = useMemo(() => tasks.filter(task => !task.is_creator && task.assignments.some(person => person.id === user?.id)), [tasks, user?.id]);
  const assignersToMe = useMemo(() => [...new Set(assignedToMeByOthers.map(task => task.created_by_name).filter((name): name is string => !!name))], [assignedToMeByOthers]);
  const workloadMembers = officeScope.enabled ? officeScope.members : isRegularEmployee ? members.filter(member => member.id === user?.id) : members;
  const workloadTasks = useMemo(() => officeScope.enabled
    ? [...new Map([...tasks, ...officeScope.tasks].map(task => [task.id, task])).values()]
    : tasks, [tasks, officeScope]);
  const memberCounts = useMemo(() => workloadMembers
    .map(member => {
      // Same rule as the dialog that opens from the row: tasks the person owns or is assigned to.
      const assigned = workloadTasks.filter(task => task.created_by === member.id || task.assignments.some(a => a.id === member.id));
      return { member, count: assigned.length, dueSoon: assigned.filter(isDueSoon).length };
    })
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count), [workloadMembers, workloadTasks]);

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

  const { sorted: sortedRecent, sort, toggle: toggleSort } = useTableSort(recentTasks, {
    title: task => task.title,
    date: task => new Date(task.created_at).getTime(),
    priority: task => ({ Low: 1, Medium: 2, High: 3 })[task.priority],
    progress: task => task.status,
  });
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
    ? workloadTasks.filter(task => task.created_by === selectedMemberWorkload.member.id || task.assignments.some(assignment => assignment.id === selectedMemberWorkload.member.id))
    : [];
  const MEMBER_TASKS_PAGE = 5;
  const memberTaskPages = Math.max(1, Math.ceil(selectedMemberTasks.length / MEMBER_TASKS_PAGE));
  const currentMemberPage = Math.min(memberTaskPage, memberTaskPages - 1);
  const pagedMemberTasks = selectedMemberTasks.slice(currentMemberPage * MEMBER_TASKS_PAGE, (currentMemberPage + 1) * MEMBER_TASKS_PAGE);

  return (
    <div>
      <div className="etm-kpi-grid etm-kpi-grid-six">
        <button type="button" className="etm-panel etm-kpi-card etm-kpi-card-button" onClick={() => navigate(basePath)}>
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Total Tasks</span><span className="etm-kpi-icon"><ClipboardList size={17} /></span></div>
          <span className="etm-kpi-value">{totalTasks}</span>
        </button>
        {userView && <>
          <button type="button" className={`etm-panel etm-kpi-card etm-kpi-card-button${activeKpi === "mine" ? " selected" : ""}`} onClick={() => filterRecent("mine")}>
            <div className="etm-kpi-card-top"><span className="etm-kpi-label">My Total Tasks</span><span className="etm-kpi-icon"><User size={17} /></span></div>
            <span className="etm-kpi-value">{totalMine}</span>
          </button>
          <button type="button" className={`etm-panel etm-kpi-card etm-kpi-card-button${activeKpi === "assigned" ? " selected" : ""}`} onClick={() => filterRecent("assigned")}>
            <div className="etm-kpi-card-top"><span className="etm-kpi-label">Task Assigned</span><span className="etm-kpi-icon"><UserCheck size={17} /></span></div>
            <span className="etm-kpi-value">{totalAssignedToMe}</span>
          </button>
        </>}
        <button type="button" className={`etm-panel etm-kpi-card etm-kpi-card-button warn${activeKpi === "pending" ? " selected" : ""}`} onClick={() => filterRecent("pending")}>
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Pending Tasks</span><span className="etm-kpi-icon"><Hourglass size={17} /></span></div>
          <span className="etm-kpi-value">{totalPending}</span>
        </button>
        <button type="button" className={`etm-panel etm-kpi-card etm-kpi-card-button danger${activeKpi === "dueSoon" ? " selected" : ""}${totalDueSoon > 0 ? " due-soon" : ""}`} onClick={() => filterRecent("dueSoon")}>
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Almost Due Date</span><span className="etm-kpi-icon"><Clock size={17} /></span></div>
          <span className="etm-kpi-value">{totalDueSoon}</span>
        </button>
        {!userView && <button type="button" className={`etm-panel etm-kpi-card etm-kpi-card-button warn${activeKpi === "unassigned" ? " selected" : ""}`} onClick={() => filterRecent("unassigned")}>
            <div className="etm-kpi-card-top"><span className="etm-kpi-label">Unassigned Tasks</span><span className="etm-kpi-icon"><UserX size={17} /></span></div>
            <span className="etm-kpi-value">{totalUnassigned}</span>
          </button>}
        <button type="button" className={`etm-panel etm-kpi-card etm-kpi-card-button success${activeKpi === "completed" ? " selected" : ""}`} onClick={() => filterRecent("completed")}>
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Completed Tasks</span><span className="etm-kpi-icon"><CheckCircle2 size={17} /></span></div>
          <span className="etm-kpi-value">{totalCompleted}</span>
        </button>
        <button type="button" className={`etm-panel etm-kpi-card etm-kpi-card-button danger${activeKpi === "overdue" ? " selected" : ""}`} onClick={() => filterRecent("overdue")}>
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Past Due Tasks</span><span className="etm-kpi-icon"><AlertTriangle size={17} /></span></div>
          <span className="etm-kpi-value">{totalPastDue}</span>
        </button>
        <button type="button" className={`etm-panel etm-kpi-card etm-kpi-card-button danger${activeKpi === "blocked" ? " selected" : ""}`} onClick={() => filterRecent("blocked")}>
          <div className="etm-kpi-card-top"><span className="etm-kpi-label">Blocked Tasks</span><span className="etm-kpi-icon"><Ban size={17} /></span></div>
          <span className="etm-kpi-value">{totalBlocked}</span>
        </button>
      </div>

      <div className="etm-section">
        <div className="etm-section-heading"><div><h2>Insights</h2><p>Team workload and where tasks currently stand.</p></div></div>
        <div className="etm-charts-grid">
          <div className="etm-panel etm-chart-panel">
            <div className="etm-workload-heading"><h3 className="etm-chart-title">Team workload{officeScope.enabled && officeScope.office_name ? ` · ${officeScope.office_name}` : ""}</h3><label>Sort<div style={{ width: 130 }}><ThemedSelect<SelectOption<"most" | "fewest">> size="small" classNamePrefix="etm-sort-select" aria-label="Sort team workload" options={WORKLOAD_SORT_OPTIONS} value={WORKLOAD_SORT_OPTIONS.find(option => option.value === workloadSort)} onChange={option => { setWorkloadSort(option?.value ?? "most"); setWorkloadPage(0); }} /></div></label></div>
            {memberCounts.length ? <>
              <div className="etm-workload-list">
                {paginatedMembers.map(({ member, count, dueSoon }) => <button type="button" className="etm-member-row" key={member.id} onClick={() => setSelectedMemberId(member.id)} aria-label={`Open workload for ${memberName(member)}`}>
                  <span className="etm-member-row-avatar" aria-hidden="true">{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</span><span className="etm-member-row-name">{memberName(member)}{member.position && <small>{member.position}</small>}{member.id === user?.id && assignersToMe.length > 0 && <small className="etm-assigned-by-note">{assignersToMe.join(", ")} assigned task{assignedToMeByOthers.length === 1 ? "" : "s"} to you</small>}</span>{dueSoon > 0 && <span className="etm-due-soon-badge">{dueSoon} due soon</span>}<span className="etm-member-row-count">{count} {count === 1 ? "task" : "tasks"}</span><ChevronRight className="etm-member-workload-chevron" size={16} />
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

      <div className="etm-section" ref={recentSectionRef} style={{ scrollMarginTop: 16 }}>
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
          assignedFilter={assignedFilter}
          onAssignedFilterChange={setAssignedFilter}
          overdueOnly={overdueOnly}
          onOverdueOnlyChange={setOverdueOnly}
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
                  <SortTh sortKey="title" sort={sort} onSort={toggleSort} className="etm-tasks-table-title-col" leading={
                    <input
                      type="checkbox"
                      aria-label="Select all tasks"
                      checked={selection.isAllSelected}
                      ref={el => { if (el) el.indeterminate = selection.isSomeSelected; }}
                      onChange={selection.toggleAll}
                    />
                  }>Task Title</SortTh>
                  <SortTh sortKey="date" sort={sort} onSort={toggleSort}>Date</SortTh>
                  <SortTh sortKey="priority" sort={sort} onSort={toggleSort}>Priority</SortTh>
                  <SortTh sortKey="progress" sort={sort} onSort={toggleSort}>Progress Log</SortTh>
                  <th scope="col" className="etm-tasks-table-actions-col">Action Buttons</th>
                </tr>
              </thead>
              <tbody>
                {sortedRecent.map(task => {
                  const lastRemark = task.remarks[0];
                  return (
                    <tr key={task.id} className="etm-tasks-table-row-clickable" onClick={() => navigate(`${basePath}/${task.id}`)}>
                      <td className="etm-tasks-table-title-col">
                        <TaskTitleCell task={task} onOpen={() => navigate(`${basePath}/${task.id}`)}>
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
                      <td onClick={event => event.stopPropagation()}><TaskRowActions task={task} onView={() => navigate(`${basePath}/${task.id}`)} onEdit={() => setEditingId(task.id)} onDelete={() => void confirmDelete(task)} onDuplicate={() => void confirmDuplicate(task)} duplicating={isDuplicating(task.id)} /></td>
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
        onAddSubtask={(title, description, parentId) => addSubtask(viewingTask.id, title, description, parentId)}
        onEditSubtask={(subtaskId, input) => editSubtask(viewingTask.id, subtaskId, input)}
        onDeleteSubtask={subtaskId => deleteSubtask(viewingTask.id, subtaskId)}
        onSetSubtaskCompletion={(subtaskId, isCompleted) => setSubtaskCompletion(viewingTask.id, subtaskId, isCompleted)}
        onReorderSubtasks={(parentId, order) => reorderSubtasks(viewingTask.id, parentId, order)}
        onAssignSubtask={(subtaskId, userId) => assignSubtask(viewingTask.id, subtaskId, userId)}
        onLinkSubtaskDocument={(subtaskId, tracknumber) => linkSubtaskDocument(viewingTask.id, subtaskId, tracknumber)}
        onUnlinkSubtaskDocument={subtaskId => unlinkSubtaskDocument(viewingTask.id, subtaskId)}
        onComplete={() => completeTask(viewingTask.id)}
        onTurnover={(userId, note) => turnoverTask(viewingTask.id, userId, note)}
        assignableMembers={members}
        onAddRemarkAttachment={(remarkId, file) => addRemarkAttachment(viewingTask.id, remarkId, file)}
        onDeleteRemarkAttachment={(remarkId, attachmentId) => deleteRemarkAttachment(viewingTask.id, remarkId, attachmentId)}
        onAddSubtaskRemarkAttachment={(subtaskId, remarkId, file) => addSubtaskRemarkAttachment(viewingTask.id, subtaskId, remarkId, file)}
        onDeleteSubtaskRemarkAttachment={(subtaskId, remarkId, attachmentId) => deleteSubtaskRemarkAttachment(viewingTask.id, subtaskId, remarkId, attachmentId)}
        onMarkCompletionSeen={() => markCompletionSeen(viewingTask.id)}
        onMarkViewed={() => markViewed(viewingTask.id)}
      />}

      <Modal open={!!selectedMemberWorkload} onClose={() => { setSelectedMemberId(null); setMemberTaskPage(0); }} title={selectedMemberWorkload ? `${memberName(selectedMemberWorkload.member)} — Team Workload` : "Team Workload"}>
        {selectedMemberWorkload && <div className="etm-workload-dialog">
          <p>{selectedMemberTasks.length} {selectedMemberTasks.length === 1 ? "task" : "tasks"} owned by or assigned to {memberName(selectedMemberWorkload.member)}{selectedMemberWorkload.member.position ? ` · ${selectedMemberWorkload.member.position}` : ""}</p>
          <div className="etm-workload-dialog-tasks">
            {pagedMemberTasks.map(task => <button type="button" key={task.id} onClick={() => { setSelectedMemberId(null); setMemberTaskPage(0); navigate(`${basePath}/${task.id}`); }}><ClipboardList size={15} /><span>{task.title}<small>{task.created_by === selectedMemberWorkload.member.id ? "Owner" : task.created_by_name ? `Assigned by ${task.created_by_name}` : "Assigned"} · {task.status} · {task.project?.name ?? "Personal"}{isDueSoon(task) && <> · <b className="etm-due-soon-text">{dueSoonLabel(task)}</b></>}</small></span><ChevronRight size={15} /></button>)}
          </div>
          {memberTaskPages > 1 && <div className="etm-workload-dialog-pager">
            <button type="button" disabled={currentMemberPage === 0} onClick={() => setMemberTaskPage(currentMemberPage - 1)}>Previous</button>
            <span>Page {currentMemberPage + 1} of {memberTaskPages}</span>
            <button type="button" disabled={currentMemberPage >= memberTaskPages - 1} onClick={() => setMemberTaskPage(currentMemberPage + 1)}>Next</button>
          </div>}
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
