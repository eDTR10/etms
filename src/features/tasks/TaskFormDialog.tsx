import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import TaskForm from "./TaskForm";
import type { Member, Project, Task, TaskInput } from "./types";

interface TaskFormDialogProps {
  task?: Task;
  members: Member[];
  projects: Project[];
  open: boolean;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
}

export default function TaskFormDialog({ task, members, projects, open, onClose, onSave }: TaskFormDialogProps) {
  if (!open) return null;
  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="etm-dialog-overlay" />
        <Dialog.Content className="etm-dialog etm-taskform-dialog" aria-describedby={undefined}>
          <div className="etm-taskform-dialog-header">
            <Dialog.Title className="etm-taskform-dialog-title">{task ? "Edit task" : "Create task"}</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="etm-icon-button" aria-label="Close"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="etm-taskform-dialog-body">
            <TaskForm task={task} members={members} projects={projects} onSave={async input => { await onSave(input); onClose(); }} onCancel={onClose} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
