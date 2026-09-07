import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Loader from "../../components/loader/loader";
import { getHomePath } from "./roles";

interface GuestRouteProps {
  children: React.ReactNode;
}

// Wraps /login and /register: if the session is still valid (unexpired
// refresh token), skip the form and drop the user straight into their
// dashboard instead of asking them to log in again.
const GuestRoute = ({ children }: GuestRouteProps) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Loader />;
  if (isAuthenticated) return <Navigate to={getHomePath(user)} replace />;

  return <>{children}</>;
};

export default GuestRoute;
