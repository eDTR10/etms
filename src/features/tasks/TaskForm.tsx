import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { AlertTriangle, CalendarDays, Check, CheckCheck, ChevronDown, ClipboardList, Clock3, Flag, Folder, Loader2, Plus, Search, Trash2, User, UserPlus, Users, X } from "lucide-react";
import { useTasks } from "./taskContext";
import { taskError } from "./taskService";
import { ASSIGNMENT_ROLES, formatDate, memberName, PRIORITIES, STATUSES, type AssignmentInput, type AssignmentRole, type Member, type Project, type SubTask, type Task, type TaskInput, type TaskStatus } from "./types";
import "./forms.css";

interface TaskFormProps {
  task?: Task;
  members: Member[];
  projects: Project[];
  onSave: (input: TaskInput) => Promise<void>;
  onCancel: () => void;
}

type EditableSubtask = SubTask & { localKey: string };
type FormValues = Omit<TaskInput, "subtasks" | "assignments" | "project"> & {
  subtasks: EditableSubtask[];
  assignments: AssignmentInput[];
  isPersonal: boolean;
  project: string;
};
type FormErrors = Record<string, string>;

function initialValues(task?: Task): FormValues {
  return {
    title: task?.title ?? "",
    isPersonal: task ? !task.project : false,
    project: task?.project?.name ?? "",
    details: task?.details ?? "",
    requestor: task?.requestor ?? "",
    priority: task?.priority ?? "Medium",
    deadline: task?.deadline?.slice(0, 10) ?? "",
    status: task?.is_completed ? "Completed" : task?.status ?? "Pending",
    is_completed: task?.is_completed ?? task?.status === "Completed",
    assignments: (task?.assignments ?? []).map(person => ({ user: person.id, role: person.role })),
    subtasks: (task?.subtasks ?? []).map((subtask, index) => ({ ...subtask, localKey: `existing-${subtask.id ?? index}` })),
    progress_message: "",
  };
}

function saveError(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data;
    if (body && typeof body === "object") {
      if (body.errors && typeof body.errors === "object") {
        const messages = Object.values(body.errors).flat().filter((message): message is string => typeof message === "string");
        if (messages.length) return messages.join(" ");
      }
      if (typeof body.message === "string") return body.message;
    }
    if (!error.response) return "We couldn’t reach the server. Check your connection and try saving again.";
  }
  return "Your task couldn’t be saved. Your changes are still here; please try again.";
}

function TaskLivePreview({ values, members }: { values: FormValues; members: Member[] }) {
  const assignedMembers = values.assignments.map(assignment => members.find(member => member.id === assignment.user)).filter((member): member is Member => !!member);
  const completeSubtasks = values.subtasks.filter(subtask => subtask.is_completed).length;

  return <section className="etm-panel etm-task-preview" aria-live="polite" aria-label="Task preview">
    <div className="etm-task-preview-heading"><span className="etm-form-section-icon"><ClipboardList size={19} /></span><div><span>LIVE PREVIEW</span><h2>{values.title.trim() || "New task"}</h2></div></div>
    <p className={`etm-task-preview-details ${values.details.trim() ? "" : "empty"}`}>{values.details.trim() || "Your task details will appear here."}</p>
    <dl className="etm-task-preview-meta">
      <div><dt><Folder size={14} />Project / Office</dt><dd>{values.isPersonal ? "Personal task" : values.project.trim() || "Not selected"}</dd></div>
      <div><dt><CalendarDays size={14} />Deadline</dt><dd>{formatDate(values.deadline)}</dd></div>
      <div><dt><Flag size={14} />Priority</dt><dd className={values.priority.toLowerCase()}>{values.priority}</dd></div>
      <div><dt><User size={14} />Requestor</dt><dd>{values.requestor.trim() || "Not specified"}</dd></div>
    </dl>
    <div className="etm-task-preview-group"><div><Users size={14} /><strong>Assigned persons</strong><span>{assignedMembers.length}</span></div>{assignedMembers.length ? <ul>{assignedMembers.slice(0, 3).map(member => <li key={member.id}><span>{member.first_name.charAt(0)}{member.last_name.charAt(0)}</span>{memberName(member)}</li>)}{assignedMembers.length > 3 && <li className="more">+{assignedMembers.length - 3} more</li>}</ul> : <p>No one assigned yet.</p>}</div>
    <div className="etm-task-preview-group"><div><CheckCheck size={14} /><strong>Subtasks</strong><span>{completeSubtasks}/{values.subtasks.length}</span></div>{values.subtasks.length ? <ul>{values.subtasks.slice(0, 3).map((subtask, index) => <li key={subtask.localKey} className={subtask.is_completed ? "completed" : ""}><Check size={12} />{subtask.title.trim() || `Subtask ${index + 1}`}</li>)}{values.subtasks.length > 3 && <li className="more">+{values.subtasks.length - 3} more</li>}</ul> : <p>No subtasks added yet.</p>}</div>
  </section>;
}

