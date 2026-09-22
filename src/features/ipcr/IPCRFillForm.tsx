import { CalendarDays, Star, Type, X } from "lucide-react";
import IPCRRichTextField from "./IPCRRichTextField";
import type { GroupedTask } from "../tasks/types";
import { adjectivalRating, type IPCRField, type IPCRFieldMetaEntry, type IPCRFieldValue } from "./types";
import "./ipcr.css";

const FIELD_ICON: Record<IPCRField["type"], typeof Type> = {
  text: Type, textarea: Type, date: CalendarDays, number: Type, rating: Star, grouped_tasks: Type,
};

interface IPCRFillFormProps {
  fields: IPCRField[];
  values: Record<string, IPCRFieldValue>;
  meta: Record<string, IPCRFieldMetaEntry>;
  groups: GroupedTask[];
  onUpdateValue: (key: string, value: IPCRFieldValue) => void;
  onToggleGroupTag: (field: IPCRField, groupId: number) => void;
}

export default function IPCRFillForm({ fields, values, meta, groups, onUpdateValue, onToggleGroupTag }: IPCRFillFormProps) {
  return (
    <div className="etm-ipcr-fill-form">
      {fields.map(field => {
        const Icon = FIELD_ICON[field.type];
        if (field.type === "grouped_tasks") {
          const taggedIds = meta[field.key]?.grouped_task_ids ?? [];
          const taggedGroups = groups.filter(group => taggedIds.includes(group.id));
          return (
            <div className="etm-ipcr-fill-field" key={field.key}>
              <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
              <div className="etm-ipcr-group-tag-row">
                {taggedGroups.map(group => (
                  <span key={group.id} className="etm-ipcr-group-tag">{group.name}<button type="button" aria-label={`Untag ${group.name}`} onClick={() => onToggleGroupTag(field, group.id)}><X size={12} /></button></span>
                ))}
                <select value="" onChange={event => { if (event.target.value) onToggleGroupTag(field, Number(event.target.value)); }}>
                  <option value="">Tag a Grouped Task…</option>
                  {groups.filter(group => !taggedIds.includes(group.id)).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </div>
              <IPCRRichTextField value={String(values[field.key] ?? "")} onChange={html => onUpdateValue(field.key, html)} placeholder="Composed automatically from tagged tasks — editable." />
            </div>
          );
        }
        if (field.type === "textarea") {
          return (
            <div className="etm-ipcr-fill-field" key={field.key}>
              <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
              <IPCRRichTextField value={String(values[field.key] ?? "")} onChange={html => onUpdateValue(field.key, html)} placeholder={field.label} />
            </div>
          );
        }
        if (field.type === "rating") {
          return (
            <div className="etm-ipcr-fill-field" key={field.key}>
              <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
              <select value={values[field.key] ?? ""} onChange={event => onUpdateValue(field.key, event.target.value ? Number(event.target.value) : null)}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} — {adjectivalRating(n)}</option>)}
              </select>
            </div>
          );
        }
        return (
          <div className="etm-ipcr-fill-field" key={field.key}>
            <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
            <input type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} value={values[field.key] ?? ""} onChange={event => onUpdateValue(field.key, event.target.value)} />
          </div>
        );
      })}
    </div>
  );
}
