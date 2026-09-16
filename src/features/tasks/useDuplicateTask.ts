import { useRef, useState } from "react";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { useTasks } from "./taskContext";
import { taskError } from "./taskService";
import type { Task } from "./types";

export function useDuplicateTask() {
  const { duplicateTask, updateTask } = useTasks();
  const navigate = useNavigate();
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  // A ref mirrors the state so the very first re-click is rejected synchronously —
  // React's state update from the first click hasn't necessarily re-rendered yet
  // by the time a rapid second click fires, so the state check alone can't be
  // trusted to block back-to-back taps.
  const pendingRef = useRef<Set<number>>(new Set());

  async function confirmDuplicate(task: Task) {
    if (pendingRef.current.has(task.id)) return;
    pendingRef.current.add(task.id);
    setPendingIds(new Set(pendingRef.current));
    try {
      const copy = await duplicateTask(task.id);
      navigate(`/etms/tasks/${copy.id}`);
      const { value: newTitle } = await Swal.fire({
        title: "Name this duplicate",
        text: "Give the duplicated task a new title, or keep the suggested one.",
        input: "text",
        inputValue: copy.title,
        inputAttributes: { maxlength: "255" },
        showCancelButton: true,
        confirmButtonText: "Save title",
        cancelButtonText: "Keep this title",
        inputValidator: value => (!value || !value.trim() ? "Title can't be empty." : undefined),
      });
      if (typeof newTitle === "string" && newTitle.trim() && newTitle.trim() !== copy.title) {
        try {
          await updateTask(copy.id, { title: newTitle.trim() });
        } catch (renameError) {
          void Swal.fire({ title: "Title couldn't be saved", text: taskError(renameError), icon: "error" });
        }
      }
    } catch (error) {
      void Swal.fire({ title: "Couldn't duplicate task", text: taskError(error), icon: "error" });
    } finally {
      pendingRef.current.delete(task.id);
      setPendingIds(new Set(pendingRef.current));
    }
  }

  function isDuplicating(taskId: number) {
    return pendingIds.has(taskId);
  }

  return { confirmDuplicate, isDuplicating };
}
