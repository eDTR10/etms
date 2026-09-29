import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Link2, Link2Off, Loader2, Paperclip, Plus, Save, Search, Trash2 } from "lucide-react";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import { useAuth } from "../../screens/Auth/AuthContext";
import { useTasks } from "../tasks/taskContext";
import { taskError } from "../tasks/taskService";
import { dtmsDocumentService } from "./dtmsDocumentService";
import PeopleMultiSelect from "./PeopleMultiSelect";
import type { DtmsDocumentTemplate, DtmsFieldValue, DtmsSignatoryUser, DtmsTemplateFormField, EditableSignatoryEntry } from "./dtmsDocumentTypes";
import { getPeopleAttrValue, getTransformedValue, isFieldVisible, normalizeSignatoryOrders, resolveAutofill, routingStepsToSignatories, templateIncompatibilityReason } from "./dtmsDocumentUtils";
import "../tasks/forms.css";

interface CreateDocumentFormProps {
  defaultTitle: string;
  // A document template id to pre-select, e.g. from the subtask's own
  // default_document_template hint (set when it was created from a Task Template). Ignored
  // if that template can't be found or isn't supported here — the picker just starts blank.
  initialTemplateId?: number | null;
  onCreated: (tracknumber: string) => Promise<void>;
  onCancel: () => void;
}

let signatorySeed = 0;
function withLocalKey(entries: Omit<EditableSignatoryEntry, "localKey">[]): EditableSignatoryEntry[] {
  return entries.map(entry => ({ ...entry, localKey: `sig-${signatorySeed++}` }));
}

interface TemplateSelectOption {
  value: number | "";
  label: string;
  reason: string | null;
}

const SIGNATORY_ROLE_OPTIONS: SelectOption<"signer" | "viewer" | "reviewer">[] = [
  { value: "signer", label: "Signer" },
  { value: "viewer", label: "Viewer" },
  { value: "reviewer", label: "Reviewer" },
];

// Style overrides layered on ThemedSelect's "small" preset so a signatory's role still reads
// as a colored pill (matching the read-only role pills elsewhere) rather than a plain control.
function pillSelectStyles(color: string) {
  return {
    control: (base: Record<string, unknown>) => ({ ...base, minHeight: 26, border: 0, borderRadius: 20, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, boxShadow: "none" }),
    valueContainer: (base: Record<string, unknown>) => ({ ...base, padding: "0 4px 0 8px" }),
    singleValue: (base: Record<string, unknown>) => ({ ...base, color, fontWeight: 700, fontSize: 11 }),
    indicatorsContainer: (base: Record<string, unknown>) => ({ ...base, height: 24 }),
    dropdownIndicator: (base: Record<string, unknown>) => ({ ...base, color, padding: "0 4px" }),
  };
}

function DynamicField({ field, value, onChange, fieldId }: {
  field: DtmsTemplateFormField; value: DtmsFieldValue; onChange: (value: DtmsFieldValue) => void; fieldId: string;
}) {
  const options = field.options ?? [];
  // A field driven by a "people" field (e.g. Designation mirroring Name) always renders as a
  // textarea regardless of its own declared type, since getPeopleAttrValue joins one line per
  // selected person — same override DMT-Front-end applies.
  if (field.field_type === "textarea" || field.people_source_field !== null) {
    return <textarea id={fieldId} value={value as string} onChange={event => onChange(event.target.value)} rows={3} required={field.required} />;
  }
  if (field.field_type === "checkbox") {
    const selected = Array.isArray(value) ? value : [];
    return <div className="etm-form-section-body" style={{ padding: 0, gap: 6 }}>
      {options.map(option => (
        <label key={option} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={selected.includes(option)} onChange={event => onChange(event.target.checked ? [...selected, option] : selected.filter(item => item !== option))} />
          {option}
        </label>
      ))}
    </div>;
  }
  if (field.field_type === "radio") {
    return <div className="etm-form-section-body" style={{ padding: 0, gap: 6 }}>
      {options.map(option => (
        <label key={option} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="radio" name={fieldId} checked={value === option} onChange={() => onChange(option)} />
          {option}
        </label>
      ))}
    </div>;
  }
  if (field.field_type === "select") {
    const selectOptions: SelectOption<string>[] = options.map(option => ({ value: option, label: option }));
    return <ThemedSelect<SelectOption<string>>
      inputId={fieldId}
      classNamePrefix="etm-dynamic-select"
      isSearchable
      isClearable
      placeholder="— Select —"
      options={selectOptions}
      value={selectOptions.find(option => option.value === value) ?? null}
      onChange={option => onChange(option?.value ?? "")}
    />;
  }
  const inputType = field.field_type === "email" ? "email" : field.field_type === "date" ? "date" : field.field_type === "url" ? "url" : field.field_type === "number" ? "number" : "text";
  return <input id={fieldId} type={inputType} value={value as string} onChange={event => onChange(event.target.value)} required={field.required} />;
}

