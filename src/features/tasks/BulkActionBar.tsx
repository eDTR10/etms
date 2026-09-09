import { Archive, Trash2, X } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export default function BulkActionBar({ count, onArchive, onDelete, onClear }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="etm-bulk-bar">
      <span className="etm-bulk-bar-count">{count} selected</span>
      <div className="etm-bulk-bar-actions">
        <button type="button" className="etm-button ghost small" onClick={onArchive}><Archive size={14} /> Archive</button>
        <button type="button" className="etm-button ghost small danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>
        <button type="button" className="etm-icon-button" aria-label="Clear selection" onClick={onClear}><X size={15} /></button>
      </div>
    </div>
  );
}
