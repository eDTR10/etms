import { useId, useRef, useState, type FormEvent } from "react";
import { Bookmark, Check, CheckCheck, ChevronDown, Flag, Folder, Loader2, MapPin, Plus, Search, Trash2, User, Users, X } from "lucide-react";
import { taskError } from "./taskService";
import { ASSIGNMENT_ROLES, memberName, PRIORITIES, type AssignmentRole, type Member, type Priority, type Project, type TaskTemplate, type TaskTemplateInput, type TemplateSubtask } from "./types";
import { REGION_X_BARANGAYS, REGION_X_CITIES, REGION_X_PROVINCES } from "./regionXLocations";
import { addChildToSubtaskTree, flattenTree, mapSubtaskTree, removeFromSubtaskTree } from "./subtaskTree";
import "./forms.css";

const PRIORITY_NOTES: Record<Priority, string> = {
  Low: "Delegate (Urgent & Not Important)",
  Medium: "Schedule (Important & Not Urgent)",
  High: "Do First (Urgent & Important)",
};

interface TemplateFormProps {
  template?: TaskTemplate;
  members: Member[];
  projects: Project[];
  onSave: (input: TaskTemplateInput) => Promise<void>;
  onCancel: () => void;
}

type EditableTemplateSubtask = Omit<TemplateSubtask, "subtasks"> & { localKey: string; subtasks: EditableTemplateSubtask[] };
type FormValues = Omit<TaskTemplateInput, "subtasks" | "project"> & {
  subtasks: EditableTemplateSubtask[];
  project: string;
};
type FormErrors = Record<string, string>;

let editableTemplateSubtaskSeed = 0;
function toEditableTemplateSubtasks(subtasks: TemplateSubtask[]): EditableTemplateSubtask[] {
  return subtasks.map(subtask => ({
    ...subtask,
    localKey: `existing-${editableTemplateSubtaskSeed++}`,
    subtasks: toEditableTemplateSubtasks(subtask.subtasks ?? []),
  }));
}

function serializeTemplateSubtasks(subtasks: EditableTemplateSubtask[]): TemplateSubtask[] {
  return subtasks.map(({ title, description, subtasks: children }) => ({
    title: title.trim(),
    description: description.trim(),
    subtasks: serializeTemplateSubtasks(children),
  }));
}

function initialValues(template?: TaskTemplate): FormValues {
  return {
    name: template?.name ?? "",
    title: template?.title ?? "",
    is_personal: template?.is_personal ?? false,
    project: template?.project ?? "",
    details: template?.details ?? "",
    requestor: template?.requestor ?? "",
    location_province: template?.location_province ?? "",
    location_city: template?.location_city ?? "",
    location_barangay: template?.location_barangay ?? "",
    priority: template?.priority ?? "Medium",
    subtasks: toEditableTemplateSubtasks(template?.subtasks ?? []),
    assignments: template?.assignments ?? [],
  };
}