export default function CreateDocumentForm({ defaultTitle, initialTemplateId, onCreated, onCancel }: CreateDocumentFormProps) {
  const fieldId = useId();
  const { user } = useAuth();
  const { projects, dtmsDocumentTemplates: templates } = useTasks();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [signatoryUsers, setSignatoryUsers] = useState<DtmsSignatoryUser[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [templateId, setTemplateId] = useState<number | "">("");
  const [title, setTitle] = useState(defaultTitle);
  const [requestor, setRequestor] = useState("");
  const [position, setPosition] = useState("");
  const [message, setMessage] = useState("");
  const [formFieldValues, setFormFieldValues] = useState<Record<number, DtmsFieldValue>>({});
  const [signatories, setSignatories] = useState<EditableSignatoryEntry[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const [sigPickerOpen, setSigPickerOpen] = useState(false);
  const [sigSearch, setSigSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    dtmsDocumentService.listSignatoryUsers(ctrl.signal)
      .then(setSignatoryUsers)
      .catch(caught => { if (!ctrl.signal.aborted) setLoadError(taskError(caught)); })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingOptions(false); });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (user) { setRequestor(`${user.first_name} ${user.last_name}`.trim()); setPosition(user.position); }
  }, [user]);

  const selectedTemplate = templateId ? templates.find(template => template.id === templateId) : undefined;
  const templateSelectOptions: TemplateSelectOption[] = [
    { value: "", label: "No template (custom document)", reason: null },
    ...templates.map(template => ({ value: template.id, label: template.name, reason: templateIncompatibilityReason(template) })),
  ];

  function applyTemplate(next: DtmsDocumentTemplate | undefined) {
    if (!next) { setFormFieldValues({}); setSignatories([]); return; }
    const seeded: Record<number, DtmsFieldValue> = {};
    for (const field of next.form_fields) {
      seeded[field.id] = field.autofill_source
        ? resolveAutofill(field.autofill_source, user, projects)
        : (field.field_type === "checkbox" || field.field_type === "people" ? [] : "");
    }
    setFormFieldValues(seeded);
    setSignatories(withLocalKey(routingStepsToSignatories(next.routing)));
  }

  // Pre-selects the subtask's default_document_template hint once templates have loaded —
  // only if nothing's been picked yet, so it never clobbers a manual choice, and only if
  // that template is actually usable here (an unsupported one is left for the user to
  // notice via the picker's own "unavailable" labeling instead of silently applying it).
  useEffect(() => {
    if (!initialTemplateId || templateId !== "" || !templates.length) return;
    const hinted = templates.find(candidate => candidate.id === initialTemplateId);
    if (hinted && !templateIncompatibilityReason(hinted)) {
      setTemplateId(hinted.id);
      applyTemplate(hinted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, initialTemplateId]);

  function updateFieldValue(fieldId: number, value: DtmsFieldValue) {
    setFormFieldValues(current => ({ ...current, [fieldId]: value }));
  }

  // Mirrors DMT-Front-end's inline people-field handler: updates the field's own answer,
  // pushes the selected people's attribute into any field driven by it (e.g. Designation ←
  // Name), and — if this field auto-adds viewers — reconciles the signatory list so it only
  // ever holds one auto-added row per currently-selected person for this specific field.
  function handlePeopleFieldChange(field: DtmsTemplateFormField, names: string[], users: DtmsSignatoryUser[]) {
    updateFieldValue(field.id, names);
    for (const linked of selectedTemplate?.form_fields ?? []) {
      if (linked.people_source_field === field.id) {
        updateFieldValue(linked.id, getPeopleAttrValue(users, linked.people_source_attr || "position"));
      }
    }
    if (!field.auto_add_viewers) return;
    setSignatories(current => {
      const kept = current.filter(entry => !(entry.role === "viewer" && entry.auto_added_field_id === field.id && !names.includes(entry.user_name)));
      const maxOrder = kept.length ? Math.max(...kept.map(entry => entry.order)) : -1;
      const newViewers: EditableSignatoryEntry[] = [];
      users.forEach(candidate => {
        if (kept.some(entry => entry.user_id === candidate.id)) return;
        newViewers.push(...withLocalKey([{ user_id: candidate.id, user_email: candidate.email, user_name: candidate.full_name, order: maxOrder + 1 + newViewers.length, role: "viewer", files_to_sign: "all", auto_added_field_id: field.id }]));
      });
      return normalizeSignatoryOrders([...kept, ...newViewers]);
    });
  }

  function addSignatory(candidate: DtmsSignatoryUser, role: "signer" | "reviewer" | "viewer" = "signer") {
    if (signatories.some(entry => entry.user_id === candidate.id && entry.role === role)) return;
    const nextOrder = signatories.length ? Math.max(...signatories.map(entry => entry.order)) + 1 : 0;
    setSignatories(current => [...current, ...withLocalKey([{ user_id: candidate.id, user_email: candidate.email, user_name: candidate.full_name, order: nextOrder, role }])]);
    // Left open (and search cleared, not the whole picker) so several people can be added
    // back-to-back without reopening it each time.
    setSigSearch("");
  }

  function removeSignatory(localKey: string) {
    setSignatories(current => current.filter(entry => entry.localKey !== localKey));
  }

  function moveSignatory(localKey: string, direction: "up" | "down") {
    setSignatories(current => {
      const index = current.findIndex(entry => entry.localKey === localKey);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = current.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((entry, order) => ({ ...entry, order }));
    });
  }

  function updateSignatoryRole(localKey: string, role: "signer" | "viewer" | "reviewer") {
    setSignatories(current => current.map(entry => entry.localKey === localKey ? { ...entry, role } : entry));
  }

  // Ported from DMT-Front-end: two adjacent signatories with the same `order` sign at the
  // same time (parallel) instead of one after the other. Toggling merges this row into the
  // row above's order (or, if already merged, splits it back out by bumping this row and
  // everything after it).
  function toggleParallel(index: number) {
    setSignatories(current => {
      const updated = current.map(entry => ({ ...entry }));
      const above = updated[index - 1];
      const target = updated[index];
      if (target.order === above.order) {
        const threshold = target.order;
        for (let j = index; j < updated.length; j++) {
          if (updated[j].order >= threshold) updated[j].order += 1;
        }
      } else {
        target.order = above.order;
      }
      return normalizeSignatoryOrders(updated);
    });
  }

  const filteredSignatoryUsers = signatoryUsers.filter(candidate => `${candidate.full_name} ${candidate.position}`.toLowerCase().includes(sigSearch.trim().toLowerCase()));
  const uniqueSignatoryOrders = [...new Set(signatories.map(entry => entry.order))].sort((a, b) => a - b);
  const signatoryStepNumber = (order: number) => uniqueSignatoryOrders.indexOf(order) + 1;
  const visibleFormFields = (selectedTemplate?.form_fields ?? [])
    .filter(field => field.visibility !== "signatory_only")
    .filter(field => isFieldVisible(field, formFieldValues));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !title.trim()) return;
    const missing = visibleFormFields.find(field => {
      if (!field.required) return false;
      const value = formFieldValues[field.id];
      return Array.isArray(value) ? value.length === 0 : !value;
    });
    if (missing) { setError(`Please provide a value for "${missing.label}".`); return; }

    setSaving(true); setError("");
    try {
      const fd = new FormData();
      fd.append("userID", String(user?.id ?? 0));
      fd.append("title", title.trim());
      fd.append("type", selectedTemplate?.name ?? "Other");
      fd.append("requestor", requestor.trim());
      fd.append("position", position.trim());
      fd.append("message", message.trim());
      if (selectedTemplate) fd.append("template", String(selectedTemplate.id));
      if (Object.keys(formFieldValues).length > 0) {
        const transformed = Object.fromEntries(
          Object.entries(formFieldValues).map(([id, value]) => {
            const field = selectedTemplate?.form_fields.find(f => String(f.id) === id);
            return [id, field ? getTransformedValue(field, value) : value];
          }),
        );
        fd.append("form_response", JSON.stringify(transformed));
      }

      const doc = await dtmsDocumentService.create(fd);
      for (const attached of files) await dtmsDocumentService.uploadFile(doc.id, attached);
      if (signatories.length > 0) {
        await dtmsDocumentService.send(doc.id, normalizeSignatoryOrders(signatories).map(({ localKey, auto_added_field_id, ...rest }) => rest));
      }
      await onCreated(doc.tracknumber);
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loadingOptions) return <div className="etm-form-section-body" style={{ justifyContent: "center", padding: 40 }}><Loader2 size={22} className="etm-form-spinner" /></div>;

  return (
    <form className="etm-task-form" onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <fieldset className="etm-form-fieldset" disabled={saving}>
        <div className="etm-form-section-body" style={{ padding: 0 }}>
          {loadError && <p className="etm-field-error" role="alert">Couldn't load templates/signatories: {loadError}</p>}

          <div className="etm-field">
            <label htmlFor={`${fieldId}-template`}>Document template</label>
            <ThemedSelect<TemplateSelectOption>
              inputId={`${fieldId}-template`}
              classNamePrefix="etm-doc-template-select"
              isSearchable
              options={templateSelectOptions}
              isOptionDisabled={option => !!option.reason}
              formatOptionLabel={(option, { context }) => (context === "menu" && option.reason)
                ? <span>{option.label}<br /><small style={{ opacity: 0.7 }}>Unavailable — {option.reason}</small></span>
                : option.label}
              value={templateSelectOptions.find(option => option.value === templateId) ?? templateSelectOptions[0]}
              onChange={option => { const next = option && option.value !== "" ? option.value : ""; setTemplateId(next); applyTemplate(next ? templates.find(t => t.id === next) : undefined); }}
            />
          </div>

          <div className="etm-field">
            <label htmlFor={`${fieldId}-title`}>Title <span aria-hidden="true">*</span></label>
            <input id={`${fieldId}-title`} value={title} onChange={event => setTitle(event.target.value)} maxLength={100} required />
          </div>

          <div className="etm-field">
            <label htmlFor={`${fieldId}-requestor`}>Requestor</label>
            <input id={`${fieldId}-requestor`} value={requestor} onChange={event => setRequestor(event.target.value)} maxLength={100} />
          </div>

          <div className="etm-field">
            <label htmlFor={`${fieldId}-position`}>Position</label>
            <input id={`${fieldId}-position`} value={position} onChange={event => setPosition(event.target.value)} maxLength={100} />
          </div>

          <div className="etm-field">
            <label htmlFor={`${fieldId}-message`}>Message <span className="etm-form-optional">(optional)</span></label>
            <textarea id={`${fieldId}-message`} value={message} onChange={event => setMessage(event.target.value)} rows={3} />
          </div>

          {visibleFormFields.map(field => (
            <div className="etm-field" key={field.id}>
              <label htmlFor={`${fieldId}-field-${field.id}`}>{field.label} {field.required && <span aria-hidden="true">*</span>}</label>
              {field.help_text && <p className="etm-form-helper">{field.help_text}</p>}
              {field.field_type === "people" ? (
                <PeopleMultiSelect value={Array.isArray(formFieldValues[field.id]) ? formFieldValues[field.id] as string[] : []} candidates={signatoryUsers} onChange={(names, users) => handlePeopleFieldChange(field, names, users)} />
              ) : (
                <DynamicField field={field} fieldId={`${fieldId}-field-${field.id}`} value={formFieldValues[field.id] ?? (field.field_type === "checkbox" ? [] : "")} onChange={value => updateFieldValue(field.id, value)} />
              )}
            </div>
          ))}

          <div className="etm-field">
            <label>Files <span className="etm-form-optional">(optional)</span></label>
            <input ref={fileInputRef} type="file" multiple hidden onChange={event => {
              // Capture the picked files into a plain array before clearing the input —
              // resetting event.target.value also empties event.target.files as a side
              // effect, and setFiles' updater only runs later, so reading event.target.files
              // lazily inside it was always seeing the already-cleared, empty FileList.
              const picked = Array.from(event.target.files ?? []);
              event.target.value = "";
              setFiles(current => [...current, ...picked]);
            }} />
            {files.length > 0 && <ul className="etm-sig-queue" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {files.map((attached, index) => (
                <li key={`${attached.name}-${index}`} className="etm-sig-row">
                  <Paperclip size={13} style={{ flexShrink: 0, color: "var(--etm-muted)" }} />
                  <span className="etm-sig-row-name" title={attached.name}>{attached.name}</span>
                  <button type="button" className="etm-icon-button danger" aria-label={`Remove ${attached.name}`} onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>}
            <button type="button" className="etm-inline-link-button" onClick={() => fileInputRef.current?.click()}><Paperclip size={13} />{files.length ? "Attach another file" : "Attach a file"}</button>
          </div>

          <div className="etm-field">
            <label>Signatories <span className="etm-form-optional">(optional)</span></label>
            {signatories.length > 0 && <ul className="etm-sig-queue" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {signatories.map((entry, index) => {
                const isParallelWithAbove = index > 0 && entry.order === signatories[index - 1].order;
                return (
                  <li key={entry.localKey}>
                    {index > 0 && (
                      <div className="etm-sig-parallel-toggle-row">
                        <button type="button" className={`etm-sig-parallel-toggle ${isParallelWithAbove ? "parallel" : ""}`} title={isParallelWithAbove ? "Signs at the same time as the row above — click to make it wait instead" : "Signs only after the row above — click to make it sign at the same time"} onClick={() => toggleParallel(index)}>
                          {isParallelWithAbove ? <Link2 size={11} /> : <Link2Off size={11} />}
                          {isParallelWithAbove ? "parallel — click to separate" : "sequential — click to parallelize"}
                        </button>
                      </div>
                    )}
                    <div className="etm-sig-row">
                      <span className="etm-sig-row-badge" aria-hidden="true">{signatoryStepNumber(entry.order)}</span>
                      <span className="etm-sig-row-name" title={entry.user_name || entry.user_email}>{entry.user_name || entry.user_email}</span>
                      <div style={{ width: 112, flexShrink: 0 }}>
                        <ThemedSelect<SelectOption<"signer" | "viewer" | "reviewer">>
                          size="small"
                          classNamePrefix="etm-sig-role-select"
                          aria-label={`Role for ${entry.user_name}`}
                          isSearchable={false}
                          options={SIGNATORY_ROLE_OPTIONS}
                          value={SIGNATORY_ROLE_OPTIONS.find(option => option.value === entry.role) ?? SIGNATORY_ROLE_OPTIONS[0]}
                          onChange={option => updateSignatoryRole(entry.localKey, option?.value ?? "signer")}
                          styles={pillSelectStyles(entry.role === "viewer" ? "var(--etm-role-viewer)" : entry.role === "reviewer" ? "var(--etm-role-reviewer)" : "var(--etm-primary)")}
                        />
                      </div>
                      <button type="button" className="etm-icon-button" aria-label="Move up" disabled={index === 0} onClick={() => moveSignatory(entry.localKey, "up")}><ChevronUp size={14} /></button>
                      <button type="button" className="etm-icon-button" aria-label="Move down" disabled={index === signatories.length - 1} onClick={() => moveSignatory(entry.localKey, "down")}><ChevronDown size={14} /></button>
                      <button type="button" className="etm-icon-button danger" aria-label={`Remove ${entry.user_name}`} onClick={() => removeSignatory(entry.localKey)}><Trash2 size={14} /></button>
                    </div>
                  </li>
                );
              })}
            </ul>}
            <button type="button" className="etm-add-subtask" onClick={() => setSigPickerOpen(value => !value)}><Plus size={16} /> Add signatory</button>
            {sigPickerOpen && (
              <div className="etm-member-picker">
                <div className="etm-member-search"><Search size={14} /><input autoFocus placeholder="Search people…" value={sigSearch} onChange={event => setSigSearch(event.target.value)} /></div>
                <div className="etm-member-options">
                  {filteredSignatoryUsers.map(candidate => (
                    <div key={candidate.id} className="etm-member-option" role="button" tabIndex={0} onClick={() => addSignatory(candidate)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); addSignatory(candidate); } }}>
                      <span className="etm-member-initials" aria-hidden="true">{candidate.first_name?.charAt(0)}{candidate.last_name?.charAt(0)}</span>
                      <span className="etm-member-option-name">{candidate.full_name}{candidate.position && <small>{candidate.position}{candidate.office_name ? ` · ${candidate.office_name}` : ""}</small>}</span>
                      <span className="etm-sig-quickadd">
                        <button type="button" className="etm-sig-quickadd-btn signer" title={`Add ${candidate.full_name} as signer`} onClick={event => { event.stopPropagation(); addSignatory(candidate, "signer"); }}><Plus size={11} />Signer</button>
                        <button type="button" className="etm-sig-quickadd-btn reviewer" title={`Add ${candidate.full_name} as reviewer`} onClick={event => { event.stopPropagation(); addSignatory(candidate, "reviewer"); }}><Plus size={11} />Reviewer</button>
                        <button type="button" className="etm-sig-quickadd-btn viewer" title={`Add ${candidate.full_name} as viewer`} onClick={event => { event.stopPropagation(); addSignatory(candidate, "viewer"); }}><Plus size={11} />Viewer</button>
                      </span>
                    </div>
                  ))}
                  {!filteredSignatoryUsers.length && <p className="etm-member-empty">No one matches your search.</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </fieldset>
      {error && <div className="etm-form-error-banner" role="alert">{error}</div>}
      <div className="etm-form-footer">
        <span>Creates the document in DTMS and links it to this subtask.</span>
        <div>
          <button type="button" className="etm-button ghost" disabled={saving} onClick={onCancel}>Cancel</button>
          <button type="submit" className="etm-button primary" disabled={saving || !title.trim()}>{saving ? <Loader2 size={17} className="etm-form-spinner" /> : <Save size={17} />}{saving ? "Creating…" : "Create document"}</button>
        </div>
      </div>
    </form>
  );
}
