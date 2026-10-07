import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { useAuth } from "../../screens/Auth/AuthContext";
import { dueSoonLabel, flattenSubtasks, formatTaskNumber, isDueSoon, isUnseenAssignment, type Task } from "./types";

export default function TaskTitleCell({ task, children, onOpen, to }: { task: Task; children?: ReactNode; onOpen?: () => void; to?: string }) {
  const { user } = useAuth();
  const allSubtasks = flattenSubtasks(task.subtasks);
  const isNew = isUnseenAssignment(task, user?.id);
  return (
    <div className="etm-task-title-cell">
      {children && <div className="etm-task-title-controls" onClick={event => event.stopPropagation()}>{children}</div>}
      <span className="etm-task-title-icon" aria-hidden="true"><ClipboardList size={18} /></span>
      <div className="etm-tasks-table-title">
        <span className="etm-task-title-row">
          {isDueSoon(task) && <span className="etm-due-soon-badge">{dueSoonLabel(task)}</span>}
          {isNew && <span className="etm-task-new-badge">New</span>}
          <span className="etm-task-title-number">{formatTaskNumber(task.id)}</span>
          {to ? <Link to={to} className={`etm-task-title-link etm-task-title-anchor ${task.is_completed ? "completed" : ""}`} onClick={event => event.stopPropagation()}>{task.title}</Link> : onOpen ? <button type="button" className={`etm-task-title-link ${task.is_completed ? "completed" : ""}`} onClick={onOpen}>{task.title}</button> : <span className={task.is_completed ? "completed" : ""}>{task.title}</span>}
        </span>
        {allSubtasks.length > 0 && <small>{allSubtasks.filter(s => s.is_completed).length}/{allSubtasks.length} subtasks</small>}
        {allSubtasks.length === 0 && children && <small>No subtasks</small>}
      </div>
    </div>
  );
}
