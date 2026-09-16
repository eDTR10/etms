import type { Recurrence, Task } from "./types";

// Sun-Sat order — must match the backend's WEEKDAY_CODES exactly, and lines up with
// JS's own Date.getDay() (0 = Sunday .. 6 = Saturday) so no reindexing is needed.
export const WEEKDAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export const WEEKDAYS: { code: WeekdayCode; label: string }[] = [
  { code: "SUN", label: "Sun" },
  { code: "MON", label: "Mon" },
  { code: "TUE", label: "Tue" },
  { code: "WED", label: "Wed" },
  { code: "THU", label: "Thu" },
  { code: "FRI", label: "Fri" },
  { code: "SAT", label: "Sat" },
];

// Occurrences never project further into the future than this — a calendar page navigated
// past this window just won't show repeats (a literal one-off deadline can still land there).
const LOOKAHEAD_DAYS = 92;

type RecurrenceLike = Pick<Task, "deadline" | "recurrence" | "recurrence_weekdays" | "recurrence_dates">;

function dateOnlyKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateOnlyKey(key: string): Date {
  const [year, month, day] = key.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function weekdayCodesToLabel(codes: string): string {
  const set = new Set(codes.split(",").filter(Boolean));
  return WEEKDAYS.filter(day => set.has(day.code)).map(day => day.label).join(", ");
}

export function describeRecurrence(task: Pick<Task, "recurrence" | "recurrence_weekdays" | "recurrence_dates">): string {
  if (task.recurrence === "Weekly" && task.recurrence_weekdays) return `Weekly · ${weekdayCodesToLabel(task.recurrence_weekdays)}`;
  if (task.recurrence === "Specific") return `Specific dates (${task.recurrence_dates.length})`;
  return task.recurrence;
}

/**
 * Every date within [rangeStart, rangeEnd] (inclusive, both at local midnight) this task
 * should appear on — a single date for a one-off task, or many for a repeating one.
 */
export function getOccurrenceDates(task: RecurrenceLike, rangeStart: Date, rangeEnd: Date): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cap = new Date(today);
  cap.setDate(cap.getDate() + LOOKAHEAD_DAYS);
  const clampedEnd = rangeEnd > cap ? cap : rangeEnd;

  if (task.recurrence === "Specific") {
    // Explicit, finite, user-picked dates — not subject to the lookahead cap.
    return task.recurrence_dates.filter(iso => {
      const d = parseDateOnlyKey(iso);
      return d >= rangeStart && d <= rangeEnd;
    });
  }

  if (!task.deadline) return [];
  const anchor = parseDateOnlyKey(task.deadline);
  if (clampedEnd < rangeStart) return [];

  if (task.recurrence === "Daily") {
    const results: string[] = [];
    const cursor = new Date(Math.max(anchor.getTime(), rangeStart.getTime()));
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= clampedEnd) {
      if (cursor >= anchor) results.push(dateOnlyKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  if (task.recurrence === "Weekly") {
    const codes = new Set(task.recurrence_weekdays.split(",").filter(Boolean));
    if (!codes.size) return [];
    const results: string[] = [];
    const cursor = new Date(Math.max(anchor.getTime(), rangeStart.getTime()));
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= clampedEnd) {
      if (cursor >= anchor && codes.has(WEEKDAY_CODES[cursor.getDay()])) results.push(dateOnlyKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  if (task.recurrence === "Monthly") {
    const results: string[] = [];
    const cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    while (cursor <= clampedEnd) {
      const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(anchor.getDate(), daysInMonth));
      if (occurrence >= anchor && occurrence >= rangeStart && occurrence <= clampedEnd) results.push(dateOnlyKey(occurrence));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return results;
  }

  // None / Anytime: a single occurrence on the literal deadline.
  return anchor >= rangeStart && anchor <= rangeEnd ? [dateOnlyKey(anchor)] : [];
}

export function isRepeating(recurrence: Recurrence): boolean {
  return recurrence === "Daily" || recurrence === "Weekly" || recurrence === "Monthly" || recurrence === "Specific";
}
