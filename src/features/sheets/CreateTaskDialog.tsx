import { useState } from "react";
import { Plus, X } from "lucide-react";
import Modal from "../../components/ui/modal";
import MultiSelect from "../../components/ui/multiselect";
import type { Priority } from "../tasks/types";

export interface CreateTaskValues {
  title: string;
  priority: Priority;
  subtasks: string[];
  assignees: number[];
  shareProvincial: boolean;
  shareFocal: boolean;
}

interface Person { id: number; name: string }

interface CreateTaskDialogProps {
  initialTitle: string;
  // What the task will already contain, from the sheet.
  summary: string;
  members: { id: number; name: string; detail?: string }[];
  provincial: Person[];
  focal: Person[];
  onClose: () => void;
  onSubmit: (values: CreateTaskValues) => Promise<void>;
}

const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

// The window that opens from a row's "Create task" button: what to call the task, its priority, subtasks, who to hand it to and
// who else may see it. Everything else (description, remarks, links) comes from the row.
export default function CreateTaskDialog({ initialTitle, summary, members, provincial, focal, onClose, onSubmit }: CreateTaskDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [priority, setPriority] = useState<Priority>("Medium");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [assignees, setAssignees] = useState<number[]>([]);
  const [shareProvincial, setShareProvincial] = useState(false);
  const [shareFocal, setShareFocal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addSubtask = () => {
    const text = draft.trim();
    if (!text) return;
    setSubtasks(current => [...current, text]);
    setDraft("");
  };

  async function submit() {
    if (saving) return;
    const name = title.trim();
    if (!name) { setError("Give the task a title."); return; }
    // A subtask typed but not yet added still counts.
    const all = draft.trim() ? [...subtasks, draft.trim()] : subtasks;
    setSaving(true);
    setError("");
    try {
      await onSubmit({ title: name, priority, subtasks: all, assignees, shareProvincial, shareFocal });
    } catch {
      setSaving(false);
    }
  }

  const share = (checked: boolean, set: (value: boolean) => void, label: string, people: Person[]) => (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "var(--etm-ink)", opacity: people.length ? 1 : 0.55, cursor: people.length ? "pointer" : "default" }}>
      <input type="checkbox" checked={checked} disabled={!people.length || saving} onChange={event => set(event.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
      <span>
        <strong style={{ fontSize: 13.5, color: "var(--etm-ink)" }}>{label}</strong>
        <small style={{ display: "block", color: "var(--etm-muted)" }}>{people.length ? people.map(person => person.name).join(", ") : "No one is set up for this yet."}</small>
      </span>
    </label>
  );

  return (
    <Modal open onClose={saving ? () => undefined : onClose} title="Create task" widthClass="max-w-xl">
      <form className="etm-report-form" onSubmit={event => { event.preventDefault(); void submit(); }} style={{ display: "grid", gap: 14 }}>
        {error && <p className="etm-report-error" style={{ margin: 0 }}>{error}</p>}

        <label className="etm-field-label">Task title
          <input className="etm-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={255} autoFocus disabled={saving} />
        </label>
        {summary && <p style={{ margin: "-6px 0 0", fontSize: 12.5, color: "var(--etm-muted)" }}>{summary}</p>}

        <label className="etm-field-label">Priority
          <select className="etm-select" value={priority} onChange={event => setPriority(event.target.value as Priority)} disabled={saving}>
            {PRIORITIES.map(level => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>

        <div style={{ display: "grid", gap: 8 }}>
          <span className="etm-field-label">Subtasks <span style={{ textTransform: "none", fontWeight: 500 }}>(optional)</span></span>
          {subtasks.map((text, index) => (
            <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="etm-input" value={text} onChange={event => setSubtasks(current => current.map((item, position) => position === index ? event.target.value : item))} maxLength={255} disabled={saving} />
              <button type="button" className="etm-icon-button" aria-label="Remove this subtask" onClick={() => setSubtasks(current => current.filter((_, position) => position !== index))} disabled={saving}><X size={16} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input className="etm-input" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Add a subtask…" maxLength={255} disabled={saving}
              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addSubtask(); } }} />
            <button type="button" className="etm-button ghost" style={{ minHeight: 40 }} onClick={addSubtask} disabled={saving || !draft.trim()}><Plus size={15} /> Add</button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <MultiSelect label="Assign to others" options={members} selected={assignees} onChange={setAssignees} placeholder="Nobody else" inline />
          <small style={{ color: "var(--etm-muted)" }}>They are notified, and can work on the task.</small>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <span className="etm-field-label">Allow these people to see your task?</span>
          {share(shareProvincial, setShareProvincial, "Provincial Officer", provincial)}
          {share(shareFocal, setShareFocal, "Project Focal Officer", focal)}
          <small style={{ color: "var(--etm-muted)" }}>They are notified, and see the task as a viewer.</small>
        </div>

        <div className="etm-report-form-actions">
          <button type="button" className="etm-button ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="etm-button" disabled={saving}>{saving ? "Creating…" : "Create task"}</button>
        </div>
      </form>
    </Modal>
  );
}
