import AdminLayout from "./AdminLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import EtmCalendar from "../Etm/Calendar";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function AdminCalendarContent() {
  const { loading, error } = useTasks();
  return (
    <div>
      <TaskFeedback />
      {!loading && !error && <EtmCalendar basePath="/etms/admin/tasks" showOwner />}
    </div>
  );
}

export default function AdminCalendar() {
  return (
    <AdminLayout title="Calendar" subtitle="Every user's tasks, day by day.">
      <TaskProvider>
        <AdminCalendarContent />
      </TaskProvider>
    </AdminLayout>
  );
}
