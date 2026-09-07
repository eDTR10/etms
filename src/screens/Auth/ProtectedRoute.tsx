import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Loader from "../../components/loader/loader";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Loader />;
  if (!isAuthenticated) return <Navigate to="/tm/login" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
