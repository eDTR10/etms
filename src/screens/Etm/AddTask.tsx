import Swal from "sweetalert2";
import { useTasks } from "../../features/tasks/taskContext";
import TaskForm from "../../features/tasks/TaskForm";

interface AddTaskProps {
  onCreated: () => void;
  onCancel: () => void;
}

export default function AddTask({ onCreated, onCancel }: AddTaskProps) {
  const { members, projects, createTask } = useTasks();

  return (
    <div>
      <TaskForm
        members={members}
        projects={projects}
        onSave={async input => {
          await createTask(input);
          await Swal.fire({ title: "Task created", icon: "success", timer: 1400, showConfirmButton: false });
          onCreated();
        }}
        onCancel={onCancel}
      />
    </div>
  );
}
