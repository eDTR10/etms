import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isAdmin } from "./roles";
import Loader from "../../components/loader/loader";

interface AdminRouteProps {
  children: React.ReactNode;
}

// Layered on top of ProtectedRoute's authentication check — this only adds the role gate,
// so a signed-out visit to an admin URL still lands on the login page, not the dashboard.
const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Loader />;
  if (!isAuthenticated) return <Navigate to="/etms/login" replace />;
  if (!isAdmin(user)) return <Navigate to="/etms/dashboard" replace />;

  return <>{children}</>;
};

export default AdminRoute;
