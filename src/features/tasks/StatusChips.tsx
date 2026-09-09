import { STATUSES, type TaskStatus } from "./types";

interface StatusChipsProps {
  value: "all" | TaskStatus;
  onChange: (value: "all" | TaskStatus) => void;
  badges?: Partial<Record<TaskStatus, number>>;
}

export default function StatusChips({ value, onChange, badges }: StatusChipsProps) {
  return (
    <div className="etm-status-chips" role="tablist" aria-label="Filter by status">
      <button type="button" role="tab" aria-selected={value === "all"} className={`etm-status-chip ${value === "all" ? "active" : ""}`} onClick={() => onChange("all")}>All</button>
      {STATUSES.map(status => {
        const badge = badges?.[status] ?? 0;
        return (
          <button key={status} type="button" role="tab" aria-selected={value === status} className={`etm-status-chip ${value === status ? "active" : ""}`} onClick={() => onChange(status)}>
            {status}
            {badge > 0 && <span className="etm-status-chip-badge" title={`${badge} ${status.toLowerCase()} task${badge === 1 ? "" : "s"} you haven't viewed yet`}>{badge > 9 ? "9+" : badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
