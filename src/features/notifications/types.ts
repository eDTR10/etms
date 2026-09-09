export interface AppNotification {
  id: number;
  task: number | null;
  task_title: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}
