import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authService, UserProfile } from "./authService";

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Seed from the shared, cross-app cached profile (if another DICT system already
  // logged this user in) for an instant initial render; getMe() below still refreshes it.
  const [user, setUser] = useState<UserProfile | null>(
    () => authService.getCachedUser()
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchUser = async () => {
      if (authService.isAuthenticated()) {
        try {
          const me = await authService.getMe();
          setUser(me);
        } catch {
          await authService.logout();
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    fetchUser();
  }, []);

  const login = async (email: string, password: string) => {
    await authService.login({ email, password });
    const me = await authService.getMe();
    setUser(me);
    return me;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
