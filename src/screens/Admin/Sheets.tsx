import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Pencil, PlugZap, Plus, Table2 } from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import Modal from "../../components/ui/modal";
import { sheetService, type SheetTarget, type SheetTargetInput } from "../../features/sheets/sheetService";
import { taskError } from "../../features/tasks/taskService";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

// The project pages (see the server's sheet_cards.py) a connected sheet belongs to.
const PAGE_NAMES: Record<string, string> = { "tod-tasks": "TOD Tasks", "elgu-ta": "eLGU Technical Assistance", "elgu-training": "eLGU Training", "elgu-refresher": "eLGU Refresher Training" };

const blank = (): SheetTargetInput => ({ name: "", url: "", header_row: 1, tab_mode: "month", fixed_tab: "", is_enabled: true });

function SheetDialog({ target, onClose, onSave }: { target?: SheetTarget; onClose: () => void; onSave: (input: SheetTargetInput) => Promise<void> }) {
  const [form, setForm] = useState<SheetTargetInput>(() => target ? { name: target.name, url: target.url, header_row: target.header_row, tab_mode: target.tab_mode, fixed_tab: target.fixed_tab, is_enabled: target.is_enabled } : blank());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof SheetTargetInput>(key: K, value: SheetTargetInput[K]) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, name: form.name.trim(), url: form.url.trim(), fixed_tab: form.tab_mode === "fixed" ? form.fixed_tab.trim() : "" });
    } catch (caught) {
      setError(taskError(caught));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={target ? "Edit sheet" : "Connect a sheet"}>
      <form className="etm-report-form" onSubmit={submit}>
        {error && <p className="etm-report-error">{error}</p>}
        <label>Name<input value={form.name} onChange={event => set("name", event.target.value)} placeholder="e.g. Online Assistance" maxLength={255} required disabled={saving} /></label>
        <label>Google Sheets link<input value={form.url} onChange={event => set("url", event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" required disabled={saving} /></label>
        <label>Row with the column titles<input type="number" min={1} value={form.header_row} onChange={event => set("header_row", Math.max(1, Number(event.target.value) || 1))} disabled={saving} /></label>
        <label>Tabs
          <select value={form.tab_mode} onChange={event => set("tab_mode", event.target.value as SheetTargetInput["tab_mode"])} disabled={saving}>
            <option value="month">A tab for each month (JANUARY, FEBRUARY, …), chosen from the date</option>
            <option value="fixed">One fixed tab</option>
          </select>
        </label>
        {form.tab_mode === "fixed" && <label>Tab name<input value={form.fixed_tab} onChange={event => set("fixed_tab", event.target.value)} required disabled={saving} /></label>}
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_enabled} onChange={event => set("is_enabled", event.target.checked)} disabled={saving} style={{ width: 18, height: 18 }} /> Available for sending</label>
        <div className="etm-report-form-actions">
          <button type="button" className="etm-button ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="etm-button" disabled={saving}>{saving ? "Saving…" : target ? "Save changes" : "Connect"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Sheets() {
  const [targets, setTargets] = useState<SheetTarget[]>([]);
  const [account, setAccount] = useState<{ email: string | null; configured: boolean } | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<{ target?: SheetTarget } | null>(null);

  const load = () => sheetService.targets().then(setTargets).catch(caught => setError(taskError(caught)));
  useEffect(() => {
    void load();
    sheetService.account().then(setAccount).catch(() => setAccount(null));
  }, []);

  async function save(input: SheetTargetInput) {
    if (dialog?.target) await sheetService.updateTarget(dialog.target.id, input);
    else await sheetService.createTarget(input);
    setDialog(null);
    await load();
  }

  async function checkSheet(target: SheetTarget) {
    try {
      const schema = await sheetService.schema(target.id);
      void Swal.fire({ title: "Connected", text: `Read “${schema.tab}”: ${schema.columns.length} columns (${schema.columns.filter(column => !column.auto).length} to fill in). Tabs: ${schema.tabs.join(", ")}.`, icon: "success" });
    } catch (caught) {
      void Swal.fire({ title: "Can’t read this sheet", text: taskError(caught), icon: "error" });
    }
  }

  return (
    <AdminLayout title="Sheets" subtitle="The Google Sheets connected to eTMS.">
      <div className="etm-reports">
        <section className="etm-report-heading">
          <div>
            <p className="etm-report-eyebrow"><Table2 size={15} /> Google Sheets</p>
            <h2>Connected sheets</h2>
            <p>
              Share each sheet with{" "}
              <strong style={{ color: "var(--etm-ink)", wordBreak: "break-all" }}>{account?.email ?? (account ? "(the eTMS Google account is not set up on the server yet)" : "…")}</strong>{" "}
              as an <strong style={{ color: "var(--etm-ink)" }}>Editor</strong>, then connect it here. eTMS only ever adds a new line at the bottom; nothing is deleted from a sheet.
            </p>
          </div>
          <button type="button" className="etm-button" onClick={() => setDialog({})}><Plus size={16} /> Connect a sheet</button>
        </section>
        {error && <p className="etm-report-error">{error}</p>}
        <div style={{ display: "grid", gap: 12 }}>
          {targets.map(target => {
            const page = PAGE_NAMES[target.key];
            let host = "";
            try { host = new URL(target.url).hostname; } catch { /* not a link */ }
            return (
              <div key={target.id} className="etm-panel" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", opacity: target.is_enabled ? 1 : 0.6, color: "var(--etm-ink)" }}>
                <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 12, background: "rgba(23, 179, 172, .14)", color: "var(--etm-primary)", flexShrink: 0 }}><Table2 size={22} /></span>
                <div style={{ flex: "1 1 260px", minWidth: 0, display: "grid", gap: 3 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 15.5, color: "var(--etm-ink)" }}>{target.name}</strong>
                    {page && <span className="etm-badge">{page} page</span>}
                    {!target.is_enabled && <span className="etm-badge">Off</span>}
                  </div>
                  <small style={{ color: "var(--etm-muted)" }}>
                    {page ? "People pick the tab on the page" : target.tab_mode === "month" ? "A tab for each month" : `Tab “${target.fixed_tab}”`} · column titles on row {target.header_row}{host ? ` · ${host}` : ""}
                  </small>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <a href={target.url} target="_blank" rel="noreferrer" className="etm-button ghost"><ExternalLink size={15} /> Open</a>
                  <button type="button" className="etm-button ghost" onClick={() => void checkSheet(target)}><PlugZap size={15} /> Test</button>
                  <button type="button" className="etm-button ghost" onClick={() => setDialog({ target })}><Pencil size={15} /> Edit</button>
                </div>
              </div>
            );
          })}
          {!targets.length && !error && <p className="etm-panel" style={{ padding: 16, margin: 0 }}>No sheet is connected yet.</p>}
        </div>
      </div>
      {dialog && <SheetDialog target={dialog.target} onClose={() => setDialog(null)} onSave={save} />}
    </AdminLayout>
  );
}
