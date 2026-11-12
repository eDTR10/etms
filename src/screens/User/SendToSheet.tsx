import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Table2 } from "lucide-react";
import UserLayout from "./UserLayout";
import AdminLayout from "../Admin/AdminLayout";
import SheetEntryForm from "../../features/sheets/SheetEntryForm";
import api from "../../plugin/axios";
import type { Task } from "../../features/tasks/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

// The form itself. With ?task=<id> it starts from that task's own details (requestor, place, dates...).
function SendToSheetContent() {
  const [params] = useSearchParams();
  const taskId = Number(params.get("task")) || null;
  const targetId = Number(params.get("target")) || null;
  const [task, setTask] = useState<Task | null>(null);
  useEffect(() => {
    if (!taskId) { setTask(null); return; }
    let cancelled = false;
    api.get<Task>(`etm/tasks/${taskId}/`).then(response => { if (!cancelled) setTask(response.data); }).catch(() => { if (!cancelled) setTask(null); });
    return () => { cancelled = true; };
  }, [taskId]);
  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><Table2 size={15} /> Google Sheets</p>
          <h2>Send to Sheet</h2>
          <p>{task ? `Starting from “${task.title}”. ` : ""}Fill in the fields (the choices are the sheet’s own). Each send adds one new line at the bottom of the sheet; rows can’t be removed from here.</p>
        </div>
      </section>
      {/* Remount when another task is opened so the form starts from it. */}
      <SheetEntryForm key={task?.id ?? "none"} initialTargetId={targetId} task={task} />
    </div>
  );
}

export default function SendToSheet() {
  return (
    <UserLayout title="Send to Sheet" subtitle="Add a task’s details as a new line in a Google Sheet.">
      <SendToSheetContent />
    </UserLayout>
  );
}

export function AdminSendToSheet() {
  return (
    <AdminLayout title="Send to Sheet" subtitle="Add a task’s details as a new line in a Google Sheet.">
      <SendToSheetContent />
    </AdminLayout>
  );
}
