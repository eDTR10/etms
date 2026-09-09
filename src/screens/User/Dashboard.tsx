import { useNavigate } from "react-router-dom";
import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import TaskFeedback from "../../features/tasks/TaskFeedback";
import { useTasks } from "../../features/tasks/taskContext";
import EtmOverview from "../Etm/Dashboard";
import { useAuth } from "../Auth/AuthContext";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

function DashboardContent() {
  const { loading, error } = useTasks();
  const navigate = useNavigate();

  return (
    <div>
      <TaskFeedback />
      {!loading && !error && <EtmOverview onViewMajorTasks={() => navigate("/tm/tasks")} />}
    </div>
  );
}

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <UserLayout title="Dashboard" subtitle={`Welcome back, ${user?.first_name ?? "there"} — Electronic Task Management`}>
      <TaskProvider>
        <DashboardContent />
      </TaskProvider>
    </UserLayout>
  );
};

export default Dashboard;
