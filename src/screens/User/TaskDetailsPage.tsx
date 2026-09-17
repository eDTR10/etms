import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import TaskDetails from "../../features/tasks/TaskDetails";
import TaskFormDialog from "../../features/tasks/TaskFormDialog";
import { useTasks } from "../../features/tasks/taskContext";
import { useDuplicateTask } from "../../features/tasks/useDuplicateTask";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

export function TaskPageContent({ basePath = "/etms/tasks" }: { basePath?: string } = {}) {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirmDuplicate, isDuplicating } = useDuplicateTask();
  const [editing, setEditing] = useState(false);
  // Captured once on mount — a notification redirect (?hl=task or ?hl=subtask-123)
  // should flash its target only for this one arrival, not again on every re-render
  // or if the URL param lingers after a refresh.
  const hlRef = useRef(searchParams.get("hl"));
  useEffect(() => {
    if (hlRef.current) setSearchParams(params => { params.delete("hl"); return params; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hl = hlRef.current;
  const hlSubtaskMatch = hl?.match(/^subtask-(\d+)$/);
  const highlightSubtaskId = hlSubtaskMatch ? Number(hlSubtaskMatch[1]) : null;
  const highlightHeader = hl === "task";
  const highlightRemarks = hl === "remark";
  const { tasks, members, projects, loading, error, updateTask, addProgress, editProgress, deleteProgress, addRemark, editRemark, deleteRemark, reactToRemark, addRemarkReply, addSubtaskRemark, editSubtaskRemark, deleteSubtaskRemark, reactToSubtaskRemark, addSubtaskRemarkReply, setSubtaskStatus, addSubtask, editSubtask, deleteSubtask, setSubtaskCompletion, reorderSubtasks, addRemarkAttachment, deleteRemarkAttachment, addSubtaskRemarkAttachment, deleteSubtaskRemarkAttachment, markCompletionSeen, markViewed } = useTasks();
  const task = tasks.find(item => item.id === Number(taskId));
  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate(basePath);
  }
  if (loading || error) return <TaskFeedback />;
  if (!task) return <div className="etm-error"><div><strong>Task not found</strong><p>This task may no longer be available.</p></div><button type="button" className="etm-button ghost" onClick={goBack}>Go back</button></div>;
  return <>
    <button type="button" className="etm-button ghost small etm-task-back" onClick={goBack}><ChevronLeft size={15} />Back</button>
    <TaskDetails task={task} open page onClose={goBack} onEdit={() => setEditing(true)} onDuplicate={() => void confirmDuplicate(task)} duplicating={isDuplicating(task.id)} initialSubtaskId={highlightSubtaskId} highlightHeader={highlightHeader} highlightRemarks={highlightRemarks} onProgress={(message, status) => addProgress(task.id, message, status)} onEditProgress={(logId, message) => editProgress(task.id, logId, message)} onDeleteProgress={logId => deleteProgress(task.id, logId)} onAddRemark={(message, file) => addRemark(task.id, message, file)} onEditRemark={(remarkId, message) => editRemark(task.id, remarkId, message)} onDeleteRemark={remarkId => deleteRemark(task.id, remarkId)} onReactRemark={(remarkId, emoji) => reactToRemark(task.id, remarkId, emoji)} onAddRemarkReply={(remarkId, message) => addRemarkReply(task.id, remarkId, message)} onAddSubtaskRemark={(subtaskId, message, file) => addSubtaskRemark(task.id, subtaskId, message, file)} onEditSubtaskRemark={(subtaskId, remarkId, message) => editSubtaskRemark(task.id, subtaskId, remarkId, message)} onDeleteSubtaskRemark={(subtaskId, remarkId) => deleteSubtaskRemark(task.id, subtaskId, remarkId)} onReactSubtaskRemark={(subtaskId, remarkId, emoji) => reactToSubtaskRemark(task.id, subtaskId, remarkId, emoji)} onAddSubtaskRemarkReply={(subtaskId, remarkId, message) => addSubtaskRemarkReply(task.id, subtaskId, remarkId, message)} onSetSubtaskStatus={(subtaskId, message, status) => setSubtaskStatus(task.id, subtaskId, message, status)} onAddSubtask={(title, description, parentId) => addSubtask(task.id, title, description, parentId)} onEditSubtask={(subtaskId, input) => editSubtask(task.id, subtaskId, input)} onDeleteSubtask={subtaskId => deleteSubtask(task.id, subtaskId)} onSetSubtaskCompletion={(subtaskId, complete) => setSubtaskCompletion(task.id, subtaskId, complete)} onReorderSubtasks={(parentId, order) => reorderSubtasks(task.id, parentId, order)} onAddRemarkAttachment={(remarkId, file) => addRemarkAttachment(task.id, remarkId, file)} onDeleteRemarkAttachment={(remarkId, attachmentId) => deleteRemarkAttachment(task.id, remarkId, attachmentId)} onAddSubtaskRemarkAttachment={(subtaskId, remarkId, file) => addSubtaskRemarkAttachment(task.id, subtaskId, remarkId, file)} onDeleteSubtaskRemarkAttachment={(subtaskId, remarkId, attachmentId) => deleteSubtaskRemarkAttachment(task.id, subtaskId, remarkId, attachmentId)} onMarkCompletionSeen={() => markCompletionSeen(task.id)} onMarkViewed={() => markViewed(task.id)} />
    <TaskFormDialog task={task} members={members} projects={projects} open={editing} onClose={() => setEditing(false)} onSave={async input => { await updateTask(task.id, input); }} />
  </>;
}

export default function TaskDetailsPage() {
  return <UserLayout title="Task details" subtitle="Review the task and add progress updates."><TaskProvider><TaskPageContent /></TaskProvider></UserLayout>;
}
