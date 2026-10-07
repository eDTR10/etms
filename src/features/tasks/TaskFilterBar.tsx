import { AlertTriangle, Search, UserX, X } from "lucide-react";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { PRIORITIES, type Member, type Priority, type Project } from "./types";
import type { AssignedFilterValue, PriorityFilterValue, ProjectFilterValue, QuickDeadlineFilterValue } from "./useTaskFilters";

const QUICK_DEADLINE_FILTERS: { value: QuickDeadlineFilterValue; label: string }[] = [
  { value: "day", label: "This Day" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

type ProjectOption = SelectOption<ProjectFilterValue>;
type PriorityOption = SelectOption<PriorityFilterValue>;

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
  // Optional: filter by the office / project of the people the tasks are assigned to.
  people?: { members: Member[]; office: number | null; onOfficeChange: (value: number | null) => void; project: number | null; onProjectChange: (value: number | null) => void };
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
  people,
  hasActiveFilters, onClear,
}: TaskFilterBarProps) {
  const priorityOptions: PriorityOption[] = [
    { value: "all", label: "All Priorities" },
    ...PRIORITIES.map((item: Priority) => ({ value: item, label: item })),
  ];
  const selectedPriorityOption = priorityOptions.find(option => option.value === priority) ?? priorityOptions[0];
  const projectOptions: ProjectOption[] = [
    { value: "all", label: "All Projects" },
    { value: "personal", label: "Personal" },
    ...projects.map(project => ({ value: project.id, label: project.name })),
  ];
  const selectedProjectOption = projectOptions.find(option => option.value === projectFilter) ?? projectOptions[0];
  // The office / project lists only offer entries somebody actually belongs to, so no option leads to an empty result.
  const officeIds = new Set((people?.members ?? []).map(member => member.office).filter((id): id is number => typeof id === "number"));
  const projectIds = new Set((people?.members ?? []).flatMap(member => member.projects ?? []));
  const officeOptions: SelectOption<number | null>[] = [{ value: null, label: "All offices" }, ...projects.filter(project => officeIds.has(project.id)).map(project => ({ value: project.id, label: project.name }))];
  const personProjectOptions: SelectOption<number | null>[] = [{ value: null, label: "All employee projects" }, ...projects.filter(project => projectIds.has(project.id)).map(project => ({ value: project.id, label: project.name }))];
  return (
    <div className="etm-filter-bar">
      <div className="etm-filter-search">
        <Search size={15} />
        <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search by task or assignee…" aria-label="Search tasks by title or assignee" />
      </div>
      <div className="etm-filter-field" style={{ flexBasis: 160, minWidth: 140 }}>
        <ThemedSelect<PriorityOption>
          aria-label="Filter by priority"
          classNamePrefix="etm-priority-select"
          options={priorityOptions}
          value={selectedPriorityOption}
          onChange={option => onPriorityChange(option ? option.value : "all")}
        />
      </div>
      <div className="etm-filter-field" style={{ flexBasis: 200, minWidth: 160 }}>
        <ThemedSelect<ProjectOption>
          aria-label="Filter by project"
          classNamePrefix="etm-project-select"
          options={projectOptions}
          value={selectedProjectOption}
          onChange={option => onProjectFilterChange(option ? option.value : "all")}
          isSearchable
        />
      </div>
      {people && <>
        <div className="etm-filter-field" style={{ flexBasis: 200, minWidth: 160 }}>
          <ThemedSelect<SelectOption<number | null>>
            aria-label="Filter assigned persons by office"
            classNamePrefix="etm-person-office-select"
            options={officeOptions}
            value={officeOptions.find(option => option.value === people.office) ?? officeOptions[0]}
            onChange={option => people.onOfficeChange(option ? option.value : null)}
            isSearchable
          />
        </div>
        <div className="etm-filter-field" style={{ flexBasis: 220, minWidth: 170 }}>
          <ThemedSelect<SelectOption<number | null>>
            aria-label="Filter assigned persons by project"
            classNamePrefix="etm-person-project-select"
            options={personProjectOptions}
            value={personProjectOptions.find(option => option.value === people.project) ?? personProjectOptions[0]}
            onChange={option => people.onProjectChange(option ? option.value : null)}
            isSearchable
          />
        </div>
      </>}
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
