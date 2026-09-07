import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Bell,
  Menu,
  X,
  LogOut,
  UserCircle,
} from "lucide-react";
import viteLogo from "/vite.svg";
import { ModeToggle } from "../../components/mode-toggle";
import { useAuth } from "../Auth/AuthContext";

// ── Nav config ────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, to: "/tm/user/dashboard" },
  { label: "Documents", icon: <FileText className="w-4 h-4" />,        to: "/tm/user/documents" },
  { label: "Profile",   icon: <UserCircle className="w-4 h-4" />,      to: "/tm/user/profile" },
];

// ── Props ─────────────────────────────────────────────────────────────────
interface UserLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

// ── Layout ────────────────────────────────────────────────────────────────
const UserLayout = ({ title, subtitle, children }: UserLayoutProps) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/tm/login");
  };

  return (
    <div className="min-h-screen w-full bg-background flex">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className={`
          relative z-40 w-60 shrink-0 bg-card border-r border-border flex flex-col
          md:fixed md:top-0 md:left-0 md:h-full md:transition-transform md:duration-300
          ${sidebarOpen ? "md:translate-x-0" : "md:-translate-x-full"}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <img src={viteLogo} alt="Logo" className="w-7 h-7" />
          <span className="text-foreground font-semibold text-sm tracking-wide uppercase">
            My Account
          </span>
          <button
            className="ml-auto hidden md:flex text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info + Logout */}
        <div className="px-3 pb-5 border-t border-border pt-4 flex flex-col gap-2">
          <Link
            to="/tm/user/profile"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold uppercase">
              {(user?.first_name?.[0] ?? "") + (user?.last_name?.[0] ?? "") || "Us"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user ? `${user.first_name} ${user.last_name}` : "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
            </div>
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-0">

        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-background border-b border-border px-6 py-4 flex items-center justify-between slg:px-4 sm:px-3">
          <div className="flex items-center gap-3">
            <button
              className="hidden md:flex text-muted-foreground hover:text-foreground p-1"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground sm:hidden">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
            <button className="relative p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-6 py-6 slg:px-4 sm:px-3 overflow-auto">
          {children}
        </main>
      </div>

    </div>
  );
};

export default UserLayout;
