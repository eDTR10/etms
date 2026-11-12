import SheetTasksPage from "../../features/sheets/SheetTasksPage";

// The columns of the TOD sheet that get a dropdown filter.
const FILTERS = ["Encoded by", "Status", "Service Requested", "Type", "Project / Division", "Agency Type", "Assigned Personnel"];

// What a row becomes as a task: the cells (by title) for its title, description and remarks.
const TASK_FROM = { title: "Ticket ID", details: "Request Details", log: "Progress Log", link: "Letter response link" };

// Shown right after "Agency Type", in this order.
const MOVES = { after: "Agency Type", columns: ["Assigned Personnel", "Request Details", "Progress Log"] };

export function AdminTodTasks() {
  return <SheetTasksPage admin cardKey="tod-tasks" title="TOD Tasks" subtitle="Technical Operations Division" filterLabels={FILTERS} latestLabel="Logged/Routed" moveColumns={MOVES} taskFrom={TASK_FROM} />;
}

export default function TodTasks() {
  return <SheetTasksPage cardKey="tod-tasks" title="TOD Tasks" subtitle="Technical Operations Division" filterLabels={FILTERS} latestLabel="Logged/Routed" moveColumns={MOVES} taskFrom={TASK_FROM} />;
}
