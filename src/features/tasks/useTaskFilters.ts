import { useMemo, useState } from "react";
import { memberName, type Priority, type Task, type TaskStatus } from "./types";

export type StatusFilterValue = "all" | TaskStatus;
export type PriorityFilterValue = "all" | Priority;
export type ProjectFilterValue = "all" | "personal" | number;
export type QuickDeadlineFilterValue = "" | "day" | "week" | "month";

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

export function useTaskFilters(tasks: Task[]) {
  const [search, setSearch] = useState("");
  const [deadlineDate, setDeadlineDateState] = useState("");
  const [quickFilter, setQuickFilterState] = useState<QuickDeadlineFilterValue>("");
  const [status, setStatus] = useState<StatusFilterValue>("all");
  const [priority, setPriority] = useState<PriorityFilterValue>("all");
  const [projectFilter, setProjectFilter] = useState<ProjectFilterValue>("all");

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
      if (priority !== "all" && task.priority !== priority) return false;
      if (projectFilter === "personal") {
        if (task.project) return false;
      } else if (projectFilter !== "all") {
        if (!task.project || task.project.id !== projectFilter) return false;
      }
      return true;
    });
  }, [tasks, search, deadlineRange, status, priority, projectFilter]);

  const hasActiveFilters = !!search.trim() || !!deadlineDate || !!quickFilter || status !== "all" || priority !== "all" || projectFilter !== "all";
  const clearFilters = () => {
    setSearch(""); setDeadlineDateState(""); setQuickFilterState(""); setStatus("all"); setPriority("all"); setProjectFilter("all");
  };

  return {
    filtered,
    search, setSearch,
    deadlineDate, setDeadlineDate,
    quickFilter, setQuickFilter,
    status, setStatus,
    priority, setPriority,
    projectFilter, setProjectFilter,
    hasActiveFilters, clearFilters,
  };
}