function TemplateSubtaskEditorRow({ subtask, index, fieldId, errors, onUpdate, onRemove, onAddChild }: {
  subtask: EditableTemplateSubtask; index: number; fieldId: string; errors: FormErrors;
  onUpdate: (localKey: string, change: Partial<Pick<TemplateSubtask, "title" | "description">>) => void;
  onRemove: (localKey: string) => void;
  onAddChild: (parentKey: string) => void;
}) {
  return (
    <div className="etm-subtask-editor-item">
      <div className="etm-subtask-input-row">
        <input type="text" data-subtask-key={subtask.localKey} value={subtask.title} onChange={event => onUpdate(subtask.localKey, { title: event.target.value })} placeholder={`Subtask ${index + 1}`} aria-label={`Subtask ${index + 1} title`} maxLength={255} aria-invalid={!!errors[subtask.localKey]} />
        <button className="etm-icon-button" type="button" aria-label={`Add a subtask under "${subtask.title || `subtask ${index + 1}`}"`} title="Add subtask" onClick={() => onAddChild(subtask.localKey)}><Plus size={16} /></button>
        <button className="etm-icon-button" type="button" aria-label={`Remove subtask ${index + 1}`} onClick={() => onRemove(subtask.localKey)}><Trash2 size={16} /></button>
      </div>
      {errors[subtask.localKey] && <p className="etm-field-error">{errors[subtask.localKey]}</p>}
      <textarea className="etm-subtask-description" value={subtask.description} onChange={event => onUpdate(subtask.localKey, { description: event.target.value })} placeholder="Add a short description for this subtask (optional)…" aria-label={`Subtask ${index + 1} description`} rows={2} maxLength={2000} />
      {subtask.subtasks.length > 0 && (
        <div className="etm-subtask-children">
          {subtask.subtasks.map((child, childIndex) => (
            <TemplateSubtaskEditorRow key={child.localKey} subtask={child} index={childIndex} fieldId={fieldId} errors={errors} onUpdate={onUpdate} onRemove={onRemove} onAddChild={onAddChild} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TemplateForm({ template, members, projects, onSave, onCancel }: TemplateFormProps) {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const nextSubtask = useRef(0);
  const [values, setValues] = useState<FormValues>(() => initialValues(template));
  const [errors, setErrors] = useState<FormErrors>({});
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredProjects = projects.filter(project => project.name.toLocaleLowerCase().includes(values.project.trim().toLocaleLowerCase()));
  const filteredMembers = members.filter(member => `${memberName(member)} ${member.position ?? ""}`.toLowerCase().includes(memberSearch.trim().toLowerCase()));
  const allSubtasks = flattenTree(values.subtasks);

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [field]: value }));
    if (errors[field as string]) setErrors(current => ({ ...current, [field as string]: "" }));
  }

  function updateSubtask(localKey: string, change: Partial<Pick<TemplateSubtask, "title" | "description">>) {
    setValues(current => ({ ...current, subtasks: mapSubtaskTree(current.subtasks, localKey, subtask => ({ ...subtask, ...change })) }));
    if (errors[localKey]) setErrors(current => ({ ...current, [localKey]: "" }));
  }

  function removeSubtask(localKey: string) {
    setValues(current => ({ ...current, subtasks: removeFromSubtaskTree(current.subtasks, localKey) }));
  }

  function addSubtask(parentKey: string | null = null) {
    const localKey = `new-${nextSubtask.current++}`;
    setValues(current => ({ ...current, subtasks: addChildToSubtaskTree(current.subtasks, parentKey, { localKey, title: "", description: "", subtasks: [] }) }));
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>(`[data-subtask-key="${localKey}"]`)?.focus());
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextErrors: FormErrors = {};
    if (!values.name.trim()) nextErrors.name = "Give this template a name.";
    if (!values.is_personal && !values.project.trim()) nextErrors.project = "Enter or select a project, or mark this as a personal task template.";
    allSubtasks.forEach(subtask => {
      if (!subtask.title.trim()) nextErrors[subtask.localKey] = "Add a subtask title, or remove this row.";
    });
    setErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    try {
      const { project, ...rest } = values;
      await onSave({
        ...rest,
        name: values.name.trim(),
        title: values.title.trim(),
        project: values.is_personal ? "" : project.trim(),
        details: values.details.trim(),
        requestor: values.requestor.trim(),
        location_province: values.location_province.trim(),
        location_city: values.location_city.trim(),
        location_barangay: values.location_barangay.trim(),
        subtasks: serializeTemplateSubtasks(values.subtasks),
      });
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="etm-task-form" onSubmit={handleSubmit} ref={formRef} noValidate aria-busy={saving}>
      <fieldset className="etm-form-fieldset" disabled={saving}>
        <div className="etm-form-section-body" style={{ padding: 0 }}>
          <div className="etm-field">
            <label htmlFor={`${fieldId}-name`}>Template name <span aria-hidden="true">*</span></label>
            <input id={`${fieldId}-name`} value={values.name} onChange={event => update("name", event.target.value)} placeholder="e.g. Weekly status report" maxLength={255} required aria-invalid={!!errors.name} aria-describedby={errors.name ? `${fieldId}-name-error` : `${fieldId}-name-help`} />
            <p className="etm-form-helper" id={`${fieldId}-name-help`}>Only you will see this name when choosing a template.</p>
            {errors.name && <p className="etm-field-error" id={`${fieldId}-name-error`}>{errors.name}</p>}
          </div>

          <div className="etm-field">
            <label htmlFor={`${fieldId}-title`}>Default task title <span className="etm-form-optional">(optional)</span></label>
            <input id={`${fieldId}-title`} value={values.title} onChange={event => update("title", event.target.value)} placeholder="Pre-fill the task title, or leave blank" maxLength={255} />
          </div>

          <fieldset className="etm-tasktype-field">
            <legend>Task type</legend>
            <div className="etm-tasktype-options">
              <label className={`etm-tasktype-option ${!values.is_personal ? "selected" : ""}`}>
                <input type="radio" name={`${fieldId}-tasktype`} checked={!values.is_personal} onChange={() => update("is_personal", false)} />
                <Folder size={15} /><span>Project task</span>
              </label>
              <label className={`etm-tasktype-option ${values.is_personal ? "selected" : ""}`}>
                <input type="radio" name={`${fieldId}-tasktype`} checked={values.is_personal} onChange={() => setValues(current => ({ ...current, is_personal: true, assignments: [] }))} />
                <User size={15} /><span>Personal</span>
              </label>
            </div>
          </fieldset>

          {!values.is_personal && (
            <div className="etm-field">
              <label htmlFor={`${fieldId}-project`}>Project / Office <span aria-hidden="true">*</span></label>
              <div className="etm-project-combobox" ref={projectPickerRef}>
                <input id={`${fieldId}-project`} value={values.project} onFocus={() => setProjectMenuOpen(true)} onChange={event => update("project", event.target.value)} placeholder="Type a project name, or use the list…" autoComplete="off" required aria-invalid={!!errors.project} aria-describedby={errors.project ? `${fieldId}-project-error` : undefined} role="combobox" aria-autocomplete="list" aria-expanded={projectMenuOpen} onKeyDown={event => { if (event.key === "Escape") setProjectMenuOpen(false); }} onBlur={() => window.setTimeout(() => setProjectMenuOpen(false), 120)} />
                <button type="button" className="etm-project-combobox-toggle" aria-label="Show project and office list" onClick={() => setProjectMenuOpen(open => !open)}><ChevronDown size={17} /></button>
                {projectMenuOpen && <div className="etm-project-combobox-menu" role="listbox">{filteredProjects.length ? filteredProjects.map(project => <button type="button" role="option" aria-selected={values.project === project.name} key={project.id} onMouseDown={event => event.preventDefault()} onClick={() => { update("project", project.name); setProjectMenuOpen(false); }}>{project.name}</button>) : <p>No matching office found. You can still use the name you typed.</p>}</div>}
              </div>
              {errors.project && <p className="etm-field-error" id={`${fieldId}-project-error`}>{errors.project}</p>}
            </div>
          )}

          <div className="etm-field">
            <label htmlFor={`${fieldId}-details`}>Details</label>
            <textarea id={`${fieldId}-details`} value={values.details} onChange={event => update("details", event.target.value)} placeholder="Add context, deliverables, or anything the team should know…" rows={4} maxLength={10000} />
          </div>

          <div className="etm-field">
            <label htmlFor={`${fieldId}-requestor`}>Requestor <span className="etm-form-optional">(optional)</span></label>
            <input id={`${fieldId}-requestor`} value={values.requestor} onChange={event => update("requestor", event.target.value)} placeholder="Who usually requests this?" maxLength={255} />
          </div>

          <fieldset className="etm-location-field">
            <legend><MapPin size={15} /> Location <span className="etm-form-optional">(optional)</span></legend>
            <p className="etm-form-helper">Choose Region X suggestions, or type a city or barangay that is not listed.</p>
            <div className="etm-location-grid">
              <label htmlFor={`${fieldId}-province`}>Province
                <select id={`${fieldId}-province`} value={values.location_province} onChange={event => setValues(current => ({ ...current, location_province: event.target.value, location_city: "", location_barangay: "" }))}>
                  <option value="">Select a Region X province</option>
                  {REGION_X_PROVINCES.map(province => <option key={province} value={province}>{province}</option>)}
                </select>
              </label>
              <label htmlFor={`${fieldId}-city`}>City / Municipality
                <input id={`${fieldId}-city`} list={`${fieldId}-city-options`} value={values.location_city} onChange={event => update("location_city", event.target.value)} placeholder={values.location_province ? "Search or type a city" : "Select a province first"} disabled={!values.location_province} maxLength={100} />
                <datalist id={`${fieldId}-city-options`}>{(REGION_X_CITIES[values.location_province] ?? []).map(city => <option key={city} value={city} />)}</datalist>
              </label>
              <label htmlFor={`${fieldId}-barangay`}>Barangay
                <input id={`${fieldId}-barangay`} list={`${fieldId}-barangay-options`} value={values.location_barangay} onChange={event => update("location_barangay", event.target.value)} placeholder="Search or type a barangay" maxLength={100} />
                <datalist id={`${fieldId}-barangay-options`}>{(REGION_X_BARANGAYS[values.location_city] ?? []).map(barangay => <option key={barangay} value={barangay} />)}</datalist>
              </label>
            </div>
          </fieldset>

          {!values.is_personal && (
            <fieldset className="etm-member-field">
              <legend><Users size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />Default assignees <span className="etm-form-count">{values.assignments.length} selected</span></legend>
              <p className="etm-form-helper">Prefill who's usually assigned to this kind of task — still editable before the task is saved.</p>
              {values.assignments.length > 0 && <div className="etm-selected-members">{values.assignments.map(assignment => {
                const person = members.find(member => member.id === assignment.user);
                const name = person ? memberName(person) : `Member #${assignment.user}`;
                return <div className="etm-assignment-chip" key={assignment.user}>
                  <span className="etm-assignment-chip-name">{name}</span>
                  <div className="etm-role-toggle" role="radiogroup" aria-label={`Role for ${name}`}>
                    {ASSIGNMENT_ROLES.map(role => <button type="button" key={role} className={`etm-role-toggle-option ${assignment.role === role ? "selected" : ""}`} onClick={() => updateAssignmentRole(assignment.user, role)}>{role}</button>)}
                  </div>
                  <button type="button" onClick={() => toggleAssignment(assignment.user)} aria-label={`Remove ${name}`}><X size={13} /></button>
                </div>;
              })}</div>}
              <div className="etm-member-picker">
                <div className="etm-member-search"><Search size={16} /><input aria-label="Search members to assign" placeholder="Search team members…" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} /></div>
                <div className="etm-member-options">
                  {filteredMembers.map(member => <label key={member.id} className={`etm-member-option ${values.assignments.some(a => a.user === member.id) ? "selected" : ""}`}>
                    <input type="checkbox" checked={values.assignments.some(a => a.user === member.id)} onChange={() => toggleAssignment(member.id)} />
                    <span className="etm-member-initials" aria-hidden="true">{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</span>
                    <span className="etm-member-option-name">{memberName(member)}{member.position && <small>{member.position}</small>}</span>
                  </label>)}
                  {!filteredMembers.length && <p className="etm-member-empty">{memberSearch ? "No members match your search." : "No team members available."}</p>}
                </div>
              </div>
            </fieldset>
          )}

          <fieldset className="etm-priority-field">
            <legend>Default priority</legend>
            <div className="etm-priority-options">{PRIORITIES.map(priority => <label key={priority} className={`etm-priority-option ${priority.toLowerCase()} ${values.priority === priority ? "selected" : ""}`}>
              <input type="radio" name={`${fieldId}-priority`} value={priority} checked={values.priority === priority} onChange={() => update("priority", priority)} />
              <span className="etm-priority-option-top"><Flag size={15} /><span>{priority}</span>{values.priority === priority && <Check size={14} className="etm-priority-check" />}</span>
              <small className="etm-priority-note">{PRIORITY_NOTES[priority]}</small>
            </label>)}</div>
          </fieldset>

          <div className="etm-field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><CheckCheck size={16} /> Subtasks <span className="etm-form-optional">(optional)</span></label>
            {allSubtasks.length === 0 && <div className="etm-subtask-empty"><CheckCheck size={23} /><span>No subtasks yet. Add the first step below.</span></div>}
            <div className="etm-subtask-editor">{values.subtasks.map((subtask, index) => (
              <TemplateSubtaskEditorRow key={subtask.localKey} subtask={subtask} index={index} fieldId={fieldId} errors={errors} onUpdate={updateSubtask} onRemove={removeSubtask} onAddChild={addSubtask} />
            ))}</div>
            <button type="button" className="etm-add-subtask" onClick={() => addSubtask(null)}><Plus size={16} /> Add subtask</button>
          </div>
        </div>
      </fieldset>
      {error && <div className="etm-form-error-banner" role="alert">{error}</div>}
      <div className="etm-form-footer"><span>Reuse this whenever you create a similar task.</span><div><button className="etm-button ghost" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="etm-button primary" type="submit" disabled={saving}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <Bookmark size={17} />}{saving ? "Saving template…" : template ? "Save changes" : "Save template"}</button></div></div>
    </form>
  );
}
