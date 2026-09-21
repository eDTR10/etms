import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  Bookmark,
  Calendar,
  Link2,
  LogOut,
  UserCircle,
  ShieldCheck,
  ArrowLeftRight,
} from "lucide-react";
import { ModeToggle } from "../../components/mode-toggle";
import { useAuth } from "../Auth/AuthContext";
import { useUnseenAssignedCount } from "../../features/tasks/useUnseenAssignedCount";
import etmsLogo from "../../assets/eTMS-icon.png";

// ── Nav config ────────────────────────────────────────────────────────────
// Deliberately a short, focused list — an admin oversees everyone's data, so the
// personal-workflow items from UserLayout (Add Task, Calendar, Reports, How To) don't apply.
const NAV_ITEMS = [
  { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, to: "/etms/admin/dashboard" },
  { label: "Tasks", icon: <ListChecks className="w-4 h-4" />, to: "/etms/admin/tasks" },
  { label: "Calendar", icon: <Calendar className="w-4 h-4" />, to: "/etms/admin/calendar" },
  { label: "Templates", icon: <Bookmark className="w-4 h-4" />, to: "/etms/admin/templates" },
  { label: "Quick Links", icon: <Link2 className="w-4 h-4" />, to: "/etms/admin/quick-links" },
];

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const AdminLayout = ({ title, subtitle, children }: AdminLayoutProps) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const unseenAssignedCount = useUnseenAssignedCount();

  const handleLogout = async () => {
    await logout();
    navigate("/etms/login");
  };

  return (
    <div className="min-h-screen w-full bg-background flex">

      {/* ── Sidebar (desktop only) ─────────────────────────────────────── */}
      <aside className="w-60 h-screen sticky top-0 self-start shrink-0 overflow-hidden bg-card border-r border-border flex flex-col md:hidden">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <img src={etmsLogo} alt="eTMS logo" className="w-7 h-7 object-contain" />
          <span className="text-foreground font-semibold text-sm tracking-wide">eTMS</span>
          <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0d8a92]/10 text-[#0d8a92] dark:bg-[#17b3ac]/15 dark:text-[#17b3ac] text-[10px] font-bold uppercase tracking-wide">
            <ShieldCheck className="w-3 h-3" />Admin
          </span>
        </div>

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
                {item.to === "/etms/admin/tasks" && unseenAssignedCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-[#e0453c] text-white text-[10px] font-bold flex items-center justify-center">
                    {unseenAssignedCount > 9 ? "9+" : unseenAssignedCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-5 border-t border-border pt-4 flex flex-col gap-2">
          <Link
            to="/etms/admin/profile"
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
          <Link
            to="/etms/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Switch to User View
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-0">
        <header className="sticky top-0 z-20 bg-background border-b border-border px-6 py-4 flex items-center justify-between slg:px-4 sm:px-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground sm:hidden">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
            <Link
              to="/etms/admin/profile"
              aria-label="Open profile"
              className={`hidden md:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${pathname === "/etms/admin/profile" ? "bg-accent text-[#0d8a92] dark:text-[#17b3ac]" : ""}`}
            >
              <UserCircle className="w-5 h-5" />
            </Link>
          </div>
        </header>

        <main className="flex-1 px-6 py-6 slg:px-4 sm:px-3 md:pb-24 overflow-auto">
          {children}
        </main>
      </div>

      {/* ── Bottom navigation (mobile only) ──────────────────────────────── */}
      <nav className="hidden md:flex fixed bottom-0 left-0 right-0 z-30 items-stretch bg-card border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV_ITEMS.map(item => (
          <Link
            key={item.label}
            to={item.to}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold ${pathname === item.to ? "text-[#0d8a92] dark:text-[#17b3ac]" : "text-muted-foreground"}`}
          >
            <span className="relative">
              {item.icon}
              {item.to === "/etms/admin/tasks" && unseenAssignedCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#e0453c] text-white text-[8px] font-bold flex items-center justify-center">
                  {unseenAssignedCount > 9 ? "9+" : unseenAssignedCount}
                </span>
              )}
            </span>
            {item.label}
          </Link>
        ))}
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold text-muted-foreground"
        >
          <LogOut className="w-5 h-5" />
          Log Out
        </button>
      </nav>

    </div>
  );
};

export default AdminLayout;
