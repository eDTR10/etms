import { useEffect, useState } from "react";
import { useAuth } from "../../screens/Auth/AuthContext";
import { taskService } from "./taskService";
import { isUnseenAssignment } from "./types";

// Layout-level nav badge: how many tasks are newly assigned to the current user and
// still unopened. Fetched independently since the layout sits above any page's own
// TaskProvider (see UserLayout/AdminLayout nesting) and so can't reuse useTasks().
export function useUnseenAssignedCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tasks = await taskService.list();
        if (!cancelled) setCount(tasks.filter(task => isUnseenAssignment(task, user?.id)).length);
      } catch {
        // Non-critical background fetch — the badge just stays quiet on failure.
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return count;
}
