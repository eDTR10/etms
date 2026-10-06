import { CalendarDays, Star, Type, X } from "lucide-react";
import ThemedSelect, { type SelectOption } from "../../components/ThemedSelect";
import IPCRRichTextField from "./IPCRRichTextField";
import type { GroupedTask } from "../tasks/types";
import { adjectivalRating, MONTH_NAMES, yearChoices, type IPCRField, type IPCRFieldMetaEntry, type IPCRFieldValue } from "./types";
import "./ipcr.css";

const FIELD_ICON: Record<IPCRField["type"], typeof Type> = {
  text: Type, textarea: Type, date: CalendarDays, number: Type, rating: Star, grouped_tasks: Type, month: CalendarDays, year: CalendarDays,
};

const MONTH_OPTIONS: SelectOption<number>[] = MONTH_NAMES.map((name, index) => ({ value: index + 1, label: name }));

const RATING_OPTIONS: SelectOption<number>[] = [1, 2, 3, 4, 5].map(n => ({ value: n, label: `${n} — ${adjectivalRating(n)}` }));

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
                <div style={{ minWidth: 180 }}>
                  <ThemedSelect<SelectOption<number>>
                    size="small"
                    classNamePrefix="etm-ipcr-group-select"
                    isSearchable
                    placeholder="Tag a Grouped Task…"
                    options={groups.filter(group => !taggedIds.includes(group.id)).map(group => ({ value: group.id, label: group.name }))}
                    value={null}
                    onChange={option => { if (option) onToggleGroupTag(field, option.value); }}
                  />
                </div>
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
        if (field.type === "month" || field.type === "year") {
          const options: SelectOption<number>[] = field.type === "month" ? MONTH_OPTIONS : yearChoices().map(year => ({ value: year, label: String(year) }));
          return (
            <div className="etm-ipcr-fill-field" key={field.key}>
              <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
              <ThemedSelect<SelectOption<number>>
                size="small"
                classNamePrefix="etm-ipcr-period-select"
                isSearchable={false}
                isClearable
                placeholder={field.type === "month" ? "Select a month…" : "Select a year…"}
                options={options}
                value={options.find(option => option.value === Number(values[field.key])) ?? null}
                onChange={option => onUpdateValue(field.key, option?.value ?? null)}
              />
            </div>
          );
        }
        if (field.type === "rating") {
          return (
            <div className="etm-ipcr-fill-field" key={field.key}>
              <label><Icon size={14} /> {field.label} <span className="etm-ipcr-field-cell">{field.cell}</span></label>
              <ThemedSelect<SelectOption<number>>
                size="small"
                classNamePrefix="etm-ipcr-rating-select"
                isSearchable={false}
                isClearable
                placeholder="—"
                options={RATING_OPTIONS}
                value={RATING_OPTIONS.find(option => option.value === values[field.key]) ?? null}
                onChange={option => onUpdateValue(field.key, option?.value ?? null)}
              />
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
