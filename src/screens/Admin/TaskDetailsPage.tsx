import AdminLayout from "./AdminLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import { TaskPageContent } from "../User/TaskDetailsPage";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

export default function AdminTaskDetailsPage() {
  return (
    <AdminLayout title="Task details" subtitle="Review the task and add progress updates.">
      <TaskProvider>
        <TaskPageContent basePath="/etms/admin/tasks" />
      </TaskProvider>
    </AdminLayout>
  );
}
