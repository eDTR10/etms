import { useNavigate } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import EtmOverview from "../Etm/Dashboard";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function DashboardContent() {
  const { loading, error } = useTasks();
  const navigate = useNavigate();

  return (
    <div>
      <TaskFeedback />
      {!loading && !error && <EtmOverview onViewMajorTasks={() => navigate("/etms/admin/tasks")} basePath="/etms/admin/tasks" />}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <AdminLayout title="Admin Dashboard" subtitle="Charts and recently added tasks, across every user.">
      <TaskProvider>
        <DashboardContent />
      </TaskProvider>
    </AdminLayout>
  );
}
