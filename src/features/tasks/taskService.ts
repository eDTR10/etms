import axios from "axios";
import api from "../../plugin/axios";
import type { GroupedTask, GroupedTaskInput, Member, Project, Task, TaskInput, TaskStatus, TaskTemplate, TaskTemplateInput } from "./types";

export interface BulkActionResult {
  succeeded: number[];
  skipped: number[];
}

interface OfficeDirectoryItem {
  officeID: number;
  name: string;
}

export const taskService = {
  list: async () => (await api.get<Task[]>("etm/tasks/")).data,
  listGroupedTasks: async () => (await api.get<GroupedTask[]>("etm/grouped-tasks/")).data,
  createGroupedTask: async (input: GroupedTaskInput) => (await api.post<GroupedTask>("etm/grouped-tasks/", input)).data,
  updateGroupedTask: async (id: number, input: Partial<GroupedTaskInput>) =>
    (await api.patch<GroupedTask>(`etm/grouped-tasks/${id}/`, input)).data,
  deleteGroupedTask: async (id: number) => { await api.delete(`etm/grouped-tasks/${id}/`); },
  listArchived: async () => (await api.get<Task[]>("etm/tasks/", { params: { archived: "1" } })).data,
  members: async () => (await api.get<Member[]>("etm/members/")).data,
  addMember: async (input: { first_name: string; last_name: string; email: string; position?: string }) =>
    (await api.post<Member>("etm/members/quick-add/", input)).data,
  projects: async () => {
    const { data } = await api.get<OfficeDirectoryItem[]>("office/");
    return data.map(office => ({ id: office.officeID, name: office.name } satisfies Project));
  },
  create: async (input: TaskInput) => (await api.post<Task>("etm/tasks/", input)).data,
  update: async (id: number, input: Partial<TaskInput>) => (await api.patch<Task>(`etm/tasks/${id}/`, input)).data,
  remove: async (id: number) => { await api.delete(`etm/tasks/${id}/`); },
  duplicate: async (id: number) => (await api.post<Task>(`etm/tasks/${id}/duplicate/`)).data,
  toggleOccurrence: async (id: number, date: string) => (await api.post<Task>(`etm/tasks/${id}/occurrences/${date}/toggle/`)).data,
  progress: async (id: number, message: string, status: TaskStatus) =>
    (await api.post<Task>(`etm/tasks/${id}/progress/`, { message, status })).data,
  editProgress: async (id: number, logId: number, message: string) =>
    (await api.patch<Task>(`etm/tasks/${id}/progress/${logId}/`, { message })).data,
  deleteProgress: async (id: number, logId: number) =>
    (await api.delete<Task>(`etm/tasks/${id}/progress/${logId}/`)).data,
  addRemark: async (id: number, message: string) =>
    (await api.post<Task>(`etm/tasks/${id}/remarks/`, { message })).data,
  editRemark: async (id: number, remarkId: number, message: string) =>
    (await api.patch<Task>(`etm/tasks/${id}/remarks/${remarkId}/`, { message })).data,
  deleteRemark: async (id: number, remarkId: number) =>
    (await api.delete<Task>(`etm/tasks/${id}/remarks/${remarkId}/`)).data,
  reactToRemark: async (id: number, remarkId: number, emoji: string) =>
    (await api.post<Task>(`etm/tasks/${id}/remarks/${remarkId}/reactions/`, { emoji })).data,
  addRemarkReply: async (id: number, remarkId: number, message: string) =>
    (await api.post<Task>(`etm/tasks/${id}/remarks/${remarkId}/replies/`, { message })).data,
  addSubtaskRemark: async (id: number, subtaskId: number, message: string) =>
    (await api.post<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/remarks/`, { message })).data,
  editSubtaskRemark: async (id: number, subtaskId: number, remarkId: number, message: string) =>
    (await api.patch<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/remarks/${remarkId}/`, { message })).data,
  deleteSubtaskRemark: async (id: number, subtaskId: number, remarkId: number) =>
    (await api.delete<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/remarks/${remarkId}/`)).data,
  reactToSubtaskRemark: async (id: number, subtaskId: number, remarkId: number, emoji: string) =>
    (await api.post<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/remarks/${remarkId}/reactions/`, { emoji })).data,
  addSubtaskRemarkReply: async (id: number, subtaskId: number, remarkId: number, message: string) =>
    (await api.post<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/remarks/${remarkId}/replies/`, { message })).data,
  setSubtaskStatus: async (id: number, subtaskId: number, message: string, status: TaskStatus) =>
    (await api.post<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/progress/`, { message, status })).data,
  addSubtask: async (id: number, title: string, description = "", parentId?: number) =>
    (await api.post<Task>(`etm/tasks/${id}/subtasks/`, { title, description, ...(parentId !== undefined ? { parent: parentId } : {}) })).data,
  editSubtask: async (id: number, subtaskId: number, input: { title?: string; description?: string }) =>
    (await api.patch<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/`, input)).data,
  deleteSubtask: async (id: number, subtaskId: number) =>
    (await api.delete<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/`)).data,
  setSubtaskCompletion: async (id: number, subtaskId: number, is_completed: boolean) =>
    (await api.post<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/completion/`, { is_completed })).data,
  reorderSubtasks: async (id: number, parentId: number | null, order: number[]) =>
    (await api.post<Task>(`etm/tasks/${id}/subtasks/reorder/`, { parent: parentId, order })).data,
  bulkArchive: async (ids: number[]) =>
    (await api.post<BulkActionResult>("etm/tasks/bulk-archive/", { ids })).data,
  bulkDelete: async (ids: number[]) =>
    (await api.post<BulkActionResult>("etm/tasks/bulk-delete/", { ids })).data,
  addRemarkAttachment: async (id: number, remarkId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return (await api.post<Task>(`etm/tasks/${id}/remarks/${remarkId}/attachments/`, formData, { headers: { "Content-Type": "multipart/form-data" } })).data;
  },
  deleteRemarkAttachment: async (id: number, remarkId: number, attachmentId: number) =>
    (await api.delete<Task>(`etm/tasks/${id}/remarks/${remarkId}/attachments/${attachmentId}/`)).data,
  addSubtaskRemarkAttachment: async (id: number, subtaskId: number, remarkId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return (await api.post<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/remarks/${remarkId}/attachments/`, formData, { headers: { "Content-Type": "multipart/form-data" } })).data;
  },
  deleteSubtaskRemarkAttachment: async (id: number, subtaskId: number, remarkId: number, attachmentId: number) =>
    (await api.delete<Task>(`etm/tasks/${id}/subtasks/${subtaskId}/remarks/${remarkId}/attachments/${attachmentId}/`)).data,
  markCompletionSeen: async (id: number) =>
    (await api.post<Task>(`etm/tasks/${id}/mark-completion-seen/`)).data,
  markViewed: async (id: number) =>
    (await api.post<Task>(`etm/tasks/${id}/mark-viewed/`)).data,
  listTemplates: async () => (await api.get<TaskTemplate[]>("etm/task-templates/")).data,
  createTemplate: async (input: TaskTemplateInput) => (await api.post<TaskTemplate>("etm/task-templates/", input)).data,
  updateTemplate: async (id: number, input: TaskTemplateInput) => (await api.patch<TaskTemplate>(`etm/task-templates/${id}/`, input)).data,
  deleteTemplate: async (id: number) => { await api.delete(`etm/task-templates/${id}/`); },
};

export function taskError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data?.detail === "string") return data.detail;
    if (data && typeof data === "object") {
      const messages = Object.entries(data).map(([field, value]) => `${field.split("_").join(" ")}: ${Array.isArray(value) ? value.join(" ") : String(value)}`);
      if (messages.length) return messages.join(" · ");
    }
    if (!error.response) return "We couldn’t reach the server. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
