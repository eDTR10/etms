export type DtmsSignatoryRole = "signer" | "viewer" | "reviewer" | "next_document" | "manual_step";

export interface DtmsSignatoryUser {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  position: string;
  office_id: number | null;
  office_name: string | null;
}

export interface DtmsTemplateRouting {
  id: number;
  order: number;
  role: DtmsSignatoryRole;
  user_id: number;
  user_name: string;
  user_email: string;
  files_to_sign?: string;
  requestor_office_id: number;
  assigns_number?: boolean;
  number_label?: string;
  number_prefix?: string;
  number_start?: number;
  number_padding?: number;
  next_template?: number | null;
  instruction_text?: string;
}

export type DtmsFormFieldType = "text" | "textarea" | "email" | "date" | "url" | "number" | "checkbox" | "radio" | "select" | "grid" | "people";
export type DtmsFormFieldVisibility = "all" | "signatory_only";
export type DtmsFormFieldConditionOperator = "equals" | "not_equals" | "includes" | "";
export type DtmsFormFieldAutofill = "" | "user_email" | "user_full_name" | "user_position" | "user_office_name" | "today_date";

export type DtmsPeopleAttr = "position" | "email" | "office_name";

export interface DtmsTemplateFormField {
  id: number;
  order: number;
  label: string;
  help_text?: string;
  field_type: DtmsFormFieldType;
  required: boolean;
  options: string[];
  autofill_source: DtmsFormFieldAutofill;
  depends_on: number | null;
  condition_operator: DtmsFormFieldConditionOperator;
  condition_value: string;
  visibility: DtmsFormFieldVisibility;
  enable_distance_autofill: boolean;
  text_transform: string;
  // Only meaningful on a non-people field: it mirrors the selected people's attribute from
  // the people field with this id (e.g. a "Designation" field driven by a "Name" field).
  people_source_field: number | null;
  people_source_attr: DtmsPeopleAttr;
  // Only meaningful on a people field itself: auto-adds each selected person as a viewer.
  auto_add_viewers: boolean;
}

export interface DtmsDocumentTemplate {
  id: number;
  name: string;
  description: string;
  routing: DtmsTemplateRouting[];
  form_fields: DtmsTemplateFormField[];
  allow_cross_office_routing: boolean;
}

// A row in the editable signatory list — same shape documentApi.send expects on DMT-Front-end.
export interface DtmsSignatoryEntry {
  user_id: number;
  user_email: string;
  user_name: string;
  order: number;
  role: DtmsSignatoryRole;
  files_to_sign?: string;
  assigns_number?: boolean;
  number_label?: string;
  number_prefix?: string;
  number_start?: number;
  number_padding?: number;
  next_template?: number | null;
  instruction_text?: string;
  // Set when this row was auto-added by a "people" field's auto_add_viewers, so a later
  // deselect in that field can remove exactly this row again (and not a manually-added one
  // for the same person). Never sent to the backend — the send endpoint only reads known keys.
  auto_added_field_id?: number;
}

// A signatory row as rendered in the ETMS editor — adds a stable local key since
// user_id alone isn't unique (the same person can hold more than one step).
export interface EditableSignatoryEntry extends DtmsSignatoryEntry {
  localKey: string;
}

export interface DtmsDocumentCreateResult {
  id: number;
  tracknumber: string;
}

// A signatory row as read back from DocumentSerializer for the detail view — status here is
// this specific person's own signing status, not the document's overall status.
export interface DtmsDocumentStatusSignatory {
  id: number;
  user_name: string;
  user_office: string;
  order: number;
  role: DtmsSignatoryRole;
  status: "pending" | "signed" | "rejected" | "viewed";
  signed_at: string | null;
}

// The read-only slice of DocumentSerializer this app needs for the status chip and its
// click-through detail view.
export interface DtmsDocumentStatus {
  id: number;
  tracknumber: string;
  title: string;
  type: string;
  requestor: string;
  position: string;
  message: string;
  status: string;
  total_signatories: number;
  signed_count: number;
  rejected_count: number;
  to_office_name: string | null;
  signatories: DtmsDocumentStatusSignatory[];
}

export type DtmsFieldValue = string | string[];
