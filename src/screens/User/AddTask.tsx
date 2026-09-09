import { useNavigate } from "react-router-dom";
import UserLayout from "./UserLayout";
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
      {!loading && !error && <EtmAddTask onCreated={() => navigate("/tm/tasks")} onCancel={() => navigate("/tm/dashboard")} />}
    </div>
  );
}

const AddTask = () => (
  <UserLayout title="Add Task" subtitle="Create a task and decide who's assigned later if you'd rather.">
    <TaskProvider>
      <AddTaskContent />
    </TaskProvider>
  </UserLayout>
);

export default AddTask;
