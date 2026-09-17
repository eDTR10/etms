import AdminLayout from "./AdminLayout";
import { ProfileContent } from "../User/Profile";

export default function AdminProfile() {
  return (
    <AdminLayout title="Profile" subtitle="Manage your account">
      <ProfileContent />
    </AdminLayout>
  );
}
