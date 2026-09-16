export type NotificationCategory = "status" | "assignment" | "remark" | "mention" | "viewed";

export interface AppNotification {
  id: number;
  task: number | null;
  task_title: string | null;
  subtask: number | null;
  category: NotificationCategory;
  message: string;
  is_read: boolean;
  created_at: string;
}