function TaskFormContent({ task, members, projects, onSave, onCancel }: TaskFormProps) {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const nextSubtask = useRef(0);
  const { addMember } = useTasks();
  const [values, setValues] = useState<FormValues>(() => initialValues(task));
  const [errors, setErrors] = useState<FormErrors>({});
  const [memberSearch, setMemberSearch] = useState("");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [newMember, setNewMember] = useState({ first_name: "", last_name: "", email: "", position: "" });
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState("");
  const canManageAssignments = !task || task.can_manage_assignments;
  const roster = [...new Map([...members, ...(task?.assignments ?? [])].map(member => [member.id, member])).values()];
  const projectOptions = [...new Map([...projects, ...(task?.project ? [task.project] : [])].map(project => [project.id, project])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const filteredMembers = roster.filter(member => `${memberName(member)} ${member.position ?? ""}`.toLowerCase().includes(memberSearch.trim().toLowerCase()));
  const filteredProjects = projectOptions.filter(project => project.name.toLocaleLowerCase().includes(values.project.trim().toLocaleLowerCase()));
  const completedSubtasks = values.subtasks.filter(subtask => subtask.is_completed).length;
  const incompleteSubtasks = values.subtasks.length - completedSubtasks;

  useEffect(() => {
    if (!projectMenuOpen) return;
    const dismissProjectMenu = (event: PointerEvent) => {
      if (!projectPickerRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismissProjectMenu);
    return () => document.removeEventListener("pointerdown", dismissProjectMenu);
  }, [projectMenuOpen]);

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [field]: value }));
    if (errors[field as string]) setErrors(current => ({ ...current, [field as string]: "" }));
  }

  function updateStatus(status: TaskStatus) {
    setValues(current => ({ ...current, status, is_completed: status === "Completed" }));
    if (errors.status) setErrors(current => ({ ...current, status: "" }));
  }

  function toggleAssignment(id: number) {
    setValues(current => ({
      ...current,
      assignments: current.assignments.some(assignment => assignment.user === id)
        ? current.assignments.filter(assignment => assignment.user !== id)
        : [...current.assignments, { user: id, role: "Viewer" as AssignmentRole }],
    }));
  }

  function updateAssignmentRole(id: number, role: AssignmentRole) {
    setValues(current => ({ ...current, assignments: current.assignments.map(assignment => assignment.user === id ? { ...assignment, role } : assignment) }));
  }

  function openAddMember() {
    const query = memberSearch.trim();
    const looksLikeEmail = query.includes("@");
    setNewMember({ first_name: looksLikeEmail ? "" : query, last_name: "", email: looksLikeEmail ? query : "", position: "" });
    setMemberError("");
    setAddingMember(true);
  }

  async function handleAddMember() {
    if (memberSaving) return;
    if (!newMember.first_name.trim() || !newMember.last_name.trim() || !newMember.email.trim()) {
      setMemberError("First name, last name, and email are required.");
      return;
    }
    setMemberSaving(true);
    setMemberError("");
    try {
      const member = await addMember({
        first_name: newMember.first_name.trim(),
        last_name: newMember.last_name.trim(),
        email: newMember.email.trim(),
        position: newMember.position.trim(),
      });
      toggleAssignment(member.id);
      setNewMember({ first_name: "", last_name: "", email: "", position: "" });
      setAddingMember(false);
      setMemberSearch("");
    } catch (caught) {
      setMemberError(taskError(caught));
    } finally {
      setMemberSaving(false);
    }
  }

  function updateSubtask(localKey: string, change: Partial<SubTask>) {
    setValues(current => ({ ...current, subtasks: current.subtasks.map(subtask => subtask.localKey === localKey ? { ...subtask, ...change } : subtask) }));
    if (errors[localKey] || (change.is_completed !== undefined && errors.status)) setErrors(current => ({ ...current, [localKey]: "", ...(change.is_completed !== undefined ? { status: "" } : {}) }));
  }

  function addSubtask() {
    const localKey = `new-${nextSubtask.current++}`;
    setValues(current => ({ ...current, subtasks: [...current.subtasks, { localKey, title: "", description: "", status: "Pending", is_completed: false }] }));
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>(`[data-subtask-key="${localKey}"]`)?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextErrors: FormErrors = {};
    if (!values.title.trim()) nextErrors.title = "Give this task a title.";
    if (!values.isPersonal && !values.project.trim()) nextErrors.project = "Enter or select a project, or mark this as a personal task.";
    if (!values.deadline) nextErrors.deadline = "Choose a deadline for this task.";
    else {
      const deadline = new Date(`${values.deadline}T00:00:00Z`);
      if (Number.isNaN(deadline.getTime()) || deadline.toISOString().slice(0, 10) !== values.deadline) nextErrors.deadline = "Enter a valid deadline.";
    }
    values.subtasks.forEach(subtask => {
      if (!subtask.title.trim()) nextErrors[subtask.localKey] = "Add a subtask title, or remove this row.";
    });
    if (values.status === "Completed" && incompleteSubtasks > 0) {
      nextErrors.status = `Complete the ${incompleteSubtasks} remaining subtask${incompleteSubtasks === 1 ? "" : "s"} before completing this task.`;
    }
    setErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    try {
      const { isPersonal, project, ...rest } = values;
      await onSave({
        ...rest,
        title: values.title.trim(),
        project: isPersonal ? null : project.trim(),
        details: values.details.trim(),
        requestor: values.requestor.trim(),
        progress_message: values.progress_message?.trim() || undefined,
        subtasks: values.subtasks.map(({ id, title, description, status, is_completed }) => ({ ...(id !== undefined ? { id } : {}), title: title.trim(), description: description.trim(), status, is_completed })),
      });
    } catch (caught) {
      setError(saveError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="etm-task-form" onSubmit={handleSubmit} ref={formRef} noValidate aria-busy={saving}>
      <fieldset className="etm-form-fieldset" disabled={saving}>
        <div className="etm-form-layout">
          <div className="etm-form-main">
            <section className="etm-panel etm-form-section" aria-labelledby={`${fieldId}-information-heading`}>
              <div className="etm-form-section-heading">
                <span className="etm-form-section-icon"><ClipboardList size={19} /></span>
                <div><h2 id={`${fieldId}-information-heading`}>Task information</h2><p>A little clarity goes a long way.</p></div>
                <span className="etm-form-required-note">* Required</span>
              </div>
              <div className="etm-form-section-body">
                <div className="etm-field">
                  <label htmlFor={`${fieldId}-title`}>Task title <span aria-hidden="true">*</span></label>
                  <input id={`${fieldId}-title`} value={values.title} onChange={event => update("title", event.target.value)} placeholder="What needs to get done?" maxLength={255} required aria-invalid={!!errors.title} aria-describedby={errors.title ? `${fieldId}-title-error` : undefined} />
                  {errors.title && <p className="etm-field-error" id={`${fieldId}-title-error`}>{errors.title}</p>}
                </div>
                <fieldset className="etm-tasktype-field">
                  <legend>Task type</legend>
                  <div className="etm-tasktype-options">
                    <label className={`etm-tasktype-option ${!values.isPersonal ? "selected" : ""}`}>
                      <input type="radio" name={`${fieldId}-tasktype`} checked={!values.isPersonal} onChange={() => update("isPersonal", false)} />
                      <Folder size={15} /><span>Project task</span>
                    </label>
                    <label className={`etm-tasktype-option ${values.isPersonal ? "selected" : ""}`}>
                      <input type="radio" name={`${fieldId}-tasktype`} checked={values.isPersonal} onChange={() => setValues(current => ({ ...current, isPersonal: true, assignments: [] }))} />
                      <User size={15} /><span>Personal</span>
                    </label>
                  </div>
                </fieldset>
                <div className="etm-form-grid">
                  {values.isPersonal ? (
                    <div className="etm-field">
                      <label>Project</label>
                      <div className="etm-form-static-field"><User size={16} /><span>Personal — visible only to you</span></div>
                    </div>
                  ) : (
                    <div className="etm-field">
                      <label htmlFor={`${fieldId}-project`}>Project / Office <span aria-hidden="true">*</span></label>
                      <div className="etm-project-combobox" ref={projectPickerRef}>
                        <input id={`${fieldId}-project`} value={values.project} onFocus={() => setProjectMenuOpen(true)} onChange={event => update("project", event.target.value)} placeholder="Type a project name, or use the list…" autoComplete="off" required aria-invalid={!!errors.project} aria-describedby={errors.project ? `${fieldId}-project-error` : `${fieldId}-project-help`} role="combobox" aria-autocomplete="list" aria-expanded={projectMenuOpen} aria-controls={`${fieldId}-project-options`} onKeyDown={event => { if (event.key === "Escape") setProjectMenuOpen(false); }} />
                        <button type="button" className="etm-project-combobox-toggle" aria-label="Show project and office list" onClick={() => setProjectMenuOpen(open => !open)}><ChevronDown size={17} /></button>
                        {projectMenuOpen && <div className="etm-project-combobox-menu" id={`${fieldId}-project-options`} role="listbox">{filteredProjects.length ? filteredProjects.map(project => <button type="button" role="option" aria-selected={values.project === project.name} key={project.id} onClick={() => { update("project", project.name); setProjectMenuOpen(false); }}>{project.name}</button>) : <p>No matching office found. You can still use the name you typed.</p>}</div>}
                      </div>
                      <p className="etm-form-helper" id={`${fieldId}-project-help`}>Type any project name, or open the Office directory list to choose one.</p>
                      {errors.project && <p className="etm-field-error" id={`${fieldId}-project-error`}>{errors.project}</p>}
                    </div>
                  )}
                  <div className="etm-field">
                    <label htmlFor={`${fieldId}-date`}>Date created</label>
                    <div className="etm-form-static-field" id={`${fieldId}-date`}><CalendarDays size={16} /><span>{formatDate(task?.created_at ?? new Date().toISOString(), true)}</span><span className="etm-form-auto-label">Automatic</span></div>
                  </div>
                </div>
                <div className="etm-field">
                  <label htmlFor={`${fieldId}-details`}>Details</label>
                  <textarea id={`${fieldId}-details`} value={values.details} onChange={event => update("details", event.target.value)} placeholder="Add context, deliverables, or anything the team should know…" rows={4} maxLength={10000} />
                </div>
                <fieldset className="etm-priority-field">
                  <legend>Priority</legend>
                  <div className="etm-priority-options">{PRIORITIES.map(priority => <label key={priority} className={`etm-priority-option ${priority.toLowerCase()} ${values.priority === priority ? "selected" : ""}`}>
                    <input type="radio" name={`${fieldId}-priority`} value={priority} checked={values.priority === priority} onChange={() => update("priority", priority)} />
                    <Flag size={15} /><span>{priority}</span>{values.priority === priority && <Check size={14} className="etm-priority-check" />}
                  </label>)}</div>
                </fieldset>
              </div>
            </section>

            <section className="etm-panel etm-form-section" aria-labelledby={`${fieldId}-people-heading`}>
              <div className="etm-form-section-heading"><span className="etm-form-section-icon"><Users size={19} /></span><div><h2 id={`${fieldId}-people-heading`}>People & ownership</h2><p>{values.isPersonal ? "Personal tasks are just for you." : canManageAssignments ? "Bring the right people into the task." : "Only the owner can change who's assigned."}</p></div></div>
              <div className="etm-form-section-body">
                <div className="etm-field">
                  <label htmlFor={`${fieldId}-requestor`}>Requestor <span className="etm-form-optional">(optional)</span></label>
                  <input id={`${fieldId}-requestor`} value={values.requestor} onChange={event => update("requestor", event.target.value)} placeholder="Who requested this task?" maxLength={255} />
                </div>
                {values.isPersonal ? (
                  <div className="etm-field">
                    <label>Assigned persons</label>
                    <div className="etm-form-static-field"><User size={16} /><span>Personal task — assigned to you only</span></div>
                  </div>
                ) : (
                  <fieldset className="etm-member-field">
                    <legend>Assigned persons <span className="etm-form-count">{values.assignments.length} selected</span></legend>
                    <p className="etm-form-helper" id={`${fieldId}-people-help`}>{canManageAssignments ? "Select one or more members and give each a role. Leave empty to decide later." : "Assignment roles are managed by the task owner."}</p>
                    {values.assignments.length > 0 && <div className="etm-selected-members">{values.assignments.map(assignment => {
                      const person = roster.find(member => member.id === assignment.user);
                      const name = person ? memberName(person) : `Member #${assignment.user}`;
                      return <div className="etm-assignment-chip" key={assignment.user}>
                        <span className="etm-assignment-chip-name">{name}</span>
                        {canManageAssignments ? (
                          <div className="etm-role-toggle" role="radiogroup" aria-label={`Role for ${name}`}>
                            {ASSIGNMENT_ROLES.map(role => <button type="button" key={role} className={`etm-role-toggle-option ${assignment.role === role ? "selected" : ""}`} onClick={() => updateAssignmentRole(assignment.user, role)}>{role}</button>)}
                          </div>
                        ) : <span className="etm-badge">{assignment.role}</span>}
                        {canManageAssignments && <button type="button" onClick={() => toggleAssignment(assignment.user)} aria-label={`Remove ${name}`}><X size={13} /></button>}
                      </div>;
                    })}</div>}
                    {canManageAssignments && <div className="etm-member-picker">
                      <div className="etm-member-search"><Search size={16} /><input aria-label="Search members to assign" placeholder="Search team members…" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} aria-describedby={`${fieldId}-people-help`} /></div>
                      <div className="etm-member-options">
                        {filteredMembers.map(member => <label key={member.id} className={`etm-member-option ${values.assignments.some(a => a.user === member.id) ? "selected" : ""}`}>
                          <input type="checkbox" checked={values.assignments.some(a => a.user === member.id)} onChange={() => toggleAssignment(member.id)} />
                          <span className="etm-member-initials" aria-hidden="true">{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</span>
                          <span className="etm-member-option-name">{memberName(member)}{member.position && <small>{member.position}</small>}</span>
                        </label>)}
                        {!filteredMembers.length && <p className="etm-member-empty">{memberSearch ? "No members match your search." : "No team members available. You can assign this task later."}</p>}
                      </div>
                      {!addingMember ? (
                        <button type="button" className="etm-inline-link-button etm-add-member-trigger" onClick={openAddMember}><UserPlus size={13} />Not in the list? Add a new user</button>
                      ) : (
                        <div className="etm-add-member-form">
                          <div className="etm-add-member-form-heading"><UserPlus size={14} />Add a new user<button type="button" className="etm-icon-button" aria-label="Cancel adding user" onClick={() => { setAddingMember(false); setMemberError(""); }}><X size={14} /></button></div>
                          <div className="etm-add-member-form-grid">
                            <input value={newMember.first_name} onChange={event => setNewMember(current => ({ ...current, first_name: event.target.value }))} placeholder="First name" maxLength={255} aria-label="New user first name" disabled={memberSaving} />
                            <input value={newMember.last_name} onChange={event => setNewMember(current => ({ ...current, last_name: event.target.value }))} placeholder="Last name" maxLength={255} aria-label="New user last name" disabled={memberSaving} />
                            <input type="email" value={newMember.email} onChange={event => setNewMember(current => ({ ...current, email: event.target.value }))} placeholder="Email address" maxLength={255} aria-label="New user email" disabled={memberSaving} />
                            <input value={newMember.position} onChange={event => setNewMember(current => ({ ...current, position: event.target.value }))} placeholder="Position (optional)" maxLength={255} aria-label="New user position" disabled={memberSaving} />
                          </div>
                          {memberError && <p className="etm-field-error" role="alert">{memberError}</p>}
                          <button type="button" className="etm-button primary small" disabled={memberSaving} onClick={() => void handleAddMember()}>{memberSaving ? <Loader2 size={13} className="etm-form-spinner" /> : <UserPlus size={13} />}Create & assign</button>
                        </div>
                      )}
                    </div>}
                  </fieldset>
                )}
              </div>
            </section>

            <section className="etm-panel etm-form-section" aria-labelledby={`${fieldId}-subtasks-heading`}>
              <div className="etm-form-section-heading"><span className="etm-form-section-icon"><CheckCheck size={19} /></span><div><h2 id={`${fieldId}-subtasks-heading`}>Subtasks <span className="etm-form-optional">(optional)</span> <span className="etm-form-count">{values.subtasks.length}</span></h2><p>Add them now, or let the creator or assignees add them later.</p></div>{values.subtasks.length > 0 && <span className="etm-subtask-summary">{completedSubtasks}/{values.subtasks.length} done</span>}</div>
              <div className="etm-form-section-body">
                {values.subtasks.length === 0 && <div className="etm-subtask-empty"><CheckCheck size={23} /><span>No subtasks yet. Add the first step below.</span></div>}
                <div className="etm-subtask-editor">{values.subtasks.map((subtask, index) => <div className="etm-subtask-editor-item" key={subtask.localKey}>
                  <div className={`etm-subtask-input-row ${subtask.is_completed ? "completed" : ""}`}>
                    <input type="checkbox" checked={subtask.is_completed} onChange={event => updateSubtask(subtask.localKey, { is_completed: event.target.checked })} aria-label={`Mark subtask ${index + 1} complete`} />
                    <input type="text" data-subtask-key={subtask.localKey} value={subtask.title} onChange={event => updateSubtask(subtask.localKey, { title: event.target.value })} placeholder={`Subtask ${index + 1}`} aria-label={`Subtask ${index + 1} title`} maxLength={255} aria-invalid={!!errors[subtask.localKey]} aria-describedby={errors[subtask.localKey] ? `${fieldId}-${subtask.localKey}-error` : undefined} />
                    <button className="etm-icon-button" type="button" aria-label={`Remove subtask ${index + 1}`} onClick={() => update("subtasks", values.subtasks.filter(item => item.localKey !== subtask.localKey))}><Trash2 size={16} /></button>
                  </div>
                  {errors[subtask.localKey] && <p className="etm-field-error" id={`${fieldId}-${subtask.localKey}-error`}>{errors[subtask.localKey]}</p>}
                  <textarea className="etm-subtask-description" value={subtask.description} onChange={event => updateSubtask(subtask.localKey, { description: event.target.value })} placeholder="Add a short description for this subtask (optional)…" aria-label={`Subtask ${index + 1} description`} rows={2} maxLength={2000} />
                </div>)}</div>
                <button type="button" className="etm-add-subtask" onClick={addSubtask}><Plus size={16} /> Add subtask</button>
              </div>
            </section>
          </div>

          <aside className="etm-form-aside">
            <section className="etm-panel etm-form-section mt-2" aria-labelledby={`${fieldId}-planning-heading`}>
              <div className="etm-form-section-heading"><span className="etm-form-section-icon"><CalendarDays size={19} /></span><div><h2 id={`${fieldId}-planning-heading`}>Schedule & status</h2><p>Keep the work on track.</p></div></div>
              <div className="etm-form-section-body">
                <div className="etm-field">
                  <label htmlFor={`${fieldId}-deadline`}>Deadline <span aria-hidden="true">*</span></label>
                  <input type="date" id={`${fieldId}-deadline`} value={values.deadline ?? ""} onChange={event => update("deadline", event.target.value)} required aria-invalid={!!errors.deadline} aria-describedby={errors.deadline ? `${fieldId}-deadline-error` : undefined} />
                  {errors.deadline && <p className="etm-field-error" id={`${fieldId}-deadline-error`}>{errors.deadline}</p>}
                </div>
                {task ? (
                  <>
                    <div className="etm-field">
                      <label htmlFor={`${fieldId}-status`}>Status</label>
                      <select id={`${fieldId}-status`} value={values.status} onChange={event => updateStatus(event.target.value as TaskStatus)} aria-invalid={!!errors.status} aria-describedby={errors.status ? `${fieldId}-status-error` : undefined}>{STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select>
                      {errors.status && <p className="etm-field-error" id={`${fieldId}-status-error`}>{errors.status}</p>}
                    </div>
                    {values.status === "Completed" && incompleteSubtasks > 0 && <div className="etm-subtask-completion-warning" role="alert"><AlertTriangle size={17} /><span><strong>{incompleteSubtasks} subtask{incompleteSubtasks === 1 ? "" : "s"} still incomplete.</strong> Complete every subtask before completing this task.</span></div>}
                    <label className={`etm-completion-control ${values.is_completed ? "checked" : ""}`}>
                      <input type="checkbox" checked={values.is_completed} onChange={event => updateStatus(event.target.checked ? "Completed" : "Ongoing")} />
                      <span><strong>Mark task as completed</strong><small>Completed tasks appear crossed out in your task list.</small></span>
                    </label>
                  </>
                ) : (
                  <p className="etm-form-helper">New tasks start as <strong>Pending</strong>. You can update the status, mark it complete, and add progress once it's created.</p>
                )}
              </div>
            </section>

            {task && <section className="etm-panel etm-form-section" aria-labelledby={`${fieldId}-progress-heading`}>
              <div className="etm-form-section-heading"><span className="etm-form-section-icon"><Clock3 size={19} /></span><div><h2 id={`${fieldId}-progress-heading`}>Progress log</h2><p>Every update tells the story.</p></div></div>
              <div className="etm-form-section-body">
                <div className="etm-progress-timestamp"><span>Last progress update</span><strong>{task.latest_progress_at ? formatDate(task.latest_progress_at, true) : "No updates yet"}</strong></div>
                <div className="etm-field">
                  <label htmlFor={`${fieldId}-progress`}>Add a progress update <span className="etm-form-optional">(optional)</span></label>
                  <textarea id={`${fieldId}-progress`} value={values.progress_message} onChange={event => update("progress_message", event.target.value)} placeholder="What’s the latest on this task?" rows={4} maxLength={5000} />
                  <p className="etm-form-helper">The date and time are recorded automatically when you save.</p>
                </div>
              </div>
            </section>}
            <TaskLivePreview values={values} members={roster} />
          </aside>
        </div>
      </fieldset>
      {error && <div className="etm-form-error-banner" role="alert">{error}</div>}
      <div className="etm-form-footer"><span>Your team’s next step starts here.</span><div><button className="etm-button ghost" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="etm-button primary" type="submit" disabled={saving}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <Check size={17} />}{saving ? "Saving task…" : task ? "Save changes" : "Create task"}</button></div></div>
    </form>
  );
}

export default function TaskForm(props: TaskFormProps) {
  return <TaskFormContent key={props.task?.id ?? "new"} {...props} />;
}
