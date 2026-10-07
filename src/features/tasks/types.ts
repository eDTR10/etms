export type Priority = "Low" | "Medium" | "High";
export type TaskStatus = "Pending" | "In-Progress" | "Completed" | "Blocked/Stuck";
// "Lead" (shown as "Task Lead") is a leader the task is sent to for checking / review: an editor's powers, but the work is not assigned to them.
export type AssignmentRole = "Editor" | "Lead" | "Viewer" | "Commentor";
// "Assignee" is someone who was given a subtask rather than a place on the task itself: they see the whole task but
// can only work on their own subtask(s). The server sets it; it is never chosen in the people list.
export type TaskRole = "Owner" | AssignmentRole | "Assignee";
export type Recurrence = "None" | "Daily" | "Weekly" | "Monthly" | "Specific" | "Anytime";

export interface OccurrenceCompletion {
  date: string;
  is_completed: boolean;
  completed_at?: string | null;
  completed_by_name?: string | null;
}

export interface Member {
  id: number;
  first_name: string;
  last_name: string;
  position?: string;
  office?: number | null;
  // Ids of the projects this person belongs to (directory entries, like `office`).
  projects?: number[];
}

export interface Project {
  id: number;
  name: string;
  created_by?: number;
  created_at?: string;
}

export type GroupTargetType = "number" | "percent";

export interface GroupedTaskItem {
  id: number;
  title: string;
  project_name: string;
  created_at: string;
}

export interface GroupedTask {
  id: number;
  grouped_task_id: string;
  name: string;
  project_name: string;
  has_target: boolean;
  target_value: number | null;
  target_type: GroupTargetType;
  tasks: GroupedTaskItem[];
  created_at: string;
}

export interface GroupedTaskInput {
  grouped_task_id: string;
  name: string;
  project_name: string;
  has_target: boolean;
  target_value: number | null;
  target_type: GroupTargetType;
  task_ids: number[];
}

export interface Assignment extends Member {
  // Who put this person on the task (creator, Task Lead or an editor); absent on older assignments.
  assigned_by_name?: string | null;
  assigned_by_roles?: string[];
  role: AssignmentRole | "Assignee";
}

export interface AssignmentInput {
  user: number;
  role: AssignmentRole;
}

export interface Reaction {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
  reactor_names: string[];
  reactor_ids: number[];
}

export interface Remark {
  id: number;
  message: string;
  created_at: string;
  created_by?: number | null;
  created_by_name?: string;
  can_edit: boolean;
  attachments?: Attachment[];
  reactions: Reaction[];
  replies?: Remark[];
}

export const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export interface SubTask {
  id?: number;
  title: string;
  description: string;
  // Optional due date of this subtask (YYYY-MM-DD).
  deadline?: string | null;
  status: TaskStatus;
  is_completed: boolean;
  remarks?: Remark[];
  progress_logs?: SubtaskProgressLog[];
  can_complete?: boolean;
  // Creator-only — narrower than can_complete, which any editor also gets.
  can_delete?: boolean;
  // Who this subtask is assigned to, if anyone.
  assignee?: Member | null;
  // Subtasks of this subtask, unlimited depth.
  subtasks: SubTask[];
  // Tracking number of a DTMS document linked to this subtask (see the dtmsDocument
  // feature) — empty/absent when nothing is linked. Optional like assignee/can_complete
  // above, since a freshly-drafted (not yet saved) subtask has none of these yet.
  // Read-only; set/cleared only via linkSubtaskDocument/unlinkSubtaskDocument, never
  // through editSubtask.
  linked_document_tracknumber?: string;
  // Id of the DTMS document template a document created for this subtask should default
  // to — carried over from the Task Template's own subtask blueprint (see TemplateSubtask
  // below) when a task is created from one. Just a hint for pre-selecting a template in
  // the Create Document dialog, not a live link.
  default_document_template?: number | null;
}

// Walks a subtask tree (any depth) into a single flat list — for stats/gates (completion
// percent, "every subtask must be done before completing the task") that don't care where
// in the tree a subtask sits, only whether it's done.
export function flattenSubtasks(subtasks: SubTask[]): SubTask[] {
  return subtasks.flatMap(subtask => [subtask, ...flattenSubtasks(subtask.subtasks ?? [])]);
}

