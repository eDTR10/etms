import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import EtmHowTo from "../Etm/HowTo";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function HowToContent() {
  const { loading, error } = useTasks();
  return (
    <div>
      <TaskFeedback />
      {!loading && !error && <EtmHowTo />}
    </div>
  );
}

const HowTo = () => (
  <UserLayout title="How To?" subtitle="Step-by-step guides for the most common actions.">
    <TaskProvider>
      <HowToContent />
    </TaskProvider>
  </UserLayout>
);

export default HowTo;
