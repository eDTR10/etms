import Swal from "sweetalert2";
import { useTasks } from "./taskContext";
import { taskError } from "./taskService";
import type { Task } from "./types";

export function useDeleteTaskConfirm() {
  const { deleteTask } = useTasks();

  return async function confirmDelete(task: Task) {
    const result = await Swal.fire({
      title: "Delete this task?",
      text: `"${task.title}" and all of its subtasks and progress history will be permanently removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-danger-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      await deleteTask(task.id);
      void Swal.fire({ title: "Task deleted", icon: "success", timer: 1400, showConfirmButton: false });
    } catch (error) {
      void Swal.fire({ title: "Couldn't delete task", text: taskError(error), icon: "error" });
    }
  };
}
