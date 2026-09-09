import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TaskContext } from "./taskContext";
import { taskError, taskService } from "./taskService";
import type { Member, Project, Task, TaskInput, TaskStatus } from "./types";

export default function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRows, memberRows, projectRows] = await Promise.all([taskService.list(), taskService.members(), taskService.projects()]);
      setTasks(taskRows);
      setMembers(memberRows);
      setProjects(projectRows);
    } catch (err) {
      setError(taskError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const listArchivedTasks = async () => taskService.listArchived();
  const addMember = async (input: { first_name: string; last_name: string; email: string; position?: string }) => {
    const member = await taskService.addMember(input);
    setMembers(current => [...current, member]);
    return member;
  };

  const replace = (task: Task) => {
    setTasks(current => current.map(row => row.id === task.id ? task : row));
    return task;
  };
  const createTask = async (input: TaskInput) => {
    const task = await taskService.create(input);
    setTasks(current => [task, ...current]);
    return task;
  };
  const updateTask = async (id: number, input: Partial<TaskInput>) => replace(await taskService.update(id, input));
  const deleteTask = async (id: number) => {
    await taskService.remove(id);
    setTasks(current => current.filter(task => task.id !== id));
  };
  const addProgress = async (id: number, message: string, status: TaskStatus) => {
    replace(await taskService.progress(id, message, status));
  };
  const editProgress = async (id: number, logId: number, message: string) => {
    replace(await taskService.editProgress(id, logId, message));
  };
  const deleteProgress = async (id: number, logId: number) => {
    replace(await taskService.deleteProgress(id, logId));
  };
  const addRemark = async (id: number, message: string, file?: File) => {
    const updated = await taskService.addRemark(id, message);
    const newRemarkId = file ? updated.remarks[0]?.id : undefined;
    replace(newRemarkId ? await taskService.addRemarkAttachment(id, newRemarkId, file!) : updated);
  };
  const editRemark = async (id: number, remarkId: number, message: string) => {
    replace(await taskService.editRemark(id, remarkId, message));
  };
  const deleteRemark = async (id: number, remarkId: number) => {
    replace(await taskService.deleteRemark(id, remarkId));
  };
  const reactToRemark = async (id: number, remarkId: number, emoji: string) => {
    replace(await taskService.reactToRemark(id, remarkId, emoji));
  };
  const addSubtaskRemark = async (id: number, subtaskId: number, message: string, file?: File) => {
    const updated = await taskService.addSubtaskRemark(id, subtaskId, message);
    const newRemarkId = file ? updated.subtasks.find(subtask => subtask.id === subtaskId)?.remarks?.[0]?.id : undefined;
    replace(newRemarkId ? await taskService.addSubtaskRemarkAttachment(id, subtaskId, newRemarkId, file!) : updated);
  };
  const editSubtaskRemark = async (id: number, subtaskId: number, remarkId: number, message: string) => {
    replace(await taskService.editSubtaskRemark(id, subtaskId, remarkId, message));
  };
  const deleteSubtaskRemark = async (id: number, subtaskId: number, remarkId: number) => {
    replace(await taskService.deleteSubtaskRemark(id, subtaskId, remarkId));
  };
  const reactToSubtaskRemark = async (id: number, subtaskId: number, remarkId: number, emoji: string) => {
    replace(await taskService.reactToSubtaskRemark(id, subtaskId, remarkId, emoji));
  };
  const setSubtaskStatus = async (id: number, subtaskId: number, message: string, status: TaskStatus) => {
    replace(await taskService.setSubtaskStatus(id, subtaskId, message, status));
  };
  const addSubtask = async (id: number, title: string, description?: string) => {
    replace(await taskService.addSubtask(id, title, description));
  };
  const editSubtask = async (id: number, subtaskId: number, input: { title?: string; description?: string }) => {
    replace(await taskService.editSubtask(id, subtaskId, input));
  };
  const deleteSubtask = async (id: number, subtaskId: number) => {
    replace(await taskService.deleteSubtask(id, subtaskId));
  };
  const setSubtaskCompletion = async (id: number, subtaskId: number, isCompleted: boolean) => {
    replace(await taskService.setSubtaskCompletion(id, subtaskId, isCompleted));
  };
  const bulkArchive = async (ids: number[]) => {
    const result = await taskService.bulkArchive(ids);
    setTasks(current => current.filter(task => !result.succeeded.includes(task.id)));
    return result;
  };
  const bulkDelete = async (ids: number[]) => {
    const result = await taskService.bulkDelete(ids);
    setTasks(current => current.filter(task => !result.succeeded.includes(task.id)));
    return result;
  };
  const addRemarkAttachment = async (id: number, remarkId: number, file: File) => {
    replace(await taskService.addRemarkAttachment(id, remarkId, file));
  };
  const deleteRemarkAttachment = async (id: number, remarkId: number, attachmentId: number) => {
    replace(await taskService.deleteRemarkAttachment(id, remarkId, attachmentId));
  };
  const addSubtaskRemarkAttachment = async (id: number, subtaskId: number, remarkId: number, file: File) => {
    replace(await taskService.addSubtaskRemarkAttachment(id, subtaskId, remarkId, file));
  };
  const deleteSubtaskRemarkAttachment = async (id: number, subtaskId: number, remarkId: number, attachmentId: number) => {
    replace(await taskService.deleteSubtaskRemarkAttachment(id, subtaskId, remarkId, attachmentId));
  };
  const markCompletionSeen = async (id: number) => {
    replace(await taskService.markCompletionSeen(id));
  };
  const markViewed = async (id: number) => {
    replace(await taskService.markViewed(id));
  };

  return <TaskContext.Provider value={{ tasks, members, projects, loading, error, refresh, listArchivedTasks, addMember, createTask, updateTask, deleteTask, addProgress, editProgress, deleteProgress, addRemark, editRemark, deleteRemark, reactToRemark, addSubtaskRemark, editSubtaskRemark, deleteSubtaskRemark, reactToSubtaskRemark, setSubtaskStatus, addSubtask, editSubtask, deleteSubtask, setSubtaskCompletion, bulkArchive, bulkDelete, addRemarkAttachment, deleteRemarkAttachment, addSubtaskRemarkAttachment, deleteSubtaskRemarkAttachment, markCompletionSeen, markViewed }}>{children}</TaskContext.Provider>;
}
