import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import AdminLayout from "./AdminLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import EtmMajorTasks from "../Etm/MajorTasks";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function TasksContent() {
  const { loading, error } = useTasks();
  return (
    <div>
      <TaskFeedback />
      <div className="etm-report-heading">
        <div><p className="etm-report-eyebrow">Full access</p><h2>All Tasks</h2></div>
        <Link to="/etms/admin/tasks/new" className="etm-button"><Plus size={16} /> New Task</Link>
      </div>
      {!loading && !error && <EtmMajorTasks basePath="/etms/admin/tasks" />}
    </div>
  );
}

export default function AdminTasks() {
  return (
    <AdminLayout title="Tasks" subtitle="Every task from every user — full create, edit, and delete access.">
      <TaskProvider>
        <TasksContent />
      </TaskProvider>
    </AdminLayout>
  );
}
