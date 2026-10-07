import { useEffect, useMemo, useState } from "react";
import { DUE_SOON_DAYS, daysUntilDue, isDueSoon, isOverdue, memberName, type Member, type Priority, type Task, type TaskStatus } from "./types";

export type StatusFilterValue = "all" | TaskStatus;
export type PriorityFilterValue = "all" | Priority;
export type ProjectFilterValue = "all" | "personal" | number;
export type QuickDeadlineFilterValue = "" | "day" | "week" | "month";
export type AssignedFilterValue = "all" | "unassigned";
// "mine" = tasks I created; "assigned" = tasks someone else created that I was assigned to.
export type DeadlineBucketValue = "" | "upcoming" | "none";
export type OwnershipFilterValue = "all" | "mine" | "assigned";

export interface TaskFilterOptions {
  initialStatus?: StatusFilterValue;
  initialAssignedFilter?: AssignedFilterValue;
  initialOverdueOnly?: boolean;
  // Needed for the ownership filter to tell which assignments are the current user's.
  userId?: number;
  // Completed tasks are hidden under the "All" chip and only appear via the Completed filter,
  // except where the whole list is already archived tasks.
  showCompletedInAll?: boolean;
  // Needed for the "assigned persons" office / project filters: who belongs to which.
  members?: Member[];
  // When set, the filter state survives leaving and re-entering the screen (e.g. open a task,
  // press Back) — kept in memory per key, so a page reload still starts fresh.
  persistKey?: string;
  // Skip any saved state and use the initial* values (e.g. arriving via a Dashboard card link).
  ignoreSaved?: boolean;
}

interface SavedFilters {
  search: string; deadlineDate: string; quickFilter: QuickDeadlineFilterValue; status: StatusFilterValue; priority: PriorityFilterValue;
  projectFilter: ProjectFilterValue; assignedFilter: AssignedFilterValue; overdueOnly: boolean; dueSoonOnly: boolean; ownership: OwnershipFilterValue;
  personOffice: number | null; personProject: number | null;
  deadlineBucket?: DeadlineBucketValue; includeCompleted?: boolean;
}
const savedFilters = new Map<string, SavedFilters>();
const storageKey = (key: string) => `etm.filters.${key}`;
// Memory first (instant, survives navigation), then localStorage (survives a page reload).
function loadSavedFilters(key: string): SavedFilters | undefined {
  const inMemory = savedFilters.get(key);
  if (inMemory) return inMemory;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    return raw ? JSON.parse(raw) as SavedFilters : undefined;
  } catch {
    return undefined;
  }
}
function storeFilters(key: string, value: SavedFilters) {
  savedFilters.set(key, value);
  try { window.localStorage.setItem(storageKey(key), JSON.stringify(value)); } catch { /* storage unavailable — memory copy still works */ }
}

function toDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function quickFilterRange(value: QuickDeadlineFilterValue): { from: string; to: string } | null {
  if (!value) return null;
  const now = new Date();
  if (value === "day") {
    const today = toDateStr(now);
    return { from: today, to: today };
  }
  if (value === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: toDateStr(start), to: toDateStr(end) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toDateStr(start), to: toDateStr(end) };
}

