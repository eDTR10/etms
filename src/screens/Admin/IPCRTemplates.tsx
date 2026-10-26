import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import IPCRTemplateForm from "../../features/ipcr/IPCRTemplateForm";
import { ipcrService } from "../../features/ipcr/ipcrService";
import { shrinkGridImages } from "../../features/ipcr/ipcrImageShrink";
import { taskError } from "../../features/tasks/taskService";
import { normalizeGrid, type IPCRTemplate, type IPCRTemplateInput } from "../../features/ipcr/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";
import "../../features/ipcr/ipcr.css";

// A template as a file, so one made on one server (say a local one) can be loaded into another.
const TEMPLATE_FILE_FORMAT = "etms-ipcr-template";

function templateFileName(name: string) {
  return `${name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "IPCR template"}.ipcr-template.json`;
}

function IPCRTemplatesContent() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<IPCRTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<IPCRTemplate | "new" | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      ipcrService.listTemplates()
        .then(setTemplates)
        .catch(err => setError(taskError(err)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const confirmDelete = async (template: IPCRTemplate) => {
    const result = await Swal.fire({
      title: "Delete this IPCR template?",
      text: `"${template.name}" will be permanently removed. IPCRs already generated from it won't be affected.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-danger-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      await ipcrService.deleteTemplate(template.id);
      setTemplates(current => current.filter(item => item.id !== template.id));
      void Swal.fire({ title: "Template deleted", icon: "success", timer: 1400, showConfirmButton: false });
    } catch (err) {
      void Swal.fire({ title: "Couldn't delete template", text: taskError(err), icon: "error" });
    }
  };

  const downloadTemplate = (template: IPCRTemplate) => {
    const file = { format: TEMPLATE_FILE_FORMAT, version: 1, name: template.name, paper_size: template.paper_size, orientation: template.orientation, grid: template.grid, fields_config: template.fields_config };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = templateFileName(template.name);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Reads template file(s) made by "Download" and creates them here. A file that isn't one is refused with the reason.
  const importTemplates = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const imported: IPCRTemplate[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const parsed = JSON.parse(await file.text()) as Partial<IPCRTemplateInput> & { format?: string };
        if (parsed.format !== TEMPLATE_FILE_FORMAT || !parsed.name || !parsed.grid || !Array.isArray(parsed.fields_config)) throw new Error("this is not an IPCR template file");
        const input: IPCRTemplateInput = {
          name: parsed.name,
          grid: normalizeGrid(parsed.grid),
          fields_config: parsed.fields_config,
          paper_size: parsed.paper_size ?? "a3",
          orientation: parsed.orientation ?? "landscape",
        };
        // Some servers only accept about 1 MB per save; big pictures are what push a template over it, so they are re-drawn smaller.
        input.grid = await shrinkGridImages(input.grid, { fields: input.fields_config, name: input.name }, 900_000);
        const saved = await ipcrService.createTemplate(input);
        imported.push(saved);
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof Error ? err.message : taskError(err)}`);
      }
    }
    if (imported.length) setTemplates(current => [...current, ...imported].sort((a, b) => a.name.localeCompare(b.name)));
    if (fileInput.current) fileInput.current.value = "";
    void Swal.fire({
      title: problems.length ? (imported.length ? "Imported with problems" : "Couldn't import") : "Template imported",
      html: `${imported.length ? `<p>${imported.length} template${imported.length === 1 ? "" : "s"} added.</p>` : ""}${problems.map(problem => `<p style="font-size:13px">${problem.replace(/</g, "&lt;")}</p>`).join("")}`,
      icon: problems.length ? (imported.length ? "warning" : "error") : "success",
      ...(problems.length ? {} : { timer: 1800, showConfirmButton: false }),
    });
  };

  if (editing !== null) {
    const editingTemplate = editing === "new" ? undefined : editing;
    return (
      <IPCRTemplateForm
        template={editingTemplate}
        onCancel={() => setEditing(null)}
        onSave={async (input, sample) => {
          let saved = editingTemplate ? await ipcrService.updateTemplate(editingTemplate.id, input) : await ipcrService.createTemplate(input);
          // The template is saved; the sample document goes up as a second request (a file can't ride in the JSON save).
          if (sample.file) saved = await ipcrService.uploadSampleDocument(saved.id, sample.file);
          else if (sample.remove && saved.sample_document_url) saved = await ipcrService.removeSampleDocument(saved.id);
          setTemplates(current => editingTemplate ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
          setEditing(null);
          await Swal.fire({ title: editingTemplate ? "Template updated" : "Template created", icon: "success", timer: 1400, showConfirmButton: false });
        }}
      />
    );
  }

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><FileSpreadsheet size={15} /> IPCR forms</p>
          <h2>IPCR Templates</h2>
          <p>Design the exact sheet layout users pick from when they generate their own IPCR.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={event => void importTemplates(event.target.files)} />
          <button type="button" className="etm-button ghost" onClick={() => fileInput.current?.click()} title="Add a template from a file made with Download"><Upload size={16} /> Import template</button>
          <button type="button" className="etm-button" onClick={() => setEditing("new")}><Plus size={16} /> New IPCR Template</button>
        </div>
      </section>

      {error && <p className="etm-report-error">{error}</p>}
      {!loading && !error && (
        <section className="etm-panel etm-table-wrap">
          <table className="etm-tasks-table etm-report-table">
            <thead><tr><th>Template Name</th><th>Fill-in fields</th><th>Last updated</th><th className="etm-tasks-table-actions-col">Action Buttons</th></tr></thead>
            <tbody>
              {templates.length ? templates.map(template => (
                <tr key={template.id}>
                  <td className="etm-tasks-table-details-col">{template.name}</td>
                  <td>{template.fields_config.length}</td>
                  <td>{new Date(template.updated_at).toLocaleDateString()}</td>
                  <td className="etm-report-group-actions">
                    <button type="button" className="etm-icon-button" aria-label={`Download ${template.name}`} title="Download this template as a file" onClick={() => downloadTemplate(template)}><Download size={15} /></button>
                    <button type="button" className="etm-icon-button" aria-label={`Edit ${template.name}`} onClick={() => setEditing(template)}><Pencil size={15} /></button>
                    <button type="button" className="etm-icon-button danger" aria-label={`Delete ${template.name}`} onClick={() => void confirmDelete(template)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              )) : <tr><td colSpan={4} className="etm-empty-row">No IPCR templates yet. Create one so users can generate their IPCR from it.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default function AdminIPCRTemplates() {
  return (
    <AdminLayout title="IPCR Templates" subtitle="Every saved IPCR template.">
      <IPCRTemplatesContent />
    </AdminLayout>
  );
}
