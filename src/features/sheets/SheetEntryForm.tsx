import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Send } from "lucide-react";
import Swal from "sweetalert2";
import { useAuth } from "../../screens/Auth/AuthContext";
import { taskError } from "../tasks/taskService";
import type { Task } from "../tasks/types";
import { sheetService, type SheetColumn, type SheetEntry, type SheetSchema, type SheetTarget } from "./sheetService";

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

type Values = Record<number, string>;

const isoDate = (value: string | null | undefined) => (value ? value.slice(0, 10) : "");
// The sheets show dates as 10/5/2026.
const sheetDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return year && month && day ? `${month}/${day}/${year}` : iso;
};
const find = (columns: SheetColumn[], pattern: RegExp) => columns.find(column => !column.auto && pattern.test(column.label.toLowerCase()));

// The choice of a dropdown that matches `text` (exactly, else as part of it); null when the sheet has no such choice.
function matchOption(column: SheetColumn, text: string): string | null {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return null;
  if (!column.options.length) return text.trim();
  return column.options.find(option => option.toLowerCase() === wanted)
    ?? column.options.find(option => option.toLowerCase().includes(wanted) || wanted.includes(option.toLowerCase()))
    ?? null;
}

// What eTMS already knows about the task, put into the sheet's columns by their titles.
function prefill(columns: SheetColumn[], task: Task | null | undefined, person: string, nextNumber: number | null): Values {
  const out: Values = {};
  const put = (pattern: RegExp, value: string | null | undefined, exact = false) => {
    const column = find(columns, pattern);
    if (!column || !value || out[column.index]) return;
    const matched = exact ? matchOption(column, value) : (column.options.length ? matchOption(column, value) : value);
    if (matched) out[column.index] = matched;
  };
  const numberColumn = find(columns, /^no\.?$/);
  if (numberColumn && nextNumber !== null) out[numberColumn.index] = String(nextNumber);
  put(/assisted by|^responsible/, person);
  if (task) {
    put(/requestor|requester/, task.requestor);
    put(/^province/, task.location_province, true);
    put(/lgu name|locality|city|municipality/, task.location_city, true);
    put(/^barangay/, task.location_barangay);
    put(/project name/, task.project?.name);
    put(/activity name/, task.title);
    put(/issues|concern/, task.details || task.title);
    put(/date requested|start date/, isoDate(task.created_at));
    put(/date provided|end date/, isoDate(task.completed_at) || isoDate(task.deadline) || isoDate(task.created_at));
  }
  return out;
}