export interface SubtaskProgressLog {
  id: number;
  message: string;
  status: TaskStatus;
  created_at: string;
  created_by?: number | null;
  created_by_name?: string;
  can_edit: boolean;
}

export interface ProgressLog {
  id: number;
  message: string;
  status: TaskStatus;
  created_at: string;
  created_by?: number | null;
  created_by_name?: string;
  can_edit: boolean;
}

export interface ActivityLogEntry {
  id: number;
  message: string;
  created_at: string;
  actor?: number | null;
  actor_name?: string;
}

export interface Attachment {
  id: number;
  url: string | null;
  original_filename: string;
  size: number;
  created_at: string;
  uploaded_by?: number | null;
  uploaded_by_name?: string;
  can_delete: boolean;
}

export interface Task {
  id: number;
  title: string;
  project: Project | null;
  details: string;
  requestor: string;
  location_province: string;
  location_city: string;
  location_barangay: string;
  priority: Priority;
  deadline: string | null;
  eodb_compliance?: EodbCompliance | "";
  // Off: once the deadline has passed only the owner can complete the task / its subtasks.
  allow_late_submission?: boolean;
  late_submission_blocked?: boolean;
  // The creator's eTMS roles (and 'admin'), used to decide who outranks whom on the dashboard.
  created_by_roles?: string[];
  // Set when the viewer may take back the last turnover; holds the name of whoever has the task now.
  revert_turnover_to?: string | null;
  recurrence: Recurrence;
  recurrence_weekdays: string;
  recurrence_dates: string[];
  occurrence_completions: OccurrenceCompletion[];
  status: TaskStatus;
  is_completed: boolean;
  // When the task as a whole was completed.
  completed_at?: string | null;
  is_archived: boolean;
  completion_seen: boolean;
  is_creator: boolean;
  assignments: Assignment[];
  subtasks: SubTask[];
  remarks: Remark[];
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
  latest_progress_at: string | null;
  progress_logs: ProgressLog[];
  activity_logs: ActivityLogEntry[];
  my_role: TaskRole | null;
  can_edit: boolean;
  can_delete: boolean;
  can_manage_assignments: boolean;
  // Null means "assigned to me but I've never opened it" — the "New" signal. Only ever set
  // for a non-creator assignee's own view of the task (see mark_viewed on the backend).
  my_last_viewed_at: string | null;
  links: TaskLink[];
  created_by?: number | null;
  created_by_name?: string | null;
}

export interface TaskLinkInput {
  title: string;
  url: string;
  quick_link?: number | null;
}

export interface TaskLink extends TaskLinkInput {
  id: number;
}

export interface TemplateSubtask {
  title: string;
  description: string;
  subtasks: TemplateSubtask[];
  // Id of the DTMS document template a document created for this subtask should default
  // to, once a real task/subtask exists — see SubTask.default_document_template.
  default_document_template?: number | null;
}

export function flattenTemplateSubtasks(subtasks: TemplateSubtask[]): TemplateSubtask[] {
  return subtasks.flatMap(subtask => [subtask, ...flattenTemplateSubtasks(subtask.subtasks ?? [])]);
}

export interface TaskTemplate {
  id: number;
  name: string;
  title: string;
  is_personal: boolean;
  project: string;
  details: string;
  requestor: string;
  location_province: string;
  location_city: string;
  location_barangay: string;
  priority: Priority;
  subtasks: TemplateSubtask[];
  assignments: AssignmentInput[];
  created_at: string;
  updated_at: string;
  can_manage: boolean;
}

export interface TaskTemplateInput {
  name: string;
  title: string;
  is_personal: boolean;
  project: string;
  details: string;
  requestor: string;
  location_province: string;
  location_city: string;
  location_barangay: string;
  priority: Priority;
  subtasks: TemplateSubtask[];
  assignments: AssignmentInput[];
}

