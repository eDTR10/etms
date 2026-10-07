import UserLayout from "./UserLayout";
import TaskProvider from "../../features/tasks/TaskProvider";
import IPCRComingSoon, { IPCR_COMING_SOON } from "../../features/ipcr/IPCRComingSoon";
import GenerateIPCRContent from "../../features/ipcr/GenerateIPCRContent";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

export default function GenerateIPCR() {
  return (
    <UserLayout title="Generate IPCR" subtitle="Turn your grouped activities into a ready-to-file IPCR.">
      {IPCR_COMING_SOON ? <IPCRComingSoon /> : (
        <TaskProvider>
          <GenerateIPCRContent />
        </TaskProvider>
      )}
    </UserLayout>
  );
}
