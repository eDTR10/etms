import { Copy, Edit3, Eye, Loader2, Trash2 } from "lucide-react";
import type { Task } from "./types";

interface TaskRowActionsProps {
  task: Task;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  duplicating?: boolean;
}

export default function TaskRowActions({ task, onView, onEdit, onDelete, onDuplicate, duplicating = false }: TaskRowActionsProps) {
  return (
    <div className="etm-task-row-actions">
      <button type="button" className="etm-icon-button" aria-label={`View ${task.title}`} onClick={onView}><Eye size={15} /></button>
      {task.can_edit && <button type="button" className="etm-icon-button" aria-label={`Edit ${task.title}`} onClick={onEdit}><Edit3 size={15} /></button>}
      {onDuplicate && <button type="button" className="etm-icon-button" aria-label={duplicating ? `Duplicating ${task.title}` : `Duplicate ${task.title}`} onClick={onDuplicate} disabled={duplicating}>{duplicating ? <Loader2 size={15} className="etm-form-spinner" /> : <Copy size={15} />}</button>}
      {task.can_delete && <button type="button" className="etm-icon-button danger" aria-label={`Delete ${task.title}`} onClick={onDelete}><Trash2 size={15} /></button>}
    </div>
  );
}
