import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import Swal from "sweetalert2";
import Modal from "../../components/ui/modal";
import MultiSelect from "../../components/ui/multiselect";
import { taskError, taskService } from "../tasks/taskService";
import type { Member } from "../tasks/types";
import { sheetService, type SheetRowRule } from "./sheetService";

interface RowAccessDialogProps {
  targetId: number;
  // The project page ("tod"...) this sheet belongs to: who may open it is set here too.
  page: string;
  // The synced tab: its column titles and rows give the columns and values to pick from.
  headers: { label: string }[];
  rows: { cells: string[] }[];
  // Pre-selected column (e.g. "Assigned Personnel").
  defaultColumn?: string;
  onClose: () => void;
}

interface Condition {
  column: string;
  values: string[];
  // Values typed by hand that the synced tab does not hold.
  extra: string[];
}

const normalize = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nameOf = (member: Pick<Member, "first_name" | "last_name">) => `${member.first_name} ${member.last_name}`.trim();

// One "column is one of these values" line.
function ConditionEditor({ condition, headers, rows, disabled, onChange, onRemove }: {
  condition: Condition; headers: { label: string }[]; rows: { cells: string[] }[]; disabled: boolean;
  onChange: (next: Condition) => void; onRemove?: () => void;
}) {
  const [draft, setDraft] = useState("");
  // The values the column holds in the synced tab (a cell naming several people counts once per cell as written), plus what was typed.
  const options = useMemo(() => {
    const position = headers.findIndex(header => header.label === condition.column);
    const seen = new Set<string>();
    if (position >= 0) rows.forEach(row => { const value = (row.cells[position] ?? "").trim(); if (value && value.toUpperCase() !== "FALSE") seen.add(value); });
    [...condition.extra, ...condition.values].forEach(value => seen.add(value));
    return [...seen].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })).map((name, id) => ({ id, name }));
  }, [headers, rows, condition]);
  const selectedIds = options.filter(option => condition.values.includes(option.name)).map(option => option.id);

  const addCustom = () => {
    const value = draft.trim();
    if (!value) return;
    onChange({
      ...condition,
      extra: condition.extra.includes(value) ? condition.extra : [...condition.extra, value],
      values: condition.values.includes(value) ? condition.values : [...condition.values, value],
    });
    setDraft("");
  };

  return (
    <div className="etm-panel" style={{ display: "grid", gap: 12, padding: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <label className="etm-field-label" style={{ flex: 1 }}>Show only rows where this column…
          <select className="etm-select" value={condition.column} onChange={event => onChange({ column: event.target.value, values: [], extra: [] })} disabled={disabled}>
            {headers.map(header => <option key={header.label} value={header.label}>{header.label}</option>)}
          </select>
        </label>
        {onRemove && <button type="button" className="etm-icon-button" aria-label="Remove this condition" title="Remove this condition" onClick={onRemove} disabled={disabled}><X size={16} /></button>}
      </div>
      <MultiSelect label="…is one of" options={options} selected={selectedIds} placeholder="Pick values" inline
        onChange={ids => onChange({ ...condition, values: ids.map(id => options[id]?.name).filter((name): name is string => !!name) })} />
      <div style={{ display: "flex", gap: 8 }}>
        <input className="etm-input" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Not in the list? Type a value…" disabled={disabled}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }} />
        <button type="button" className="etm-button ghost" style={{ minHeight: 40 }} onClick={addCustom} disabled={disabled || !draft.trim()}><Plus size={15} /> Add</button>
      </div>
    </div>
  );
}

// Admin only: decides who may open the page, and which rows of the sheet a person may see — only the rows that satisfy the
// conditions you set (each: a column holds one of some values). It is enforced on the server, so the rows a person may not see
// are never sent to them.
export default function RowAccessDialog({ targetId, page, headers, rows, defaultColumn, onClose }: RowAccessDialogProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [rules, setRules] = useState<SheetRowRule[]>([]);
  const [userId, setUserId] = useState<number | "">("");
  const firstColumn = headers.find(header => defaultColumn && normalize(header.label) === normalize(defaultColumn))?.label ?? headers[0]?.label ?? "";
  const blank = (): Condition => ({ column: firstColumn, values: [], extra: [] });
  const [conditions, setConditions] = useState<Condition[]>([blank()]);
  const [match, setMatch] = useState<"all" | "any">("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // People let into the page besides those tagged to its project.
  const [pageUsers, setPageUsers] = useState<number[]>([]);
  const [savingPage, setSavingPage] = useState(false);
  useEffect(() => { sheetService.pageAccess(page).then(setPageUsers).catch(() => undefined); }, [page]);
  async function savePage() {
    if (savingPage) return;
    setSavingPage(true);
    setError("");
    try {
      setPageUsers(await sheetService.setPageAccess(page, pageUsers));
      void Swal.fire({ title: "Saved", text: "They can open this page now.", icon: "success", timer: 1600, showConfirmButton: false });
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSavingPage(false);
    }
  }

  const reload = () => sheetService.rules(targetId).then(setRules).catch(caught => setError(taskError(caught)));
  useEffect(() => {
    void reload();
    taskService.members().then(setMembers).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  function chooseUser(id: number | "") {
    setUserId(id);
    setError("");
    const existing = id === "" ? undefined : rules.find(rule => rule.user === id);
    if (existing?.conditions.length) {
      setConditions(existing.conditions.map(item => ({
        column: headers.find(header => normalize(header.label) === normalize(item.column))?.label ?? item.column,
        values: item.values,
        extra: [],
      })));
      setMatch(existing.match === "any" ? "any" : "all");
    } else {
      setConditions([blank()]);
      setMatch("all");
    }
  }

  const change = (index: number, next: Condition) => setConditions(current => current.map((item, position) => position === index ? next : item));
  const usable = conditions.filter(item => item.column && item.values.length);

  async function save(remove: boolean) {
    if (userId === "" || saving) return;
    setSaving(true);
    setError("");
    try {
      await sheetService.setRule(targetId, { user: userId, conditions: remove ? [] : usable.map(({ column, values }) => ({ column, values })), match });
      await reload();
      if (remove) { setConditions([blank()]); setMatch("all"); }
      void Swal.fire({ title: remove ? "Limit removed" : "Saved", text: remove ? "They see every row again." : "They now see only those rows.", icon: "success", timer: 1600, showConfirmButton: false });
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSaving(false);
    }
  }

  const current = userId === "" ? undefined : rules.find(rule => rule.user === userId);
  const describe = (rule: SheetRowRule) => rule.conditions.map(item => `${item.column}: ${item.values.join(", ")}`).join(rule.match === "any" ? "  ·  OR  ·  " : "  ·  AND  ·  ");

  return (
    <Modal open onClose={saving ? () => undefined : onClose} title="Who sees what" widthClass="max-w-2xl">
      <div className="etm-report-form" style={{ display: "grid", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--etm-muted)" }}>
          Below, limit a person to the rows that match the conditions you set. Someone with no limit sees every row. A cell that lists several names (separated by a comma or semicolon) counts when any of them matches.
        </p>
        {error && <p className="etm-report-error" style={{ margin: 0 }}>{error}</p>}

        <div style={{ display: "grid", gap: 8 }}>
          <MultiSelect label="Who can open this page" inline placeholder="Only the people tagged to its project"
            options={members.map(member => ({ id: member.id, name: nameOf(member), detail: member.position || undefined }))}
            selected={pageUsers} onChange={setPageUsers} />
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
            <small style={{ color: "var(--etm-muted)", flex: 1, minWidth: 220 }}>These people open the page besides those tagged to its project. Anyone else who is assigned to one of its tasks can still see just the rows of those tasks.</small>
            <button type="button" className="etm-button" style={{ minHeight: 36 }} onClick={() => void savePage()} disabled={savingPage}>{savingPage ? "Saving…" : "Save access"}</button>
          </div>
        </div>
        <hr style={{ border: 0, borderTop: "1px solid var(--etm-border)", margin: 0 }} />

        {rules.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <span className="etm-field-label">Current limits</span>
            {rules.map(rule => (
              <div key={rule.id} className="etm-panel" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 12px", color: "var(--etm-ink)" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <strong style={{ fontSize: 13.5 }}>{rule.user_name}</strong>
                  <small style={{ display: "block", color: "var(--etm-muted)" }}>{describe(rule)}</small>
                </div>
                <button type="button" className="etm-button ghost" style={{ minHeight: 34 }} onClick={() => chooseUser(rule.user)} disabled={saving}>Edit</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gap: 14, paddingTop: rules.length ? 4 : 0 }}>
          <label className="etm-field-label">Person
            <select className="etm-select" value={userId} onChange={event => chooseUser(event.target.value ? Number(event.target.value) : "")} disabled={saving}>
              <option value="">Choose a person…</option>
              {members.map(member => <option key={member.id} value={member.id}>{nameOf(member)}{member.position ? ` — ${member.position}` : ""}</option>)}
            </select>
          </label>

          {userId !== "" && (
            <>
              {conditions.map((condition, index) => (
                <ConditionEditor key={index} condition={condition} headers={headers} rows={rows} disabled={saving}
                  onChange={next => change(index, next)} onRemove={conditions.length > 1 ? () => setConditions(list => list.filter((_, position) => position !== index)) : undefined} />
              ))}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
                <button type="button" className="etm-button ghost" style={{ minHeight: 36 }} onClick={() => setConditions(list => [...list, blank()])} disabled={saving}><Plus size={15} /> Add another column</button>
                {conditions.length > 1 && (
                  <div style={{ display: "flex", gap: 14, color: "var(--etm-ink)", fontSize: 13 }} role="radiogroup" aria-label="How the conditions combine">
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="radio" name="match" checked={match === "all"} onChange={() => setMatch("all")} /> A row must match <strong>all</strong></label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="radio" name="match" checked={match === "any"} onChange={() => setMatch("any")} /> …or <strong>any one</strong></label>
                  </div>
                )}
              </div>
              <div className="etm-report-form-actions">
                {current && <button type="button" className="etm-button ghost" onClick={() => void save(true)} disabled={saving}><Trash2 size={15} /> Remove the limit</button>}
                <button type="button" className="etm-button" onClick={() => void save(false)} disabled={saving || !usable.length}>{saving ? "Saving…" : current ? "Save changes" : "Limit this person"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
