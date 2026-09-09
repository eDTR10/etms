import { createContext, useContext } from "react";
import type { BulkActionResult } from "./taskService";
import type { Member, Project, Task, TaskInput, TaskStatus } from "./types";

export interface TaskContextValue {
  tasks: Task[];
  members: Member[];
  projects: Project[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  listArchivedTasks: () => Promise<Task[]>;
  addMember: (input: { first_name: string; last_name: string; email: string; position?: string }) => Promise<Member>;
  createTask: (input: TaskInput) => Promise<Task>;
  updateTask: (id: number, input: Partial<TaskInput>) => Promise<Task>;
  deleteTask: (id: number) => Promise<void>;
  addProgress: (id: number, message: string, status: TaskStatus) => Promise<void>;
  editProgress: (id: number, logId: number, message: string) => Promise<void>;
  deleteProgress: (id: number, logId: number) => Promise<void>;
  addRemark: (id: number, message: string, file?: File) => Promise<void>;
  editRemark: (id: number, remarkId: number, message: string) => Promise<void>;
  deleteRemark: (id: number, remarkId: number) => Promise<void>;
  reactToRemark: (id: number, remarkId: number, emoji: string) => Promise<void>;
  addRemarkReply: (id: number, remarkId: number, message: string) => Promise<void>;
  addSubtaskRemark: (id: number, subtaskId: number, message: string, file?: File) => Promise<void>;
  editSubtaskRemark: (id: number, subtaskId: number, remarkId: number, message: string) => Promise<void>;
  deleteSubtaskRemark: (id: number, subtaskId: number, remarkId: number) => Promise<void>;
  reactToSubtaskRemark: (id: number, subtaskId: number, remarkId: number, emoji: string) => Promise<void>;
  addSubtaskRemarkReply: (id: number, subtaskId: number, remarkId: number, message: string) => Promise<void>;
  setSubtaskStatus: (id: number, subtaskId: number, message: string, status: TaskStatus) => Promise<void>;
  addSubtask: (id: number, title: string, description?: string) => Promise<void>;
  editSubtask: (id: number, subtaskId: number, input: { title?: string; description?: string }) => Promise<void>;
  deleteSubtask: (id: number, subtaskId: number) => Promise<void>;
  setSubtaskCompletion: (id: number, subtaskId: number, isCompleted: boolean) => Promise<void>;
  bulkArchive: (ids: number[]) => Promise<BulkActionResult>;
  bulkDelete: (ids: number[]) => Promise<BulkActionResult>;
  addRemarkAttachment: (id: number, remarkId: number, file: File) => Promise<void>;
  deleteRemarkAttachment: (id: number, remarkId: number, attachmentId: number) => Promise<void>;
  addSubtaskRemarkAttachment: (id: number, subtaskId: number, remarkId: number, file: File) => Promise<void>;
  deleteSubtaskRemarkAttachment: (id: number, subtaskId: number, remarkId: number, attachmentId: number) => Promise<void>;
  markCompletionSeen: (id: number) => Promise<void>;
  markViewed: (id: number) => Promise<void>;
}

export const TaskContext = createContext<TaskContextValue | null>(null);
export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) throw new Error("useTasks requires a TaskProvider");
  return context;
}
