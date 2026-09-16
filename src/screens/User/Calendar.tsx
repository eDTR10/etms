import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import EtmCalendar from "../Etm/Calendar";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function CalendarContent() {
  const { loading, error } = useTasks();
  return (
    <div>
      <TaskFeedback />
      {!loading && !error && <EtmCalendar />}
    </div>
  );
}

const Calendar = () => (
  <UserLayout title="Calendar" subtitle="See what's due, day by day.">
    <TaskProvider>
      <CalendarContent />
    </TaskProvider>
  </UserLayout>
);

export default Calendar;
