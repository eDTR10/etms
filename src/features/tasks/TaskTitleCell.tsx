import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import { formatTaskNumber, memberName, type Task } from "./types";

export default function TaskTitleCell({ task, children, onOpen }: { task: Task; children?: ReactNode; onOpen?: () => void }) {
  return (
    <div className="etm-task-title-cell">
      {children && <div className="etm-task-title-controls">{children}</div>}
      <span className="etm-task-title-icon" aria-hidden="true"><ClipboardList size={18} /></span>
      <div className="etm-tasks-table-title">
        <span className="etm-task-title-row">
          <span className="etm-task-title-number">{formatTaskNumber(task.id)}</span>
          {onOpen ? <button type="button" className={`etm-task-title-link ${task.is_completed ? "completed" : ""}`} onClick={onOpen}>{task.title}</button> : <span className={task.is_completed ? "completed" : ""}>{task.title}</span>}
        </span>
        {task.assignments.length ? (
          <div className="etm-tasks-table-assignees" aria-label="Assignees">
            {task.assignments.map(person => (
              <span className="etm-tasks-table-assignee" key={person.id} title={`${memberName(person)} · ${person.role}`}>
                <span className="etm-tasks-table-assignee-avatar" aria-hidden="true">{person.first_name?.charAt(0)}{person.last_name?.charAt(0)}</span>
                {memberName(person)}
              </span>
            ))}
          </div>
        ) : <small className="etm-tasks-table-unassigned">Unassigned</small>}
        <small>{task.project ? task.project.name : "Personal"}{task.subtasks.length ? ` · ${task.subtasks.length} subtask${task.subtasks.length === 1 ? "" : "s"}` : ""}</small>
      </div>
    </div>
  );
}
