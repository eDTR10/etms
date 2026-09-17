import { AlertTriangle, Search, UserX, X } from "lucide-react";
import { PRIORITIES, type Priority, type Project } from "./types";
import type { AssignedFilterValue, PriorityFilterValue, ProjectFilterValue, QuickDeadlineFilterValue } from "./useTaskFilters";

const QUICK_DEADLINE_FILTERS: { value: QuickDeadlineFilterValue; label: string }[] = [
  { value: "day", label: "This Day" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

interface TaskFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  deadlineDate: string;
  onDeadlineDateChange: (value: string) => void;
  quickFilter: QuickDeadlineFilterValue;
  onQuickFilterChange: (value: QuickDeadlineFilterValue) => void;
  priority: PriorityFilterValue;
  onPriorityChange: (value: PriorityFilterValue) => void;
  projectFilter: ProjectFilterValue;
  onProjectFilterChange: (value: ProjectFilterValue) => void;
  projects: Project[];
  assignedFilter: AssignedFilterValue;
  onAssignedFilterChange: (value: AssignedFilterValue) => void;
  overdueOnly: boolean;
  onOverdueOnlyChange: (value: boolean) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}

export default function TaskFilterBar({
  search, onSearchChange,
  deadlineDate, onDeadlineDateChange,
  quickFilter, onQuickFilterChange,
  priority, onPriorityChange,
  projectFilter, onProjectFilterChange,
  projects,
  assignedFilter, onAssignedFilterChange,
  overdueOnly, onOverdueOnlyChange,
  hasActiveFilters, onClear,
}: TaskFilterBarProps) {
  return (
    <div className="etm-filter-bar">
      <div className="etm-filter-search">
        <Search size={15} />
        <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search by task or assignee…" aria-label="Search tasks by title or assignee" />
      </div>
      <select className="etm-filter-select" value={priority} onChange={event => onPriorityChange(event.target.value as PriorityFilterValue)} aria-label="Filter by priority">
        <option value="all">All Priorities</option>
        {PRIORITIES.map((item: Priority) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select
        className="etm-filter-select"
        value={String(projectFilter)}
        onChange={event => {
          const value = event.target.value;
          onProjectFilterChange(value === "all" || value === "personal" ? value : Number(value));
        }}
        aria-label="Filter by project"
      >
        <option value="all">All Projects</option>
        <option value="personal">Personal</option>
        {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <div className="etm-filter-dates">
        <label className="etm-filter-date-field">
          <span>Deadline date</span>
          <input type="date" value={deadlineDate} onChange={event => onDeadlineDateChange(event.target.value)} aria-label="Deadline date" />
        </label>
        <div className="etm-filter-quick-dates" role="group" aria-label="Quick deadline filters">
          {QUICK_DEADLINE_FILTERS.map(item => (
            <button
              key={item.value}
              type="button"
              className={`etm-button ghost small etm-filter-quick-date ${quickFilter === item.value ? "active" : ""}`}
              onClick={() => onQuickFilterChange(item.value)}
              aria-pressed={quickFilter === item.value}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className={`etm-button ghost small etm-filter-quick-date ${assignedFilter === "unassigned" ? "active" : ""}`} aria-pressed={assignedFilter === "unassigned"} onClick={() => onAssignedFilterChange(assignedFilter === "unassigned" ? "all" : "unassigned")}><UserX size={13} />Unassigned</button>
      <button type="button" className={`etm-button ghost small etm-filter-quick-date ${overdueOnly ? "active" : ""}`} aria-pressed={overdueOnly} onClick={() => onOverdueOnlyChange(!overdueOnly)}><AlertTriangle size={13} />Overdue</button>
      {hasActiveFilters && <button type="button" className="etm-button ghost small etm-filter-clear" onClick={onClear}><X size={13} />Clear</button>}
    </div>
  );
}
