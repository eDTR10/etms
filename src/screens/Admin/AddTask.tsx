import { useNavigate } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import EtmAddTask from "../Etm/AddTask";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function AddTaskContent() {
  const { loading, error } = useTasks();
  const navigate = useNavigate();

  return (
    <div>
      <TaskFeedback />
      {!loading && !error && <EtmAddTask onCreated={() => navigate("/etms/admin/tasks")} onCancel={() => navigate("/etms/admin/tasks")} />}
    </div>
  );
}

export default function AdminAddTask() {
  return (
    <AdminLayout title="Add Task" subtitle="Create a task on behalf of any user or project.">
      <TaskProvider>
        <AddTaskContent />
      </TaskProvider>
    </AdminLayout>
  );
}
