import AdminLayout from "./AdminLayout";
import QuickLinksProvider from "../../features/quicklinks/QuickLinksProvider";
import { QuickLinksContent } from "../User/QuickLinks";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

export default function AdminQuickLinks() {
  return (
    <AdminLayout title="Quick Links" subtitle="Every saved quick link from every user.">
      <QuickLinksProvider>
        <QuickLinksContent />
      </QuickLinksProvider>
    </AdminLayout>
  );
}
