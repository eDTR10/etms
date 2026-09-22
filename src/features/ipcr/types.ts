export type IPCRRowKind = "program" | "function" | "kra" | "data";

export interface IPCRTemplateRow {
  kind: IPCRRowKind;
  // Used by program/function/kra banner rows.
  text?: string;
  // Used by data rows.
  output?: string;
  indicator?: string;
}

export interface IPCRTemplate {
  id: number;
  name: string;
  rows: IPCRTemplateRow[];
  created_at: string;
  updated_at: string;
  can_manage: boolean;
}

export interface IPCRTemplateInput {
  name: string;
  rows: IPCRTemplateRow[];
}

export interface IPCRSubmissionRow extends IPCRTemplateRow {
  grouped_task_ids?: number[];
  actual_accomplishments?: string;
  rating_q?: number | null;
  rating_e?: number | null;
  rating_t?: number | null;
  rating_a?: number | null;
  remarks?: string;
}

export interface IPCRSubmission {
  id: number;
  template: number | null;
  period_label: string;
  commitment_date: string | null;
  employee_name: string;
  employee_position: string;
  employee_office: string;
  reviewed_by_name: string;
  reviewed_by_title: string;
  approved_by_name: string;
  approved_by_title: string;
  discussed_at: string | null;
  assessed_at: string | null;
  final_rating_at: string | null;
  rows: IPCRSubmissionRow[];
  areas_of_strength: string[];
  strength_interventions: string[];
  areas_for_development: string[];
  development_interventions: string[];
  final_rating: number | null;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
}

export type IPCRSubmissionInput = Omit<IPCRSubmission, "id" | "final_rating" | "created_at" | "updated_at" | "can_manage">;

export const RATING_SCALE: { value: number; label: string }[] = [
  { value: 5, label: "Outstanding" },
  { value: 4, label: "Very Satisfactory" },
  { value: 3, label: "Satisfactory" },
  { value: 2, label: "Unsatisfactory" },
  { value: 1, label: "Poor" },
];

export function adjectivalRating(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "";
  if (value >= 5) return "Outstanding";
  if (value >= 4) return "Very Satisfactory";
  if (value >= 3) return "Satisfactory";
  if (value >= 2) return "Unsatisfactory";
  if (value >= 1) return "Poor";
  return "";
}
