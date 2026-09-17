import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import TemplateForm from "./TemplateForm";
import type { Member, Project, TaskTemplate, TaskTemplateInput } from "./types";

interface TemplateFormDialogProps {
  template?: TaskTemplate;
  members: Member[];
  projects: Project[];
  open: boolean;
  onClose: () => void;
  onSave: (input: TaskTemplateInput) => Promise<void>;
}

export default function TemplateFormDialog({ template, members, projects, open, onClose, onSave }: TemplateFormDialogProps) {
  if (!open) return null;
  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="etm-dialog-overlay" />
        <Dialog.Content className="etm-dialog etm-taskform-dialog" aria-describedby={undefined}>
          <div className="etm-taskform-dialog-header">
            <Dialog.Title className="etm-taskform-dialog-title">{template ? "Edit template" : "New task template"}</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="etm-icon-button" aria-label="Close"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="etm-taskform-dialog-body">
            <TemplateForm template={template} members={members} projects={projects} onSave={async input => { await onSave(input); onClose(); }} onCancel={onClose} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