// A multi-line box that offers what was typed before in that column (most recent first) while you type; picking one fills it in.
function SuggestTextarea({ id, value, onChange, suggestions, disabled, rows, compact }: {
  id: string; value: string; onChange: (value: string) => void; suggestions: string[]; disabled: boolean; rows: number; compact: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    const list = query ? suggestions.filter(item => item.toLowerCase().includes(query) && item !== value) : suggestions;
    return list.slice(0, 8);
  }, [suggestions, value]);
  const open = rect !== null && matches.length > 0;
  const measure = () => setRect(ref.current?.getBoundingClientRect() ?? null);
  useEffect(() => {
    if (!rect) return;
    const follow = () => setRect(ref.current?.getBoundingClientRect() ?? null);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => { window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", follow); };
  }, [rect !== null]);  // eslint-disable-line react-hooks/exhaustive-deps

  const below = rect ? window.innerHeight - rect.bottom > 230 : true;
  return (
    <>
      <textarea id={id} ref={ref} rows={rows} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}
        onFocus={measure} onBlur={() => setRect(null)} autoComplete="off"
        style={compact ? { minHeight: 0, resize: "none" } : undefined} />
      {open && rect && createPortal(
        <div role="listbox" aria-label="Recent entries"
          style={{ position: "fixed", zIndex: 80, left: rect.left, width: Math.max(rect.width, 280), ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }), maxHeight: 220, overflowY: "auto", padding: 4, border: "1px solid var(--etm-border)", borderRadius: 10, background: "var(--etm-surface)", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
          <div style={{ padding: "4px 8px", color: "var(--etm-muted)", fontSize: 10.5, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase" }}>Recent entries</div>
          {matches.map(item => (
            <button type="button" role="option" aria-selected={false} key={item}
              onMouseDown={event => { event.preventDefault(); onChange(item); setRect(null); }}
              style={{ display: "block", width: "100%", padding: "7px 9px", border: 0, borderRadius: 7, background: "transparent", color: "var(--etm-ink)", font: "inherit", fontSize: 12.5, lineHeight: 1.4, textAlign: "left", cursor: "pointer", overflow: "hidden" } as React.CSSProperties}
              onMouseEnter={event => { event.currentTarget.style.background = "var(--etm-surface-alt)"; }}
              onMouseLeave={event => { event.currentTarget.style.background = "transparent"; }}>
              <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

interface SheetEntryFormProps {
  initialTargetId?: number | null;
  // A form for one sheet, opened from that sheet's own page: no sheet picker, starts on `initialTab`, and `onSent` runs after a row was added.
  fixedTargetId?: number | null;
  initialTab?: string;
  onSent?: () => void;
  embedded?: boolean;
  // The sheet and its columns, already read by the page that opens this form (so it shows at once, fully loaded).
  preload?: { target: SheetTarget; schema: SheetSchema };
  task?: Task | null;
  groupedTaskId?: number | null;
}

export default function SheetEntryForm({ initialTargetId = null, fixedTargetId = null, initialTab = "", onSent, embedded = false, preload, task = null, groupedTaskId = null }: SheetEntryFormProps) {
  const { user } = useAuth();
  const person = user ? `${user.first_name} ${user.last_name}`.trim() : "";
  const [targets, setTargets] = useState<SheetTarget[]>(() => preload ? [preload.target] : []);
  const [targetId, setTargetId] = useState<number | null>(() => preload?.target.id ?? null);
  const [tab, setTab] = useState(preload?.schema.tab ?? initialTab);
  const tabChosen = useRef(!!initialTab);
  const [schema, setSchema] = useState<SheetSchema | null>(preload?.schema ?? null);
  const [values, setValues] = useState<Values>(() => preload ? prefill(preload.schema.columns, task, person, preload.schema.next_number) : {});
  const preloaded = useRef(!!preload);
  const touched = useRef(new Set<number>());
  const [loading, setLoading] = useState(!preload);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [previous, setPrevious] = useState<SheetEntry[]>([]);
  const target = useMemo(() => targets.find(item => item.id === targetId) ?? null, [targets, targetId]);

  useEffect(() => {
    if (preload) return;
    let cancelled = false;
    sheetService.targets().then(rows => {
      if (cancelled) return;
      const enabled = rows.filter(row => row.is_enabled);
      setTargets(enabled);
      setTargetId(enabled.find(row => row.id === (fixedTargetId ?? initialTargetId))?.id ?? (fixedTargetId ? null : enabled[0]?.id) ?? null);
    }).catch(caught => { if (!cancelled) setError(taskError(caught)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!task) { setPrevious([]); return; }
    sheetService.entries({ task: task.id }).then(setPrevious).catch(() => setPrevious([]));
  }, [task]);

  // The sheet's columns for the chosen tab. A new sheet starts again from the task's own details; the same sheet on
  // another tab keeps what was typed.
  const loadedFor = useRef(preload ? `${preload.target.id}:${task?.id ?? ""}` : "");
  useEffect(() => {
    if (!target) { setSchema(null); return; }
    // Already read by the page that opened the form: nothing to load the first time.
    if (preloaded.current) { preloaded.current = false; return; }
    let cancelled = false;
    setLoadingSchema(true);
    setError("");
    sheetService.schema(target.id, tab || undefined).then(next => {
      if (cancelled) return;
      setSchema(next);
      if (!tab) setTab(next.tab);
      const key = `${target.id}:${task?.id ?? ""}`;
      if (loadedFor.current !== key) {
        loadedFor.current = key;
        touched.current = new Set();
        setValues(prefill(next.columns, task, person, next.next_number));
      }
    }).catch(caught => { if (!cancelled) { setSchema(null); setError(taskError(caught)); } }).finally(() => { if (!cancelled) setLoadingSchema(false); });
    return () => { cancelled = true; };
  }, [target, tab, task, person]);

  function chooseTarget(id: number) {
    setTargetId(id);
    setTab("");
    tabChosen.current = false;
    setSchema(null);
  }

  const columns = schema?.columns ?? [];
  const autoColumns = columns.filter(column => column.auto);

  function setValue(column: SheetColumn, value: string) {
    touched.current.add(column.index);
    setValues(current => {
      const next = { ...current, [column.index]: value };
      const label = column.label.toLowerCase();
      // The answers fill other fields in: a place's province, and the day it was provided.
      if (/lgu name|locality|city|municipality/.test(label) && value.includes(",")) {
        const province = find(columns, /^province/);
        const wanted = value.slice(value.lastIndexOf(",") + 1).trim();
        const matched = province ? matchOption(province, wanted) : null;
        if (province && matched && !touched.current.has(province.index)) next[province.index] = matched;
      }
      if (/date requested|start date/.test(label)) {
        const provided = find(columns, /date provided|end date/);
        if (provided && !touched.current.has(provided.index) && !current[provided.index]) next[provided.index] = value;
        // A sheet with a tab for each month: the tab follows the date, unless one was picked by hand.
        if (target?.tab_mode === "month" && !tabChosen.current && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          const month = MONTHS[Number(value.slice(5, 7)) - 1];
          if (schema?.tabs.includes(month) && month !== tab) setTab(month);
        }
      }
      return next;
    });
  }

  async function send() {
    if (!target || !schema || sending) return;
    const payload: Record<number, string> = {};
    columns.forEach(column => {
      if (column.auto) return;
      const value = (values[column.index] ?? "").trim();
      if (!value) return;
      payload[column.index] = column.kind === "date" ? sheetDate(value) : value;
    });
    if (!Object.keys(payload).length) { setError("Fill in at least one field before sending."); return; }
    const confirm = await Swal.fire({
      title: "Add this row to the sheet?",
      text: `It is added as a new line at the bottom of “${target.name}” › ${schema.tab}. Nothing already there is changed.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Send to sheet",
    });
    if (!confirm.isConfirmed) return;
    setSending(true);
    setError("");
    try {
      const result = await sheetService.send(target.id, { tab: schema.tab, values: payload, task: task?.id ?? null, grouped_task: groupedTaskId });
      setPrevious(current => [result, ...current]);
      touched.current = new Set();
      void Swal.fire({
        title: "Sent",
        html: `Added as row ${result.row_number} of ${schema.tab}. <a href="${result.link}" target="_blank" rel="noreferrer">Open it in the sheet</a>`,
        icon: "success",
      });
      // New numbering for the next row, and a clean form.
      const fresh = await sheetService.schema(target.id, schema.tab);
      setSchema(fresh);
      setValues(prefill(fresh.columns, task, person, fresh.next_number));
      onSent?.();
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSending(false);
    }
  }

  function field(column: SheetColumn) {
    const value = values[column.index] ?? "";
    const id = `sheet-col-${column.index}`;
    const common = { id, disabled: sending, value, onChange: (event: { target: { value: string } }) => setValue(column, event.target.value) };
    let control;
    if (column.kind === "select") {
      control = (
        <select {...common}>
          <option value="">—</option>
          {column.options.map(option => <option key={option} value={option}>{option}</option>)}
          {value && !column.options.includes(value) && <option value={value}>{value}</option>}
        </select>
      );
    } else if (column.kind === "checkbox") {
      control = <input id={id} type="checkbox" disabled={sending} checked={value === "TRUE"} onChange={event => setValue(column, event.target.checked ? "TRUE" : "")} style={{ width: 18, height: 18 }} />;
    } else if (column.kind === "long") {
      control = <SuggestTextarea id={id} value={value} onChange={next => setValue(column, next)} suggestions={column.suggestions} disabled={sending} rows={embedded ? 2 : 3} compact={embedded} />;
    } else if (column.kind === "date") {
      control = <input {...common} type="date" />;
    } else if (column.kind === "time") {
      control = <input {...common} type="time" />;
    } else if (column.kind === "number") {
      control = <input {...common} type="number" min={0} step="any" />;
    } else {
      control = <input {...common} type="text" list={column.suggestions.length ? `${id}-list` : undefined} autoComplete="off" />;
    }
    return (
      <label key={column.index} htmlFor={id} style={column.kind === "long" ? { gridColumn: embedded ? "span 2" : "1 / -1" } : undefined}>
        {column.label}
        {control}
        {column.kind !== "long" && column.suggestions.length > 0 && <datalist id={`${id}-list`}>{column.suggestions.map(suggestion => <option key={suggestion} value={suggestion} />)}</datalist>}
      </label>
    );
  }

  if (loading) return <p>Loading sheets…</p>;
  if (!targets.length) return <p className="etm-report-error" style={{ margin: 0 }}>{error || "No Google Sheet is connected yet. An admin connects one under “Sheets”."}</p>;

  return (
    <section className={embedded ? undefined : "etm-panel"} style={{ padding: embedded ? 0 : 18, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        {!fixedTargetId && <label className="etm-field-label" style={{ minWidth: 220 }}>Sheet
          <select className="etm-select" value={targetId ?? ""} onChange={event => chooseTarget(Number(event.target.value))} disabled={sending}>
            {targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        {schema && (
          <label className="etm-field-label" style={{ minWidth: 180 }}>Tab
            <select className="etm-select" value={schema.tab} disabled={sending || loadingSchema} onChange={event => { tabChosen.current = true; setTab(event.target.value); }}>
              {schema.tabs.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        {target && !fixedTargetId && <a href={target.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}><ExternalLink size={14} /> Open the sheet</a>}
      </div>

      {task && previous.length > 0 && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--etm-muted)" }}>
          Already sent: {previous.slice(0, 3).map(entry => `${entry.target_name} › ${entry.tab} row ${entry.row_number} (${new Date(entry.created_at).toLocaleDateString()})`).join(" · ")}. Sending again adds another row.
        </p>
      )}
      {error && <p className="etm-report-error" style={{ margin: 0 }}>{error}</p>}
      {loadingSchema && !schema && <p style={{ margin: 0 }}>Reading the sheet…</p>}

      {schema && (
        <>
          <form className="etm-report-form" onSubmit={event => { event.preventDefault(); void send(); }}
            style={{ display: "grid", gridTemplateColumns: embedded ? "repeat(auto-fill, minmax(190px, 1fr))" : "repeat(auto-fill, minmax(230px, 1fr))", gap: embedded ? "8px 12px" : 12 }}>
            {columns.filter(column => !column.auto).map(field)}
          </form>
          {autoColumns.length > 0 && (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--etm-muted)" }}>
              The sheet fills these in itself: {autoColumns.map(column => column.label.replace(/\s*\(auto[^)]*\)/i, "")).join(", ")}.
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="etm-button" onClick={() => void send()} disabled={sending || loadingSchema}>
              <Send size={16} /> {sending ? "Sending…" : "Send to sheet"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
