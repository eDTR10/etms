import type { UserProfile } from "../../screens/Auth/authService";
import type { Project } from "../tasks/types";
import type { DtmsDocumentTemplate, DtmsFieldValue, DtmsPeopleAttr, DtmsSignatoryEntry, DtmsSignatoryUser, DtmsTemplateFormField, DtmsTemplateRouting } from "./dtmsDocumentTypes";

// Ported from DMT-Front-end's CreateDocument.tsx — evaluates a field's depends_on/
// condition_operator/condition_value against the current answers. A field with no
// dependency is always visible.
export function isFieldVisible(field: DtmsTemplateFormField, values: Record<number, DtmsFieldValue>): boolean {
  if (field.depends_on === null) return true;
  const dependsOnValue = values[field.depends_on];
  if (field.condition_operator === "includes") {
    return Array.isArray(dependsOnValue) ? dependsOnValue.includes(field.condition_value) : String(dependsOnValue ?? "").includes(field.condition_value);
  }
  const current = Array.isArray(dependsOnValue) ? dependsOnValue.join(", ") : (dependsOnValue ?? "");
  if (field.condition_operator === "not_equals") return current !== field.condition_value;
  return current === field.condition_value;
}

// Same autofill sources CreateDocument.tsx supports, resolved against ETMS's own current
// user + office directory (taskService.projects() already maps office/ the same way).
export function resolveAutofill(source: DtmsTemplateFormField["autofill_source"], user: UserProfile | null, projects: Project[]): string {
  if (source === "today_date") return new Date().toISOString().slice(0, 10);
  if (!user) return "";
  switch (source) {
    case "user_email": return user.email;
    case "user_full_name": return `${user.first_name} ${user.last_name}`;
    case "user_position": return user.position;
    case "user_office_name": return projects.find(p => p.id === user.office)?.name ?? "";
    default: return "";
  }
}

// One line per selected person, in selection order — matches how a "people"-driven field
// (e.g. Designation mirroring Name) formats onto a generated PDF on DMT-Front-end.
export function getPeopleAttrValue(users: DtmsSignatoryUser[], attr: DtmsPeopleAttr): string {
  return users.map(u => attr === "office_name" ? (u.office_name ?? "") : attr === "email" ? u.email : u.position).join("\n");
}

export function getTransformedValue(field: DtmsTemplateFormField, value: DtmsFieldValue): DtmsFieldValue {
  if (!field.text_transform || typeof value !== "string") return value;
  switch (field.text_transform) {
    case "uppercase": return value.toUpperCase();
    case "lowercase": return value.toLowerCase();
    case "capitalize": return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    default: return value;
  }
}

// Every step in a chain shares one running `order` per parallel group — collapsing gaps left
// by removed/reordered rows the same way CreateDocument.tsx's normalizeSignatoryOrders does.
export function normalizeSignatoryOrders<T extends { order: number }>(entries: T[]): T[] {
  const normalized: T[] = [];
  let currentOrder = 0;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].order !== entries[i - 1].order) currentOrder += 1;
    normalized.push({ ...entries[i], order: currentOrder });
  }
  return normalized;
}

export function routingStepsToSignatories(steps: DtmsTemplateRouting[]): DtmsSignatoryEntry[] {
  return normalizeSignatoryOrders(
    steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(step => ({
        user_id: step.user_id,
        user_email: step.user_email,
        user_name: step.user_name,
        order: step.order,
        role: step.role,
        files_to_sign: step.files_to_sign || "all",
        assigns_number: step.assigns_number,
        number_label: step.number_label,
        number_prefix: step.number_prefix,
        number_start: step.number_start,
        number_padding: step.number_padding,
        next_template: step.next_template,
        instruction_text: step.instruction_text,
      })),
  );
}

const UNSUPPORTED_FIELD_TYPES = new Set<string>(["grid"]);
const UNSUPPORTED_ROUTING_ROLES = new Set<string>(["next_document", "manual_step"]);

// ETMS's embedded Create Document form only covers the common case (see dtmsDocument feature
// overview) — this flags a template that leans on something it can't represent, so the picker
// can grey it out with an explanation instead of silently producing a document that doesn't
// match what the template author intended.
export function templateIncompatibilityReason(template: DtmsDocumentTemplate): string | null {
  if (template.allow_cross_office_routing) return "Uses cross-office routing, which isn't supported here yet — use DMT instead.";

  const unsupportedField = template.form_fields.find(field => UNSUPPORTED_FIELD_TYPES.has(field.field_type) || field.enable_distance_autofill);
  if (unsupportedField) {
    const reason = unsupportedField.enable_distance_autofill ? "a distance-autofill map" : "an amount grid";
    return `Uses ${reason} field ("${unsupportedField.label}"), which isn't supported here yet — use DMT instead.`;
  }

  // A visible field that depends on a grid field can never resolve its own visibility here,
  // since ETMS never renders (or collects an answer for) that source field.
  const unsupportedFieldIds = new Set(template.form_fields.filter(field => UNSUPPORTED_FIELD_TYPES.has(field.field_type)).map(field => field.id));
  const orphanedDependent = template.form_fields.find(field => field.visibility !== "signatory_only" && field.depends_on !== null && unsupportedFieldIds.has(field.depends_on));
  if (orphanedDependent) return `The "${orphanedDependent.label}" field depends on a field type that isn't supported here yet — use DMT instead.`;

  const unsupportedStep = template.routing.find(step => UNSUPPORTED_ROUTING_ROLES.has(step.role));
  if (unsupportedStep) return `Routes through a "${unsupportedStep.role === "next_document" ? "Next Document" : "Manual Step"}" step, which isn't supported here yet — use DMT instead.`;

  return null;
}
