import { useId, useRef, useState, type FormEvent } from "react";
import { Bookmark, CheckCheck, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { taskError } from "./taskService";
import { useTasks } from "./taskContext";
import type { DtmsDocumentTemplate } from "../dtmsDocument/dtmsDocumentTypes";
import type { Member, Project, TaskTemplate, TaskTemplateInput, TemplateSubtask } from "./types";
import { addChildToSubtaskTree, flattenTree, mapSubtaskTree, removeFromSubtaskTree } from "./subtaskTree";
import "./forms.css";

interface TemplateFormProps {
  template?: TaskTemplate;
  // Prefills the form from an imported file without treating it as an edit of an
  // existing template — onSave still creates a new one. Ignored when `template` is set.
  initialInput?: TaskTemplateInput;
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
  return subtasks.map(({ title, description, default_document_template, subtasks: children }) => ({
    title: title.trim(),
    description: description.trim(),
    default_document_template: default_document_template ?? null,
    subtasks: serializeTemplateSubtasks(children),
  }));
}

function initialValues(template?: TaskTemplate, initialInput?: TaskTemplateInput): FormValues {
  const source = template ?? initialInput;
  return {
    name: source?.name ?? "",
    title: source?.title ?? "",
    is_personal: source?.is_personal ?? true,
    project: source?.project ?? "",
    details: source?.details ?? "",
    requestor: source?.requestor ?? "",
    location_province: source?.location_province ?? "",
    location_city: source?.location_city ?? "",
    location_barangay: source?.location_barangay ?? "",
    priority: source?.priority ?? "Medium",
    subtasks: toEditableTemplateSubtasks(source?.subtasks ?? []),
    assignments: template?.assignments ?? [],
  };
}

function TemplateSubtaskEditorRow({ subtask, index, fieldId, errors, docTemplates, onUpdate, onRemove, onAddChild }: {
  subtask: EditableTemplateSubtask; index: number; fieldId: string; errors: FormErrors; docTemplates: DtmsDocumentTemplate[];
  onUpdate: (localKey: string, change: Partial<Pick<TemplateSubtask, "title" | "description" | "default_document_template">>) => void;
  onRemove: (localKey: string) => void;
  onAddChild: (parentKey: string) => void;
}) {
  const docTemplateOptions: SelectOption<number | "">[] = [
    { value: "", label: "No document" },
    ...docTemplates.map(docTemplate => ({ value: docTemplate.id, label: docTemplate.name })),
  ];
  return (
    <div className="etm-subtask-editor-item">
      <div className="etm-subtask-input-row">
        <span className="etm-subtask-index" aria-hidden="true">{index + 1}</span>
        <input type="text" data-subtask-key={subtask.localKey} value={subtask.title} onChange={event => onUpdate(subtask.localKey, { title: event.target.value })} placeholder={`Subtask ${index + 1}`} aria-label={`Subtask ${index + 1} title`} maxLength={255} aria-invalid={!!errors[subtask.localKey]} />
        <button className="etm-icon-button" type="button" aria-label={`Add a subtask under "${subtask.title || `subtask ${index + 1}`}"`} title="Add subtask" onClick={() => onAddChild(subtask.localKey)}><Plus size={16} /></button>
        <button className="etm-icon-button" type="button" aria-label={`Remove subtask ${index + 1}`} onClick={() => onRemove(subtask.localKey)}><Trash2 size={16} /></button>
      </div>
      {errors[subtask.localKey] && <p className="etm-field-error">{errors[subtask.localKey]}</p>}
      <textarea className="etm-subtask-description" value={subtask.description} onChange={event => onUpdate(subtask.localKey, { description: event.target.value })} placeholder="Add a short description for this subtask (optional)…" aria-label={`Subtask ${index + 1} description`} rows={2} maxLength={2000} />
      {docTemplates.length > 0 && (
        <div className={`etm-subtask-doc-picker ${subtask.default_document_template ? "has-value" : ""}`}>
          <span className="etm-subtask-doc-picker-label"><FileText size={13} />Document</span>
          <div style={{ flex: 1, minWidth: 0, maxWidth: 240 }}>
            <ThemedSelect<SelectOption<number | "">>
              size="small"
              classNamePrefix="etm-subtask-doc-select"
              isSearchable
              aria-label={`Default document template for subtask ${index + 1}`}
              options={docTemplateOptions}
              value={docTemplateOptions.find(option => option.value === (subtask.default_document_template ?? "")) ?? docTemplateOptions[0]}
              onChange={option => onUpdate(subtask.localKey, { default_document_template: option && option.value !== "" ? option.value : null })}
            />
          </div>
        </div>
      )}
      {subtask.subtasks.length > 0 && (
        <div className="etm-subtask-children">
          {subtask.subtasks.map((child, childIndex) => (
            <TemplateSubtaskEditorRow key={child.localKey} subtask={child} index={childIndex} fieldId={fieldId} errors={errors} docTemplates={docTemplates} onUpdate={onUpdate} onRemove={onRemove} onAddChild={onAddChild} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TemplateForm({ template, initialInput, onSave, onCancel }: TemplateFormProps) {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const nextSubtask = useRef(0);
  const { dtmsDocumentTemplates: docTemplates } = useTasks();
  const [values, setValues] = useState<FormValues>(() => initialValues(template, initialInput));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const allSubtasks = flattenTree(values.subtasks);

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [field]: value }));
    if (errors[field as string]) setErrors(current => ({ ...current, [field as string]: "" }));
  }

  function updateSubtask(localKey: string, change: Partial<Pick<TemplateSubtask, "title" | "description" | "default_document_template">>) {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextErrors: FormErrors = {};
    if (!values.name.trim()) nextErrors.name = "Give this template a name.";
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

          <div className="etm-field">
            <label htmlFor={`${fieldId}-details`}>Details</label>
            <textarea id={`${fieldId}-details`} value={values.details} onChange={event => update("details", event.target.value)} placeholder="Add context, deliverables, or anything the team should know…" rows={4} maxLength={10000} />
          </div>

          <div className="etm-field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><CheckCheck size={16} /> Subtasks <span className="etm-form-optional">(optional)</span></label>
            {allSubtasks.length === 0 && <div className="etm-subtask-empty"><CheckCheck size={23} /><span>No subtasks yet. Add the first step below.</span></div>}
            <div className="etm-subtask-editor">{values.subtasks.map((subtask, index) => (
              <TemplateSubtaskEditorRow key={subtask.localKey} subtask={subtask} index={index} fieldId={fieldId} errors={errors} docTemplates={docTemplates} onUpdate={updateSubtask} onRemove={removeSubtask} onAddChild={addSubtask} />
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
