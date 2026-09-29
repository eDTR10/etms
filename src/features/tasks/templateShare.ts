import { PRIORITIES, type Priority, type TaskTemplate, type TaskTemplateInput, type TemplateSubtask } from "./types";

const EXPORT_KIND = "etm-task-template";

function slugifyFilename(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Drops default_document_template before export — same reasoning as assignments below:
// it's a DTMS document template id specific to this backend, and would silently point at
// the wrong (or no) template if this file were imported into a different deployment.
function stripDocumentHints(subtasks: TemplateSubtask[]): TemplateSubtask[] {
  return subtasks.map(({ title, description, subtasks: children }) => ({
    title, description, subtasks: stripDocumentHints(children),
  }));
}

function sanitizeSubtasks(value: unknown): TemplateSubtask[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      title: typeof record.title === "string" ? record.title : "",
      description: typeof record.description === "string" ? record.description : "",
      subtasks: sanitizeSubtasks(record.subtasks),
    };
  });
}

// Downloads a template as a standalone .json file another user can import via
// parseTemplateImport. Assignments are deliberately left out — they're member IDs
// specific to this account/system and would silently point at the wrong people elsewhere.
export function exportTemplate(template: TaskTemplate): void {
  const payload = {
    kind: EXPORT_KIND,
    version: 1,
    exported_at: new Date().toISOString(),
    template: {
      name: template.name,
      title: template.title,
      is_personal: template.is_personal,
      project: template.project,
      details: template.details,
      requestor: template.requestor,
      location_province: template.location_province,
      location_city: template.location_city,
      location_barangay: template.location_barangay,
      priority: template.priority,
      subtasks: stripDocumentHints(template.subtasks),
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugifyFilename(template.name) || "task-template"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// Parses the JSON text of an imported file into a TaskTemplateInput the create dialog can
// prefill for review. Throws a message-bearing Error when the file isn't a template export.
export function parseTemplateImport(raw: string): TaskTemplateInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const root = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const rootTemplate = root.template && typeof root.template === "object" ? root.template as Record<string, unknown> : null;
  const source = root.kind === EXPORT_KIND && rootTemplate ? rootTemplate : root;
  if (typeof source.name !== "string" || !source.name.trim()) {
    throw new Error("That doesn't look like an exported task template.");
  }
  const priority = PRIORITIES.includes(source.priority as Priority) ? source.priority as Priority : "Medium";
  return {
    name: source.name,
    title: typeof source.title === "string" ? source.title : "",
    is_personal: typeof source.is_personal === "boolean" ? source.is_personal : true,
    project: typeof source.project === "string" ? source.project : "",
    details: typeof source.details === "string" ? source.details : "",
    requestor: typeof source.requestor === "string" ? source.requestor : "",
    location_province: typeof source.location_province === "string" ? source.location_province : "",
    location_city: typeof source.location_city === "string" ? source.location_city : "",
    location_barangay: typeof source.location_barangay === "string" ? source.location_barangay : "",
    priority,
    subtasks: sanitizeSubtasks(source.subtasks),
    assignments: [],
  };
}

export async function readTemplateImportFile(file: File): Promise<TaskTemplateInput> {
  return parseTemplateImport(await file.text());
}
