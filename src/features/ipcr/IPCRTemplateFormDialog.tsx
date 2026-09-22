import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import IPCRTemplateForm from "./IPCRTemplateForm";
import type { IPCRTemplate, IPCRTemplateInput } from "./types";

interface IPCRTemplateFormDialogProps {
  template?: IPCRTemplate;
  open: boolean;
  onClose: () => void;
  onSave: (input: IPCRTemplateInput) => Promise<void>;
}

export default function IPCRTemplateFormDialog({ template, open, onClose, onSave }: IPCRTemplateFormDialogProps) {
  if (!open) return null;
  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="etm-dialog-overlay" />
        <Dialog.Content className="etm-dialog etm-taskform-dialog" aria-describedby={undefined}>
          <div className="etm-taskform-dialog-header">
            <Dialog.Title className="etm-taskform-dialog-title">{template ? "Edit IPCR template" : "New IPCR template"}</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="etm-icon-button" aria-label="Close"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="etm-taskform-dialog-body">
            <IPCRTemplateForm template={template} onSave={async input => { await onSave(input); onClose(); }} onCancel={onClose} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
