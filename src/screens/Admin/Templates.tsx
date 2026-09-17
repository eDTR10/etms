import AdminLayout from "./AdminLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import { TemplatesContent } from "../User/Templates";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

export default function AdminTemplates() {
  return (
    <AdminLayout title="Task Templates" subtitle="Every saved template from every user.">
      <TaskProvider>
        <TemplatesContent />
      </TaskProvider>
    </AdminLayout>
  );
}
