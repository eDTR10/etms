import { useState } from "react";
import Modal from "../../components/ui/modal";
import MultiSelect from "../../components/ui/multiselect";
import type { Project } from "../tasks/types";

export type ProjectMode = "add" | "replace" | "remove";

export interface BulkTagValues {
  // undefined: leave every person's office as it is; null: no office.
  office: number | null | undefined;
  projects: number[];
  projectMode: ProjectMode;
}

interface BulkTagDialogProps {
  count: number;
  offices: Project[];
  onClose: () => void;
  // Resolves when every person has been handled (the dialog closes itself then).
  onApply: (values: BulkTagValues, progress: (done: number) => void) => Promise<void>;
}

const MODES: { value: ProjectMode; label: string; hint: string }[] = [
  { value: "add", label: "Add to their projects", hint: "Keeps the projects they already have." },
  { value: "replace", label: "Replace their projects", hint: "Their projects become exactly this list." },
  { value: "remove", label: "Remove from their projects", hint: "Takes these projects off them." },
];

// Tags many people at once: sets their office, and adds / replaces / removes projects. Anything left untouched stays as it is.
export default function BulkTagDialog({ count, offices, onClose, onApply }: BulkTagDialogProps) {
  const [officeChoice, setOfficeChoice] = useState<string>("keep");
  const [projects, setProjects] = useState<number[]>([]);
  const [mode, setMode] = useState<ProjectMode>("add");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);

  const office = officeChoice === "keep" ? undefined : officeChoice === "none" ? null : Number(officeChoice);
  // Replacing with an empty list is allowed (it clears every project), but must be asked for on purpose.
  const nothingToDo = office === undefined && !projects.length && mode !== "replace";

  async function apply() {
    if (saving || nothingToDo) return;
    setSaving(true);
    setDone(0);
    try {
      await onApply({ office, projects, projectMode: mode }, setDone);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={saving ? () => undefined : onClose} title={`Tag ${count} ${count === 1 ? "person" : "people"}`} widthClass="max-w-lg">
      <form className="etm-report-form" onSubmit={event => { event.preventDefault(); void apply(); }} style={{ display: "grid", gap: 16 }}>
        <label className="etm-field-label">Office
          <select className="etm-select" value={officeChoice} onChange={event => setOfficeChoice(event.target.value)} disabled={saving}>
            <option value="keep">Don’t change</option>
            <option value="none">No office</option>
            {offices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <div style={{ display: "grid", gap: 10 }}>
          <MultiSelect label="Projects" options={offices} selected={projects} onChange={setProjects} placeholder="None picked" inline />
          <div style={{ display: "grid", gap: 8 }}>
            {MODES.map(item => (
              <label key={item.value} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: saving ? "default" : "pointer", color: "var(--etm-ink)" }}>
                <input type="radio" name="bulk-project-mode" checked={mode === item.value} onChange={() => setMode(item.value)} disabled={saving} style={{ marginTop: 3 }} />
                <span>
                  <strong style={{ fontSize: 13.5, color: "var(--etm-ink)" }}>{item.label}</strong>
                  <small style={{ display: "block", color: "var(--etm-muted)" }}>{item.hint}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        {mode === "replace" && !projects.length && (
          <p className="etm-report-error" style={{ margin: 0 }}>No project is picked: this will take every project off the {count} selected {count === 1 ? "person" : "people"}.</p>
        )}

        <div className="etm-report-form-actions">
          <button type="button" className="etm-button ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="etm-button" disabled={saving || nothingToDo}>{saving ? `Saving ${done} of ${count}…` : `Apply to ${count}`}</button>
        </div>
      </form>
    </Modal>
  );
}
