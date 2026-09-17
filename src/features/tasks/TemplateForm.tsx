import { useId, useRef, useState, type FormEvent } from "react";
import { Bookmark, Check, CheckCheck, ChevronDown, Flag, Folder, Loader2, MapPin, Plus, Trash2, User } from "lucide-react";
import { taskError } from "./taskService";
import { PRIORITIES, type Priority, type Project, type TaskTemplate, type TaskTemplateInput, type TemplateSubtask } from "./types";
import { REGION_X_BARANGAYS, REGION_X_CITIES, REGION_X_PROVINCES } from "./regionXLocations";
import "./forms.css";

const PRIORITY_NOTES: Record<Priority, string> = {
  Low: "Delegate (Urgent & Not Important)",
  Medium: "Schedule (Important & Not Urgent)",
  High: "Do First (Urgent & Important)",
};

interface TemplateFormProps {
  template?: TaskTemplate;
  projects: Project[];
  onSave: (input: TaskTemplateInput) => Promise<void>;
  onCancel: () => void;
}

type EditableTemplateSubtask = TemplateSubtask & { localKey: string };
type FormValues = Omit<TaskTemplateInput, "subtasks" | "project"> & {
  subtasks: EditableTemplateSubtask[];
  project: string;
};
type FormErrors = Record<string, string>;

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
    subtasks: (template?.subtasks ?? []).map((subtask, index) => ({ ...subtask, localKey: `existing-${index}` })),
  };
}

export default function TemplateForm({ template, projects, onSave, onCancel }: TemplateFormProps) {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const nextSubtask = useRef(0);
  const [values, setValues] = useState<FormValues>(() => initialValues(template));
  const [errors, setErrors] = useState<FormErrors>({});
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredProjects = projects.filter(project => project.name.toLocaleLowerCase().includes(values.project.trim().toLocaleLowerCase()));

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [field]: value }));
    if (errors[field as string]) setErrors(current => ({ ...current, [field as string]: "" }));
  }

  function updateSubtask(localKey: string, change: Partial<TemplateSubtask>) {
    setValues(current => ({ ...current, subtasks: current.subtasks.map(subtask => subtask.localKey === localKey ? { ...subtask, ...change } : subtask) }));
    if (errors[localKey]) setErrors(current => ({ ...current, [localKey]: "" }));
  }

  function addSubtask() {
    const localKey = `new-${nextSubtask.current++}`;
    setValues(current => ({ ...current, subtasks: [...current.subtasks, { localKey, title: "", description: "" }] }));
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>(`[data-subtask-key="${localKey}"]`)?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextErrors: FormErrors = {};
    if (!values.name.trim()) nextErrors.name = "Give this template a name.";
    if (!values.is_personal && !values.project.trim()) nextErrors.project = "Enter or select a project, or mark this as a personal task template.";
    values.subtasks.forEach(subtask => {
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
        subtasks: values.subtasks.map(({ title, description }) => ({ title: title.trim(), description: description.trim() })),
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
                <input type="radio" name={`${fieldId}-tasktype`} checked={values.is_personal} onChange={() => update("is_personal", true)} />
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
            {values.subtasks.length === 0 && <div className="etm-subtask-empty"><CheckCheck size={23} /><span>No subtasks yet. Add the first step below.</span></div>}
            <div className="etm-subtask-editor">{values.subtasks.map((subtask, index) => <div className="etm-subtask-editor-item" key={subtask.localKey}>
              <div className="etm-subtask-input-row">
                <input type="text" data-subtask-key={subtask.localKey} value={subtask.title} onChange={event => updateSubtask(subtask.localKey, { title: event.target.value })} placeholder={`Subtask ${index + 1}`} aria-label={`Subtask ${index + 1} title`} maxLength={255} aria-invalid={!!errors[subtask.localKey]} />
                <button className="etm-icon-button" type="button" aria-label={`Remove subtask ${index + 1}`} onClick={() => update("subtasks", values.subtasks.filter(item => item.localKey !== subtask.localKey))}><Trash2 size={16} /></button>
              </div>
              {errors[subtask.localKey] && <p className="etm-field-error">{errors[subtask.localKey]}</p>}
              <textarea className="etm-subtask-description" value={subtask.description} onChange={event => updateSubtask(subtask.localKey, { description: event.target.value })} placeholder="Add a short description for this subtask (optional)…" aria-label={`Subtask ${index + 1} description`} rows={2} maxLength={2000} />
            </div>)}</div>
            <button type="button" className="etm-add-subtask" onClick={addSubtask}><Plus size={16} /> Add subtask</button>
          </div>
        </div>
      </fieldset>
      {error && <div className="etm-form-error-banner" role="alert">{error}</div>}
      <div className="etm-form-footer"><span>Reuse this whenever you create a similar task.</span><div><button className="etm-button ghost" type="button" disabled={saving} onClick={onCancel}>Cancel</button><button className="etm-button primary" type="submit" disabled={saving}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <Bookmark size={17} />}{saving ? "Saving template…" : template ? "Save changes" : "Save template"}</button></div></div>
    </form>
  );
}
