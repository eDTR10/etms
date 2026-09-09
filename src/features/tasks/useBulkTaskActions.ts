import Swal from "sweetalert2";
import { useTasks } from "./taskContext";
import { taskError } from "./taskService";

function summarize(succeeded: number[], skipped: number[], verb: string) {
  if (skipped.length === 0) {
    return { title: `${succeeded.length} task${succeeded.length === 1 ? "" : "s"} ${verb}`, icon: "success" as const };
  }
  if (succeeded.length === 0) {
    return { title: "Nothing changed", text: `You don't have permission to ${verb === "archived" ? "archive" : "delete"} the selected task${skipped.length === 1 ? "" : "s"}.`, icon: "warning" as const };
  }
  return {
    title: `${succeeded.length} task${succeeded.length === 1 ? "" : "s"} ${verb}`,
    text: `${skipped.length} skipped — you don't have permission to ${verb === "archived" ? "archive" : "delete"} ${skipped.length === 1 ? "it" : "them"}.`,
    icon: "warning" as const,
  };
}

export function useBulkTaskActions() {
  const { bulkArchive, bulkDelete } = useTasks();

  const confirmArchive = async (ids: number[]) => {
    const result = await Swal.fire({
      title: `Archive ${ids.length} task${ids.length === 1 ? "" : "s"}?`,
      text: "Archived tasks are hidden from your lists. You can restore them from the admin panel.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Archive",
      confirmButtonColor: "#c98a2c",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-warning-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      const { succeeded, skipped } = await bulkArchive(ids);
      void Swal.fire({ ...summarize(succeeded, skipped, "archived"), timer: skipped.length ? undefined : 1600, showConfirmButton: !!skipped.length });
    } catch (error) {
      void Swal.fire({ title: "Couldn't archive tasks", text: taskError(error), icon: "error" });
    }
  };

  const confirmDelete = async (ids: number[]) => {
    const result = await Swal.fire({
      title: `Delete ${ids.length} task${ids.length === 1 ? "" : "s"}?`,
      text: "These tasks and all of their subtasks and progress history will be permanently removed.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-danger-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      const { succeeded, skipped } = await bulkDelete(ids);
      void Swal.fire({ ...summarize(succeeded, skipped, "deleted"), timer: skipped.length ? undefined : 1600, showConfirmButton: !!skipped.length });
    } catch (error) {
      void Swal.fire({ title: "Couldn't delete tasks", text: taskError(error), icon: "error" });
    }
  };

  return { confirmArchive, confirmDelete };
}
