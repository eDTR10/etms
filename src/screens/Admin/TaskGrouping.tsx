import AdminLayout from "./AdminLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import { ReportsContent } from "../User/Reports";
import "../../features/tasks/etm-base.css";
import "../../features/tasks/forms.css";
import "../Etm/etm-app.css";

export default function AdminTaskGrouping() {
  return (
    <AdminLayout title="Task Grouping" subtitle="Every completed task across all users — group them into activities for the IPCR.">
      <TaskProvider>
        <ReportsContent taskBasePath="/etms/admin/tasks" showOwner />
      </TaskProvider>
    </AdminLayout>
  );
}