export function useTaskFilters(tasks: Task[], options?: TaskFilterOptions) {
  const [saved] = useState(() => options?.persistKey && !options.ignoreSaved ? loadSavedFilters(options.persistKey) : undefined);
  const [search, setSearch] = useState(saved?.search ?? "");
  const [deadlineDate, setDeadlineDateState] = useState(saved?.deadlineDate ?? "");
  const [quickFilter, setQuickFilterState] = useState<QuickDeadlineFilterValue>(saved?.quickFilter ?? "");
  const [status, setStatus] = useState<StatusFilterValue>(saved?.status ?? options?.initialStatus ?? "all");
  const [priority, setPriority] = useState<PriorityFilterValue>(saved?.priority ?? "all");
  const [projectFilter, setProjectFilter] = useState<ProjectFilterValue>(saved?.projectFilter ?? "all");
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilterValue>(saved?.assignedFilter ?? options?.initialAssignedFilter ?? "all");
  const [overdueOnly, setOverdueOnly] = useState(saved?.overdueOnly ?? options?.initialOverdueOnly ?? false);
  const [dueSoonOnly, setDueSoonOnly] = useState(saved?.dueSoonOnly ?? false);
  const [ownership, setOwnership] = useState<OwnershipFilterValue>(saved?.ownership ?? "all");
  // Only tasks with someone assigned who is in this office / this project (null = no filter).
  const [personOffice, setPersonOffice] = useState<number | null>(saved?.personOffice ?? null);
  const [personProject, setPersonProject] = useState<number | null>(saved?.personProject ?? null);
  // Set by the dashboard charts: "upcoming" = open with a deadline beyond the due-soon window, "none" = open without a deadline.
  const [deadlineBucket, setDeadlineBucket] = useState<DeadlineBucketValue>(saved?.deadlineBucket ?? "");
  // Show finished tasks even under status "all" (priority counts include them).
  const [includeCompleted, setIncludeCompleted] = useState(saved?.includeCompleted ?? false);
  const persistKey = options?.persistKey;
  useEffect(() => {
    if (persistKey) storeFilters(persistKey, { search, deadlineDate, quickFilter, status, priority, projectFilter, assignedFilter, overdueOnly, dueSoonOnly, ownership, personOffice, personProject, deadlineBucket, includeCompleted });
  }, [persistKey, deadlineBucket, includeCompleted, search, deadlineDate, quickFilter, status, priority, projectFilter, assignedFilter, overdueOnly, dueSoonOnly, ownership, personOffice, personProject]);

  const setDeadlineDate = (value: string) => {
    setDeadlineDateState(value);
    if (value) setQuickFilterState("");
  };
  const setQuickFilter = (value: QuickDeadlineFilterValue) => {
    setQuickFilterState(current => current === value ? "" : value);
    setDeadlineDateState("");
  };

  const deadlineRange = useMemo(() => {
    if (deadlineDate) return { from: deadlineDate, to: deadlineDate };
    return quickFilterRange(quickFilter);
  }, [deadlineDate, quickFilter]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter(task => {
      if (query) {
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesAssignee = task.assignments.some(person => memberName(person).toLowerCase().includes(query));
        if (!matchesTitle && !matchesAssignee) return false;
      }
      if (deadlineRange) {
        if (!task.deadline) return false;
        if (task.deadline < deadlineRange.from || task.deadline > deadlineRange.to) return false;
      }
      if (status !== "all" && task.status !== status) return false;
      // Under "My Total Tasks" / "Task Assigned" the count includes finished work, so show it too.
      if (status === "all" && task.is_completed && !options?.showCompletedInAll && !includeCompleted && ownership === "all") return false;
      if (priority !== "all" && task.priority !== priority) return false;
      if (projectFilter === "personal") {
        if (task.project) return false;
      } else if (projectFilter !== "all") {
        if (!task.project || task.project.id !== projectFilter) return false;
      }
      if (assignedFilter === "unassigned" && task.assignments.length > 0) return false;
      if (personOffice !== null || personProject !== null) {
        const people = task.assignments.map(person => options?.members?.find(member => member.id === person.id));
        if (personOffice !== null && !people.some(member => member?.office === personOffice)) return false;
        if (personProject !== null && !people.some(member => member?.projects?.includes(personProject))) return false;
      }
      if (overdueOnly && !isOverdue(task)) return false;
      if (dueSoonOnly && !isDueSoon(task)) return false;
      if (deadlineBucket) {
        if (task.is_completed) return false;
        const days = daysUntilDue(task);
        if (deadlineBucket === "none" ? !!task.deadline : (days === null || days <= DUE_SOON_DAYS)) return false;
      }
      if (ownership === "mine" && !task.is_creator) return false;
      // Tasks sent to you as Task Lead are for review, not work assigned to you.
      if (ownership === "assigned" && !task.assignments.some(person => person.id === options?.userId && person.role !== "Lead")) return false;
      return true;
    });
  }, [tasks, search, deadlineRange, status, priority, projectFilter, assignedFilter, overdueOnly, dueSoonOnly, ownership, personOffice, personProject, options?.members, options?.userId, options?.showCompletedInAll, deadlineBucket, includeCompleted]);

  const hasActiveFilters = !!search.trim() || !!deadlineDate || !!quickFilter || status !== "all" || priority !== "all" || projectFilter !== "all" || personOffice !== null || personProject !== null || assignedFilter !== "all" || overdueOnly || dueSoonOnly || ownership !== "all" || !!deadlineBucket || includeCompleted;
  const clearFilters = () => {
    setSearch(""); setDeadlineDateState(""); setQuickFilterState(""); setStatus("all"); setPriority("all"); setProjectFilter("all"); setPersonOffice(null); setPersonProject(null); setAssignedFilter("all"); setOverdueOnly(false); setDueSoonOnly(false); setOwnership("all"); setDeadlineBucket(""); setIncludeCompleted(false);
  };

  return {
    filtered,
    search, setSearch,
    deadlineDate, setDeadlineDate,
    quickFilter, setQuickFilter,
    status, setStatus,
    priority, setPriority,
    projectFilter, setProjectFilter,
    assignedFilter, setAssignedFilter,
    overdueOnly, setOverdueOnly,
    dueSoonOnly, setDueSoonOnly,
    deadlineBucket, setDeadlineBucket,
    includeCompleted, setIncludeCompleted,
    ownership, setOwnership,
    personOffice, setPersonOffice,
    personProject, setPersonProject,
    hasActiveFilters, clearFilters,
  };
}
