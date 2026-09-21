import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { ChevronLeft, ChevronRight, Repeat, Search, User, X } from "lucide-react";
import { useTasks } from "../../features/tasks/taskContext";
import { taskError } from "../../features/tasks/taskService";
import type { PriorityFilterValue, ProjectFilterValue } from "../../features/tasks/useTaskFilters";
import { formatDate, memberName, PRIORITIES, statusChipLabel, statusSlug, type Priority, type Task } from "../../features/tasks/types";
import { describeRecurrence, getOccurrenceDates, isRepeating } from "../../features/tasks/recurrence";

const PRIORITY_LEGEND: Priority[] = ["Low", "Medium", "High"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthMatrix(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const cells: Date[] = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push(new Date(year, month, -i));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return cells;
}

interface CalendarProps {
  // Lets the admin calendar link into /etms/admin/tasks and show whose task each entry is.
  basePath?: string;
  showOwner?: boolean;
}

export default function Calendar({ basePath = "/etms/tasks", showOwner = false }: CalendarProps) {
  const { tasks, projects, toggleOccurrence } = useTasks();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<PriorityFilterValue>("all");
  const [projectFilter, setProjectFilter] = useState<ProjectFilterValue>("all");
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const hasActiveFilters = !!search.trim() || priority !== "all" || projectFilter !== "all";
  const clearFilters = () => { setSearch(""); setPriority("all"); setProjectFilter("all"); };

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      const matchesTitle = task.title.toLowerCase().includes(query);
      const matchesAssignee = task.assignments.some(person => memberName(person).toLowerCase().includes(query));
      if (!matchesTitle && !matchesAssignee) return false;
    }
    if (priority !== "all" && task.priority !== priority) return false;
    if (projectFilter === "personal") {
      if (task.project) return false;
    } else if (projectFilter !== "all") {
      if (!task.project || task.project.id !== projectFilter) return false;
    }
    return true;
  }), [tasks, search, priority, projectFilter]);

  const cells = useMemo(() => monthMatrix(viewDate), [viewDate]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    if (!cells.length) return map;
    const rangeStart = cells[0];
    const rangeEnd = cells[cells.length - 1];
    for (const task of filteredTasks) {
      for (const dateKey of getOccurrenceDates(task, rangeStart, rangeEnd)) {
        const bucket = map.get(dateKey);
        if (bucket) bucket.push(task);
        else map.set(dateKey, [task]);
      }
    }
    return map;
  }, [filteredTasks, cells]);

  const todayKey = toDateKey(new Date());
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function isOccurrenceCompleted(task: Task, dateKey: string): boolean {
    return isRepeating(task.recurrence)
      ? task.occurrence_completions.some(occurrence => occurrence.date === dateKey && occurrence.is_completed)
      : task.is_completed;
  }

  async function handleToggleOccurrence(task: Task, dateKey: string) {
    try {
      await toggleOccurrence(task.id, dateKey);
    } catch (err) {
      void Swal.fire({ title: "Couldn't update this occurrence", text: taskError(err), icon: "error" });
    }
  }

  function goToMonth(offset: number) {
    setViewDate(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }
  function goToday() {
    setViewDate(new Date());
  }
  function openTask(taskId: number) {
    navigate(`${basePath}/${taskId}`);
  }

  const selectedTasks = selectedDate ? (tasksByDate.get(selectedDate) ?? []) : [];
  const selectedDateLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "";

  return (
    <div>
      <div className="etm-filter-bar">
        <div className="etm-filter-search">
          <Search size={15} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by task or assignee…" aria-label="Search tasks by title or assignee" />
        </div>
        <select className="etm-filter-select" value={priority} onChange={event => setPriority(event.target.value as PriorityFilterValue)} aria-label="Filter by priority">
          <option value="all">All Priorities</option>
          {PRIORITIES.map((item: Priority) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select
          className="etm-filter-select"
          value={String(projectFilter)}
          onChange={event => {
            const value = event.target.value;
            setProjectFilter(value === "all" || value === "personal" ? value : Number(value));
          }}
          aria-label="Filter by project"
        >
          <option value="all">All Projects</option>
          <option value="personal">Personal</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        {hasActiveFilters && <button type="button" className="etm-button ghost small etm-filter-clear" onClick={clearFilters}><X size={13} />Clear</button>}
      </div>

      <div className="etm-panel etm-calendar-panel">
        <div className="etm-calendar-header">
          <button type="button" className="etm-button ghost small" onClick={goToday}>Today</button>
          <button type="button" className="etm-calendar-nav-button" aria-label="Previous month" onClick={() => goToMonth(-1)}><ChevronLeft size={16} /></button>
          <button type="button" className="etm-calendar-nav-button" aria-label="Next month" onClick={() => goToMonth(1)}><ChevronRight size={16} /></button>
          <h2>{monthLabel}</h2>
        </div>
        <div className="etm-calendar-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
        <div className="etm-calendar-grid">
          {cells.map(date => {
            const key = toDateKey(date);
            const inMonth = date.getMonth() === viewDate.getMonth();
            const dueTasks = tasksByDate.get(key) ?? [];
            return (
              <div
                key={key}
                className={`etm-calendar-day ${inMonth ? "" : "outside"} ${key === selectedDate ? "selected" : ""}`}
                onClick={() => setSelectedDate(current => (current === key ? null : key))}
              >
                <span className={`etm-calendar-day-number ${key === todayKey ? "today" : ""}`}>{date.getDate()}</span>
                {dueTasks.length > 0 && (
                  <div className="etm-calendar-day-chips">
                    {dueTasks.map(task => {
                      const repeating = isRepeating(task.recurrence);
                      const completed = isOccurrenceCompleted(task, key);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          className={`etm-calendar-chip ${task.priority.toLowerCase()} ${completed ? "completed" : ""}`}
                          title={repeating ? `${task.title} — ${describeRecurrence(task)}` : task.title}
                          onClick={event => { event.stopPropagation(); openTask(task.id); }}
                        >
                          {repeating && <Repeat size={10} className="etm-calendar-chip-repeat-icon" aria-hidden="true" />}
                          {task.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="etm-calendar-legend">
          <span className="etm-calendar-legend-label">Priority:</span>
          {PRIORITY_LEGEND.map(item => (
            <span key={item} className="etm-calendar-legend-item">
              <span className={`etm-calendar-legend-swatch ${item.toLowerCase()}`} />
              {item}
            </span>
          ))}
        </div>
      </div>

      {selectedDate && (
        <div className="etm-panel etm-calendar-daylist">
          <div className="etm-calendar-daylist-header">
            <h3>Tasks due {selectedDateLabel}</h3>
            <button type="button" className="etm-icon-button" aria-label="Close" onClick={() => setSelectedDate(null)}><X size={15} /></button>
          </div>
          {selectedTasks.length === 0 ? (
            <p className="etm-calendar-daylist-empty">No tasks due on this date.</p>
          ) : (
            <ul className="etm-calendar-daylist-items">
              {selectedTasks.map(task => {
                const assigneeLabel = task.assignments.length
                  ? task.assignments.map(memberName).join(", ")
                  : "Unassigned";
                const repeating = isRepeating(task.recurrence);
                const completed = isOccurrenceCompleted(task, selectedDate);
                return (
                  <li key={task.id} className={`etm-calendar-daylist-item ${completed ? "completed" : ""}`} onClick={() => openTask(task.id)}>
                    {repeating && (
                      <input
                        type="checkbox"
                        className="etm-calendar-occurrence-toggle"
                        checked={completed}
                        aria-label={`Mark ${task.title} done for ${selectedDateLabel}`}
                        onClick={event => event.stopPropagation()}
                        onChange={() => void handleToggleOccurrence(task, selectedDate)}
                      />
                    )}
                    <span className={`etm-priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</span>
                    <span className="etm-calendar-daylist-title">{task.title}</span>
                    {repeating && <span className="etm-calendar-daylist-recurrence" title={describeRecurrence(task)}><Repeat size={11} />{describeRecurrence(task)}</span>}
                    {showOwner && <span className="etm-calendar-daylist-assignee" title="Created by"><User size={12} />By {task.created_by_name || "Unknown"}</span>}
                    <span className="etm-calendar-daylist-assignee" title={assigneeLabel}><User size={12} />{assigneeLabel}</span>
                    <span className={`etm-badge ${statusSlug(task.status)}`}>{statusChipLabel(task)}</span>
                    <span className="etm-calendar-daylist-date">{formatDate(selectedDate)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
