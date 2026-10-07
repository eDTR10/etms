import AdminLayout from "./AdminLayout";
import QuickLinksProvider from "../../features/quicklinks/QuickLinksProvider";
import { QuickLinksContent } from "../User/QuickLinks";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

export default function AdminQuickLinks() {
  return (
    <AdminLayout title="Quick Links" subtitle="Links you add here are shown to everyone.">
      <QuickLinksProvider>
        <QuickLinksContent />
      </QuickLinksProvider>
    </AdminLayout>
  );
}
