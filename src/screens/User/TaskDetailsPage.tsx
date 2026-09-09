import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import TaskDetails from "../../features/tasks/TaskDetails";
import { useTasks } from "../../features/tasks/taskContext";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function TaskPageContent() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { tasks, loading, error, addProgress, editProgress, deleteProgress, addRemark, editRemark, deleteRemark, reactToRemark, addSubtaskRemark, editSubtaskRemark, deleteSubtaskRemark, reactToSubtaskRemark, setSubtaskStatus, addSubtask, editSubtask, deleteSubtask, setSubtaskCompletion, addRemarkAttachment, deleteRemarkAttachment, addSubtaskRemarkAttachment, deleteSubtaskRemarkAttachment, markCompletionSeen, markViewed } = useTasks();
  const task = tasks.find(item => item.id === Number(taskId));
  if (loading || error) return <TaskFeedback />;
  if (!task) return <div className="etm-error"><div><strong>Task not found</strong><p>This task may no longer be available.</p></div><button type="button" className="etm-button ghost" onClick={() => navigate("/etms/tasks")}>Back to All Tasks</button></div>;
  return <>
    <nav className="etm-breadcrumb" aria-label="Breadcrumb"><Link to="/etms/tasks">All Tasks</Link><ChevronRight size={15} /><span aria-current="page">{task.title}</span></nav>
    <TaskDetails task={task} open page onClose={() => navigate("/etms/tasks")} onEdit={() => undefined} onProgress={(message, status) => addProgress(task.id, message, status)} onEditProgress={(logId, message) => editProgress(task.id, logId, message)} onDeleteProgress={logId => deleteProgress(task.id, logId)} onAddRemark={(message, file) => addRemark(task.id, message, file)} onEditRemark={(remarkId, message) => editRemark(task.id, remarkId, message)} onDeleteRemark={remarkId => deleteRemark(task.id, remarkId)} onReactRemark={(remarkId, emoji) => reactToRemark(task.id, remarkId, emoji)} onAddSubtaskRemark={(subtaskId, message, file) => addSubtaskRemark(task.id, subtaskId, message, file)} onEditSubtaskRemark={(subtaskId, remarkId, message) => editSubtaskRemark(task.id, subtaskId, remarkId, message)} onDeleteSubtaskRemark={(subtaskId, remarkId) => deleteSubtaskRemark(task.id, subtaskId, remarkId)} onReactSubtaskRemark={(subtaskId, remarkId, emoji) => reactToSubtaskRemark(task.id, subtaskId, remarkId, emoji)} onSetSubtaskStatus={(subtaskId, message, status) => setSubtaskStatus(task.id, subtaskId, message, status)} onAddSubtask={(title, description) => addSubtask(task.id, title, description)} onEditSubtask={(subtaskId, input) => editSubtask(task.id, subtaskId, input)} onDeleteSubtask={subtaskId => deleteSubtask(task.id, subtaskId)} onSetSubtaskCompletion={(subtaskId, complete) => setSubtaskCompletion(task.id, subtaskId, complete)} onAddRemarkAttachment={(remarkId, file) => addRemarkAttachment(task.id, remarkId, file)} onDeleteRemarkAttachment={(remarkId, attachmentId) => deleteRemarkAttachment(task.id, remarkId, attachmentId)} onAddSubtaskRemarkAttachment={(subtaskId, remarkId, file) => addSubtaskRemarkAttachment(task.id, subtaskId, remarkId, file)} onDeleteSubtaskRemarkAttachment={(subtaskId, remarkId, attachmentId) => deleteSubtaskRemarkAttachment(task.id, subtaskId, remarkId, attachmentId)} onMarkCompletionSeen={() => markCompletionSeen(task.id)} onMarkViewed={() => markViewed(task.id)} />
  </>;
}

export default function TaskDetailsPage() {
  return <UserLayout title="Task details" subtitle="Review the task and add progress updates."><TaskProvider><TaskPageContent /></TaskProvider></UserLayout>;
}
