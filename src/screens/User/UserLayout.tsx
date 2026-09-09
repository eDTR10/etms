import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Plus,
  ListChecks,
  LogOut,
  UserCircle,
} from "lucide-react";
import { ModeToggle } from "../../components/mode-toggle";
import { useAuth } from "../Auth/AuthContext";
import NotificationBell from "../../features/notifications/NotificationBell";
import etmsLogo from "../../assets/eTMS-icon.png";

// ── Nav config ────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, to: "/tm/dashboard" },
  { label: "Add Task", icon: <Plus className="w-4 h-4" />, to: "/tm/tasks/new" },
  { label: "All Tasks", icon: <ListChecks className="w-4 h-4" />, to: "/tm/tasks" },
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

  const handleLogout = async () => {
    await logout();
    navigate("/tm/login");
  };

  return (
    <div className="min-h-screen w-full bg-background flex">

      {/* ── Sidebar (desktop only) ─────────────────────────────────────── */}
      <aside className="w-60 h-screen sticky top-0 self-start shrink-0 overflow-hidden bg-card border-r border-border flex flex-col md:hidden">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <img src={etmsLogo} alt="eTMS logo" className="w-7 h-7 object-contain" />
          <span className="text-foreground font-semibold text-sm tracking-wide">
            eTMS
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                  ? "bg-[#0d8a92] text-white dark:bg-[#17b3ac]"
                  : "text-muted-foreground hover:bg-[#0d8a92] hover:text-white dark:hover:bg-[#17b3ac]"
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
          <div>
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground sm:hidden">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
            <NotificationBell />
            {/* Profile (mobile only — desktop reaches it via the sidebar). Logout lives on the Profile page on mobile. */}
            <Link to="/tm/user/profile" className="hidden md:flex p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" aria-label="Profile">
              <UserCircle className="w-5 h-5" />
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-6 py-6 slg:px-4 sm:px-3 md:pb-24 overflow-auto">
          {children}
        </main>
      </div>

      {/* ── Bottom navigation (mobile only) ──────────────────────────────── */}
      <nav className="hidden md:flex fixed bottom-0 left-0 right-0 z-30 items-stretch bg-card border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <Link
          to="/tm/dashboard"
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold ${pathname === "/tm/dashboard" ? "text-[#0d8a92] dark:text-[#17b3ac]" : "text-muted-foreground"}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          Dashboard
        </Link>
        <Link to="/tm/tasks/new" className="flex-1 flex flex-col items-center justify-center" aria-label="Add task">
          <span className="flex items-center justify-center w-11 h-11 -mt-5 rounded-full bg-[#0d8a92] text-white shadow-lg dark:bg-[#17b3ac]">
            <Plus className="w-6 h-6" />
          </span>
        </Link>
        <Link
          to="/tm/tasks"
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold ${pathname === "/tm/tasks" ? "text-[#0d8a92] dark:text-[#17b3ac]" : "text-muted-foreground"}`}
        >
          <ListChecks className="w-5 h-5" />
          All Tasks
        </Link>
      </nav>

    </div>
  );
};

export default UserLayout;
