import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Upload, X } from "lucide-react";
import Swal from "sweetalert2";
import Modal from "../../components/ui/modal";
import ImageCropper from "./ImageCropper";
import SheetEntryForm from "./SheetEntryForm";
import { useAuth } from "../../screens/Auth/AuthContext";
import { taskService } from "../tasks/taskService";
import { sheetService } from "./sheetService";
import type { SheetColumn, SheetSchema, SheetTarget } from "./sheetService";

interface TechnicalAssistanceDialogProps {
  // The project the task belongs to (so it is not a Personal task), and the grouped task it is filed under.
  projectName: string;
  groupName: string;
  taskBase: string;
  // The sheet and its columns (with the sheet's own dropdown choices), as read when the page synced.
  target: SheetTarget;
  schema: SheetSchema;
  onClose: () => void;
  // Runs after a successful save, with the tab the new line went to.
  onSaved?: (tab: string) => void;
}

interface Shot { id: number; file: File; url: string }
type Entry = { column: SheetColumn; value: string };

const pick = (entries: Entry[], pattern: RegExp) => entries.find(entry => pattern.test(entry.column.label.toLowerCase()))?.value ?? "";

// "Add Technical Assistance": paste (or upload) a screenshot of the conversation, crop the part that matters, then fill in the
// sheet's own fields (with the sheet's own dropdown choices). Nothing is uploaded until Save: then a task that is already
// completed is made from the fields, the pictures are attached to it, and it is filed under the grouped task.
export default function TechnicalAssistanceDialog({ projectName, groupName, taskBase, target, schema, onClose, onSaved }: TechnicalAssistanceDialogProps) {
  const { user } = useAuth();
  const [shots, setShots] = useState<Shot[]>([]);
  // Pictures waiting to be cropped (a paste or an upload can bring several): the first is on screen.
  const [queue, setQueue] = useState<Blob[]>([]);
  const cropping = queue[0] ?? null;
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const addImages = (files: Blob[]) => { const images = files.filter(file => file.type.startsWith("image/")); if (images.length) setQueue(current => [...current, ...images]); };
  useEffect(() => () => shots.forEach(shot => URL.revokeObjectURL(shot.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // A picture copied with the Snipping Tool (Win+Shift+S) can simply be pasted.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.items ?? [])].filter(entry => entry.type.startsWith("image/")).map(entry => entry.getAsFile()).filter((file): file is File => !!file);
      if (files.length) { event.preventDefault(); addImages(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function keep(file: File) {
    counter.current += 1;
    setShots(current => [...current, { id: counter.current, file, url: URL.createObjectURL(file) }]);
    setQueue(current => current.slice(1));
  }

  const cancelCrop = () => setQueue(current => current.slice(1));

  function drop(id: number) {
    setShots(current => { const found = current.find(shot => shot.id === id); if (found) URL.revokeObjectURL(found.url); return current.filter(shot => shot.id !== id); });
  }

  // The filled-in fields become a completed task: the concern is its title, every field is listed in its description.
  async function save(entries: Entry[], payload: Record<number, string>, tab: string) {
    if (!user) return;
    const concern = pick(entries, /issues|concern/);
    const place = pick(entries, /lgu name|locality|city|municipality/);
    const title = (concern.split("\n")[0].trim() || [place, pick(entries, /^module/)].filter(Boolean).join(" - ") || "Technical assistance").slice(0, 255);
    const details = entries.map(entry => `${entry.column.label.replace(/\s*\(auto[^)]*\)/i, "").split("\n")[0].trim()}: ${entry.value}`).join("\n");

    // The sheet first: if Google refuses the line (not shared, a bad value), nothing else has been made yet and it can be tried again.
    const line = await sheetService.send(target.id, { tab, values: payload });

    let task = await taskService.create({
      title, project: projectName || null, details, requestor: pick(entries, /requestor|requester/),
      location_province: pick(entries, /^province/), location_city: place, location_barangay: "",
      priority: "Medium", deadline: null, recurrence: "None", recurrence_weekdays: "", recurrence_dates: [],
      status: "Completed", is_completed: true, assignments: [{ user: user.id, role: "Editor" }], subtasks: [],
    });
    if (!task.is_completed) task = await taskService.completeTask(task.id);

    let failedShots = 0;
    if (shots.length) {
      const withRemark = await taskService.addRemark(task.id, shots.length === 1 ? "Screenshot" : `${shots.length} screenshots`);
      const remark = [...withRemark.remarks].sort((a, b) => b.id - a.id)[0];
      for (const shot of shots) {
        try { await taskService.addRemarkAttachment(task.id, remark.id, shot.file); } catch { failedShots += 1; }
      }
    }

    let grouped = "";
    try {
      const groups = await taskService.listGroupedTasks();
      const found = groups.find(group => group.name.trim().toLowerCase() === groupName.toLowerCase());
      if (found) {
        await taskService.updateGroupedTask(found.id, { task_ids: [...found.tasks.map(item => item.id), task.id] });
      } else {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        await taskService.createGroupedTask({ grouped_task_id: `ACT-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`, name: groupName, project_name: projectName, has_target: false, target_value: null, target_type: "number", task_ids: [task.id] });
      }
      grouped = ` Filed under “${groupName}”.`;
    } catch {
      grouped = ` It could not be filed under “${groupName}”: add it there by hand.`;
    }

    const safe = title.replace(/</g, "&lt;");
    void Swal.fire({
      title: "Saved",
      html: `<a href="${taskBase}/${task.id}">Open “${safe}”</a> · completed. Added as row ${line.row_number} of ${tab} in the sheet (<a href="${line.link}" target="_blank" rel="noreferrer">open</a>).${shots.length ? ` ${shots.length - failedShots} of ${shots.length} screenshots attached.` : ""}${grouped}`,
      icon: failedShots || grouped.includes("could not") ? "warning" : "success",
    });
    onSaved?.(tab);
    onClose();
  }

  const screenshots = (
    <section className="etm-panel" style={{ padding: 14, display: "grid", gap: 12, color: "var(--etm-ink)" }}>
      <input ref={picker} type="file" accept="image/*" multiple hidden onChange={event => { addImages([...(event.target.files ?? [])]); event.target.value = ""; }} />
      <div
        onDragOver={event => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={event => { event.preventDefault(); setOver(false); addImages([...event.dataTransfer.files]); }}
        style={{ display: "grid", justifyItems: "center", gap: 10, padding: "26px 16px", textAlign: "center", borderRadius: 14, border: `2px dashed ${over ? "var(--etm-primary)" : "var(--etm-border)"}`, background: over ? "rgba(23, 179, 172, .10)" : "var(--etm-surface-alt)", transition: "background .12s ease, border-color .12s ease" }}>
        <ClipboardPaste size={30} style={{ color: "var(--etm-primary)" }} />
        <strong style={{ fontSize: 20, letterSpacing: ".6px", textTransform: "uppercase" }}>Paste your image here</strong>
        <small style={{ color: "var(--etm-muted)" }}>Snip with Win+Shift+S, then press Ctrl+V. You can also drop a picture on this box.</small>
        <span style={{ color: "var(--etm-muted)", fontSize: 12, fontWeight: 700 }}>OR</span>
        <button type="button" className="etm-button" onClick={() => picker.current?.click()} disabled={cropping !== null}><Upload size={16} /> Upload</button>
      </div>
      {shots.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {shots.map(shot => (
            <div key={shot.id} style={{ position: "relative" }}>
              <img src={shot.url} alt="Screenshot" style={{ height: 96, maxWidth: 200, objectFit: "cover", borderRadius: 8, border: "1px solid var(--etm-border)", display: "block" }} />
              <button type="button" className="etm-icon-button" aria-label="Remove this screenshot" onClick={() => drop(shot.id)} style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, minHeight: 0 }}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <small style={{ color: "var(--etm-muted)" }}>Nothing is uploaded until you press Save.</small>
    </section>
  );

  return (
    <>
      <Modal open onClose={onClose} title="Add Technical Assistance" widthClass="max-w-6xl">
        <div className="etm-entry-modal">
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--etm-muted)" }}>The fields are the sheet’s own columns, with its own dropdown choices. Saving adds a new line at the bottom of the sheet’s tab and makes a completed task from them, with the screenshots attached.</p>
          <SheetEntryForm embedded fixedTargetId={target.id} initialTab={schema.tab} preload={{ target, schema }}
            collect={{ extra: screenshots, submitLabel: "Save as completed", onSave: save }} />
        </div>
      </Modal>
      {cropping && <ImageCropper image={cropping} onDone={keep} onCancel={cancelCrop} />}
    </>
  );
}
