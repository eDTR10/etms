import type { KeyboardEvent, MouseEvent } from "react";
import { CalendarDays, MessageSquare, Paperclip } from "lucide-react";
import TaskRowActions from "./TaskRowActions";
import { formatDate, formatTaskNumber, isOverdue, memberName, remarkPreview, statusChipLabel, type Task } from "./types";

interface TaskCardProps {
  task: Task;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TaskCard({ task, selected, onToggleSelect, onView, onEdit, onDelete }: TaskCardProps) {
  const lastRemark = task.remarks[0];
  const visibleAssignees = task.assignments.slice(0, 3);
  const extraAssignees = task.assignments.length - visibleAssignees.length;

  function handleCardActivate(event: MouseEvent | KeyboardEvent) {
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onView();
  }

  return (
    <div
      className={`etm-task-card ${task.priority.toLowerCase()} ${task.is_completed ? "completed" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`View ${task.title}`}
      onClick={handleCardActivate}
      onKeyDown={handleCardActivate}
    >
      <div className="etm-task-card-top">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} aria-label={`Select ${task.title}`} />
        <span className="etm-task-card-title-group">
          <span className="etm-task-card-number">{formatTaskNumber(task.id)}</span>
          <span className="etm-task-card-title">{task.title}</span>
        </span>
        <span className={`etm-priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</span>
      </div>

      <p className="etm-task-card-remark">
        {lastRemark
          ? <>“{remarkPreview(lastRemark.message)}”<small>— {lastRemark.created_by_name ?? "Unknown"}</small></>
          : <span className="etm-task-card-remark-empty">No remarks yet.</span>}
      </p>

      <div className="etm-task-card-meta">
        <span className={`etm-badge ${task.status.toLowerCase().replace(/\s+/g, "-")}`}>{statusChipLabel(task)}</span>
        <div className="etm-task-card-assignees">
          {visibleAssignees.length ? visibleAssignees.map(person => (
            <span className="etm-task-card-avatar" key={person.id} title={memberName(person)}>{person.first_name?.charAt(0)}{person.last_name?.charAt(0)}</span>
          )) : <span className="etm-task-card-unassigned">Unassigned</span>}
          {extraAssignees > 0 && <span className="etm-task-card-avatar more">+{extraAssignees}</span>}
        </div>
      </div>

      <div className="etm-task-card-footer">
        <div className="etm-task-card-stats">
          <span className="etm-task-card-stat" title={`${task.remarks.length} remark${task.remarks.length === 1 ? "" : "s"}`}><MessageSquare size={13} />{task.remarks.length}</span>
          <span className="etm-task-card-stat" title={`${task.attachments.length} attachment${task.attachments.length === 1 ? "" : "s"}`}><Paperclip size={13} />{task.attachments.length}</span>
          {task.deadline && (
            <span className={`etm-task-card-stat ${isOverdue(task) ? "overdue" : ""}`} title={`Due ${formatDate(task.deadline)}`}><CalendarDays size={13} />{formatDate(task.deadline)}</span>
          )}
        </div>
        <span onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <TaskRowActions task={task} onView={onView} onEdit={onEdit} onDelete={onDelete} />
        </span>
      </div>
    </div>
  );
}
