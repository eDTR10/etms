import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import EtmMajorTasks from "../Etm/MajorTasks";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function AllTasksContent() {
  const { loading, error } = useTasks();
  return (
    <div>
      <TaskFeedback />
      {!loading && !error && <EtmMajorTasks />}
    </div>
  );
}

const AllTasks = () => (
  <UserLayout title="All Tasks" subtitle="Every task visible to you, with its subtasks a tap away.">
    <TaskProvider>
      <AllTasksContent />
    </TaskProvider>
  </UserLayout>
);

export default AllTasks;
