import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import { formatTaskNumber, type Task } from "./types";

export default function TaskTitleCell({ task, children, onOpen }: { task: Task; children?: ReactNode; onOpen?: () => void }) {
  return (
    <div className="etm-task-title-cell">
      {children && <div className="etm-task-title-controls" onClick={event => event.stopPropagation()}>{children}</div>}
      <span className="etm-task-title-icon" aria-hidden="true"><ClipboardList size={18} /></span>
      <div className="etm-tasks-table-title">
        <span className="etm-task-title-row">
          <span className="etm-task-title-number">{formatTaskNumber(task.id)}</span>
          {onOpen ? <button type="button" className={`etm-task-title-link ${task.is_completed ? "completed" : ""}`} onClick={onOpen}>{task.title}</button> : <span className={task.is_completed ? "completed" : ""}>{task.title}</span>}
        </span>
        {task.subtasks.length > 0 && <small>{task.subtasks.filter(s => s.is_completed).length}/{task.subtasks.length} subtasks</small>}
      </div>
    </div>
  );
}
