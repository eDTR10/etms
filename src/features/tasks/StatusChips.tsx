import { STATUSES, type TaskStatus } from "./types";

interface StatusChipsProps {
  value: "all" | TaskStatus;
  onChange: (value: "all" | TaskStatus) => void;
}

export default function StatusChips({ value, onChange }: StatusChipsProps) {
  return (
    <div className="etm-status-chips" role="tablist" aria-label="Filter by status">
      <button type="button" role="tab" aria-selected={value === "all"} className={`etm-status-chip ${value === "all" ? "active" : ""}`} onClick={() => onChange("all")}>All</button>
      {STATUSES.map(status => (
        <button key={status} type="button" role="tab" aria-selected={value === status} className={`etm-status-chip ${value === status ? "active" : ""}`} onClick={() => onChange(status)}>{status}</button>
      ))}
    </div>
  );
}
