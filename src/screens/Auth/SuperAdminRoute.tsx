import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isAdmin, isSuperAdmin } from "./roles";
import Loader from "../../components/loader/loader";

// For pages only a Super Admin may open (User Management). An ordinary admin is sent back to their dashboard.
const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Loader />;
  if (!isAuthenticated) return <Navigate to="/etms/login" replace />;
  if (!isAdmin(user)) return <Navigate to="/etms/dashboard" replace />;
  if (!isSuperAdmin(user)) return <Navigate to="/etms/admin/dashboard" replace />;

  return <>{children}</>;
};

export default SuperAdminRoute;
