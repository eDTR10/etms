import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import CreateDocumentForm from "./CreateDocumentForm";

interface CreateDocumentDialogProps {
  open: boolean;
  defaultTitle: string;
  initialTemplateId?: number | null;
  onClose: () => void;
  onCreated: (tracknumber: string) => Promise<void>;
}

export default function CreateDocumentDialog({ open, defaultTitle, initialTemplateId, onClose, onCreated }: CreateDocumentDialogProps) {
  if (!open) return null;
  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="etm-dialog-overlay" />
        <Dialog.Content className="etm-dialog etm-taskform-dialog" aria-describedby={undefined}>
          <div className="etm-taskform-dialog-header">
            <Dialog.Title className="etm-taskform-dialog-title">Create Document</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="etm-icon-button" aria-label="Close"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="etm-taskform-dialog-body">
            <CreateDocumentForm defaultTitle={defaultTitle} initialTemplateId={initialTemplateId} onCreated={async tracknumber => { await onCreated(tracknumber); onClose(); }} onCancel={onClose} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