export interface TaskInput {
  title: string;
  project: string | null;
  details: string;
  requestor: string;
  location_province: string;
  location_city: string;
  location_barangay: string;
  priority: Priority;
  deadline: string | null;
  eodb_compliance?: EodbCompliance | "";
  allow_late_submission?: boolean;
  recurrence: Recurrence;
  recurrence_weekdays: string;
  recurrence_dates: string[];
  status: TaskStatus;
  is_completed: boolean;
  assignments: AssignmentInput[];
  subtasks: SubTask[];
  links?: TaskLinkInput[];
  progress_message?: string;
}

export const STATUSES: TaskStatus[] = ["Pending", "In-Progress", "Completed", "Blocked/Stuck"];
export const PRIORITIES: Priority[] = ["Low", "Medium", "High"];
export const ASSIGNMENT_ROLES: AssignmentRole[] = ["Editor", "Lead", "Commentor", "Viewer"];

export function roleLabel(role: string): string {
  return role === "Lead" ? "Task Lead" : role;
}
// EODB compliance class of a task; picking one in the task form fills the deadline that many days ahead.
export type EodbCompliance = "Simple" | "Complex" | "Highly Technical";
export const EODB_COMPLIANCE: { value: EodbCompliance; days: number }[] = [
  { value: "Simple", days: 3 },
  { value: "Complex", days: 7 },
  { value: "Highly Technical", days: 30 },
];

export const RECURRENCES: Recurrence[] = ["None", "Daily", "Weekly", "Monthly", "Specific", "Anytime"];
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  None: "Does not repeat",
  Daily: "Daily",
  Weekly: "Weekly",
  Monthly: "Monthly",
  Specific: "Specific dates",
  Anytime: "Anytime",
};

// Safe CSS-class form of a status label — handles the "/" in "Blocked/Stuck", which
// a plain `.replace(/\s+/g, "-")` would leave in place (invalid in a class name).
export function statusSlug(status: string): string {
  return status.toLowerCase().replace(/[\s/]+/g, "-");
}

export function memberName(member: Member) {
  return `${member.first_name} ${member.last_name}`.trim();
}

export function stripHtml(value: string): string {
  const documentNode = new DOMParser().parseFromString(value, "text/html");
  return (documentNode.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function remarkPreview(message: string): string {
  const withoutTag = message.replace(/^@Subtask(?:\s+#\d+)?\s+"[^"]*"\s*/, "");
  return stripHtml(withoutTag);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } as const : {}),
  }).format(date);
}

export function isOverdue(task: Task): boolean {
  return !task.is_completed && !!task.deadline && new Date(`${task.deadline}T23:59:59`) < new Date();
}

// Tasks due within this many days (today included) count as "almost due".
export const DUE_SOON_DAYS = 2;

// Whole calendar days from today to the deadline (0 = today, negative = past). Null when
// there's nothing to count down to.
export function daysUntilDue(task: Task): number | null {
  if (task.is_completed || !task.deadline) return null;
  const [year, month, day] = task.deadline.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(year, month - 1, day).getTime() - today.getTime()) / 86_400_000);
}

export function isDueSoon(task: Task): boolean {
  const days = daysUntilDue(task);
  return days !== null && days >= 0 && days <= DUE_SOON_DAYS;
}

export function dueSoonLabel(task: Task): string {
  const days = daysUntilDue(task);
  if (days === 0) return "Due today";
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

export function isUnseenAssignment(task: Task, userId: number | undefined): boolean {
  // A fresh assignment always starts the task at Pending — once it's moved on (In-Progress,
  // Completed, etc.) it's no longer "new", even if this assignee still hasn't opened it.
  return task.status === "Pending" && !task.is_creator && !task.my_last_viewed_at && task.assignments.some(a => a.id === userId);
}

export function completionPercent(task: Task): number {
  const allSubtasks = flattenSubtasks(task.subtasks);
  if (allSubtasks.length) return Math.round(allSubtasks.filter(s => s.is_completed).length / allSubtasks.length * 100);
  return task.is_completed ? 100 : 0;
}

export function formatTaskNumber(id: number): string {
  return `Task No. ${String(id).padStart(3, "0")}`;
}

export function statusChipLabel(task: Task): string {
  const allSubtasks = flattenSubtasks(task.subtasks);
  if (!allSubtasks.length) return task.status;
  const done = allSubtasks.filter(s => s.is_completed).length;
  return `${task.status} (${done}/${allSubtasks.length})`;
}
