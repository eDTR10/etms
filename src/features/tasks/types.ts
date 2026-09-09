export type Priority = "Low" | "Medium" | "High";
export type TaskStatus = "Pending" | "Ongoing" | "On hold" | "For Approval" | "For Signing" | "For Sending" | "Completed";
export type AssignmentRole = "Editor" | "Viewer" | "Commentor";
export type TaskRole = "Owner" | AssignmentRole;

export interface Member {
  id: number;
  first_name: string;
  last_name: string;
  position?: string;
}

export interface Project {
  id: number;
  name: string;
  created_by?: number;
  created_at?: string;
}

export interface Assignment extends Member {
  role: AssignmentRole;
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
}

export const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export interface SubTask {
  id?: number;
  title: string;
  description: string;
  status: TaskStatus;
  is_completed: boolean;
  remarks?: Remark[];
  progress_logs?: SubtaskProgressLog[];
  can_complete?: boolean;
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
  priority: Priority;
  deadline: string | null;
  status: TaskStatus;
  is_completed: boolean;
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
}

export interface TaskInput {
  title: string;
  project: string | null;
  details: string;
  requestor: string;
  priority: Priority;
  deadline: string | null;
  status: TaskStatus;
  is_completed: boolean;
  assignments: AssignmentInput[];
  subtasks: SubTask[];
  progress_message?: string;
}

export const STATUSES: TaskStatus[] = ["Pending", "Ongoing", "On hold", "For Approval", "For Signing", "For Sending", "Completed"];
export const PRIORITIES: Priority[] = ["Low", "Medium", "High"];
export const ASSIGNMENT_ROLES: AssignmentRole[] = ["Editor", "Commentor", "Viewer"];

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

export function completionPercent(task: Task): number {
  if (task.subtasks.length) return Math.round(task.subtasks.filter(s => s.is_completed).length / task.subtasks.length * 100);
  return task.is_completed ? 100 : 0;
}

export function formatTaskNumber(id: number): string {
  return `Task No. ${String(id).padStart(3, "0")}`;
}

export function statusChipLabel(task: Task): string {
  if (!task.subtasks.length) return task.status;
  const done = task.subtasks.filter(s => s.is_completed).length;
  return `${task.status} (${done}/${task.subtasks.length})`;
}
