import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Pencil, Plus, Table2 } from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import Modal from "../../components/ui/modal";
import { sheetService, type SheetTarget, type SheetTargetInput } from "../../features/sheets/sheetService";
import { taskError } from "../../features/tasks/taskService";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

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
    <AdminLayout title="Sheets" subtitle="Google Sheets that tasks can be sent to.">
      <div className="etm-reports">
        <section className="etm-report-heading">
          <div>
            <p className="etm-report-eyebrow"><Table2 size={15} /> Google Sheets</p>
            <h2>Connected sheets</h2>
            <p>
              Share each sheet with{" "}
              <strong>{account?.email ?? (account ? "(the eTMS Google account is not set up on the server yet)" : "…")}</strong>{" "}
              as an <strong>Editor</strong>, then connect it here. Sending only adds a new line at the bottom; nothing can be deleted from eTMS.
            </p>
          </div>
          <button type="button" className="etm-button" onClick={() => setDialog({})}><Plus size={16} /> Connect a sheet</button>
        </section>
        {error && <p className="etm-report-error">{error}</p>}
        <div style={{ display: "grid", gap: 10 }}>
          {targets.map(target => (
            <div key={target.id} className="etm-panel" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", opacity: target.is_enabled ? 1 : 0.6 }}>
              <div>
                <strong>{target.name}</strong>{!target.is_enabled && <span style={{ marginLeft: 8, fontSize: 12 }}>(off)</span>}
                <div style={{ fontSize: 12.5, color: "var(--etm-muted)" }}>
                  {target.tab_mode === "month" ? "A tab per month" : `Tab “${target.fixed_tab}”`} · titles on row {target.header_row}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <a href={target.url} target="_blank" rel="noreferrer" className="etm-button ghost"><ExternalLink size={15} /> Open</a>
                <button type="button" className="etm-button ghost" onClick={() => void checkSheet(target)}>Test</button>
                <button type="button" className="etm-button ghost" onClick={() => setDialog({ target })}><Pencil size={15} /> Edit</button>
              </div>
            </div>
          ))}
          {!targets.length && !error && <p>No sheet is connected yet.</p>}
        </div>
      </div>
      {dialog && <SheetDialog target={dialog.target} onClose={() => setDialog(null)} onSave={save} />}
    </AdminLayout>
  );
}
