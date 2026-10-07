import { CalendarDays, CheckCircle2, Circle, ExternalLink, Flag, Folder, Users } from "lucide-react";
import Modal from "../../components/ui/modal";
import { detailsToText, RichDetails } from "./richDetails";
import { roleLabel } from "./types";
import { flattenSubtasks, formatDate, formatTaskNumber, memberName, statusSlug, stripHtml, type SubTask, type Task } from "./types";

// Read-only look at everything recorded on a task — used where the user only needs to
// check what a (usually finished) task was about, without the editing controls of the
// full task page.
function SubtaskList({ subtasks, depth = 0 }: { subtasks: SubTask[]; depth?: number }) {
  return (
    <ul className="flex flex-col gap-1.5" style={{ marginLeft: depth ? 18 : 0 }}>
      {subtasks.map((subtask, index) => (
        <li key={subtask.id ?? index}>
          <div className="flex items-start gap-2 text-sm">
            {subtask.is_completed ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#3e9276]" /> : <Circle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <p className={`font-medium ${subtask.is_completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{subtask.title}</p>
              {subtask.description && <p className="text-xs text-muted-foreground">{subtask.description}</p>}
              {subtask.assignee && <p className="text-xs text-muted-foreground">Assigned to {memberName(subtask.assignee)}</p>}
            </div>
          </div>
          {subtask.subtasks?.length > 0 && <div className="mt-1.5"><SubtaskList subtasks={subtask.subtasks} depth={depth + 1} /></div>}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}{count !== undefined && <span className="ml-1.5 font-semibold opacity-70">({count})</span>}</h3>
      {children}
    </section>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{children}</dd>
    </div>
  );
}

export default function TaskPreviewModal({ task, onClose, onOpenFull }: { task: Task | null; onClose: () => void; onOpenFull?: (task: Task) => void }) {
  if (!task) return null;
  const subtasks = flattenSubtasks(task.subtasks);
  const doneSubtasks = subtasks.filter(subtask => subtask.is_completed).length;
  const progressLogs = [...task.progress_logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const location = [task.location_barangay, task.location_city, task.location_province].filter(Boolean).join(", ");

  return (
    <Modal open onClose={onClose} title={`Task ${formatTaskNumber(task.id)}`} widthClass="max-w-2xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-foreground leading-snug">{task.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`etm-badge ${statusSlug(task.status)}`}>{task.status}</span>
            <span className={`etm-details-priority ${task.priority.toLowerCase()}`}><Flag size={13} />{task.priority} priority</span>
          </div>
          {detailsToText(task.details) ? <RichDetails className="text-sm text-foreground" value={task.details} /> : <p className="text-sm text-muted-foreground italic">No description provided.</p>}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-3 rounded-xl border border-border bg-accent/40 p-4">
          <Field icon={<Folder size={13} />} label="Project">{task.project ? task.project.name : "Personal task"}</Field>
          <Field icon={<CalendarDays size={13} />} label="Deadline">{formatDate(task.deadline)}</Field>
          <Field icon={<CalendarDays size={13} />} label="Created">{formatDate(task.created_at, true)}</Field>
          <Field icon={<CheckCircle2 size={13} />} label="Finished">{task.is_completed ? formatDate(task.updated_at, true) : "Not yet"}</Field>
          <Field icon={<Users size={13} />} label="Created by">{task.created_by_name || "Unknown"}</Field>
          {task.requestor && <Field icon={<Users size={13} />} label="Requestor">{task.requestor}</Field>}
          {location && <Field icon={<Folder size={13} />} label="Location">{location}</Field>}
          <Field icon={<Users size={13} />} label="Assigned persons">
            {task.assignments.length ? task.assignments.map(person => `${memberName(person)} (${roleLabel(person.role)})`).join(", ") : "Unassigned"}
          </Field>
        </dl>

        <Section title="Subtasks" count={subtasks.length}>
          {subtasks.length ? (
            <>
              <p className="text-xs text-muted-foreground">{doneSubtasks} of {subtasks.length} complete</p>
              <SubtaskList subtasks={task.subtasks} />
            </>
          ) : <p className="text-sm text-muted-foreground">No subtasks.</p>}
        </Section>

        <Section title="Progress log" count={progressLogs.length}>
          {progressLogs.length ? (
            <ul className="flex flex-col gap-2">
              {progressLogs.map(log => (
                <li key={log.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={`etm-badge ${statusSlug(log.status)}`}>{log.status}</span>
                    <span>{log.created_by_name || "Unknown"}</span>
                    <span>· {formatDate(log.created_at, true)}</span>
                  </div>
                  <p className="mt-1.5 text-foreground whitespace-pre-wrap">{stripHtml(log.message)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No progress updates yet.</p>}
        </Section>

        <Section title="Remarks" count={task.remarks.length}>
          {task.remarks.length ? (
            <ul className="flex flex-col gap-2">
              {task.remarks.map(remark => (
                <li key={remark.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">{remark.created_by_name || "Unknown"} · {formatDate(remark.created_at, true)}</div>
                  <p className="mt-1 text-foreground whitespace-pre-wrap">{stripHtml(remark.message)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No remarks.</p>}
        </Section>

        {task.attachments.length > 0 && (
          <Section title="Attachments" count={task.attachments.length}>
            <ul className="flex flex-col gap-1 text-sm">
              {task.attachments.map(file => (
                <li key={file.id}>{file.url ? <a href={file.url} target="_blank" rel="noreferrer" className="text-[#0d8a92] dark:text-[#17b3ac] hover:underline">{file.original_filename}</a> : file.original_filename}</li>
              ))}
            </ul>
          </Section>
        )}

        {onOpenFull && (
          <div className="flex justify-end pt-1">
            <button type="button" className="etm-button ghost small" onClick={() => onOpenFull(task)}><ExternalLink size={14} />Open full task</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
