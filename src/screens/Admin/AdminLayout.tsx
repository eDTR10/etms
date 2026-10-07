import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  Bookmark,
  Calendar,
  FileSpreadsheet,
  Link2,
  LogOut,
  UserCircle,
  ShieldCheck,
  Users,
  BarChart3,
  ArrowLeftRight,
} from "lucide-react";
import { isIPCRComingSoon } from "../../features/ipcr/IPCRComingSoon";
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
  { label: "Task Sub-Task Templates", icon: <Bookmark className="w-4 h-4" />, to: "/etms/admin/templates" },
  { label: "Task Grouping", icon: <BarChart3 className="w-4 h-4" />, to: "/etms/admin/task-grouping" },
  { label: "Users", icon: <Users className="w-4 h-4" />, to: "/etms/admin/users" },
  { label: "Quick Links", icon: <Link2 className="w-4 h-4" />, to: "/etms/admin/quick-links" },
  { label: "Generate IPCR Template", icon: <FileSpreadsheet className="w-4 h-4" />, to: "/etms/admin/ipcr-templates" },
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
  // Mobile: the sidebar becomes an off-canvas drawer opened by the header hamburger.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/etms/login");
  };

  return (
    <div className="min-h-screen w-full bg-background flex">

      {/* ── Drawer backdrop (mobile only) ───────────────────────────────── */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
        className={`hidden md:block fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />

      {/* ── Sidebar (docked on desktop, slide-in drawer on mobile) ──────── */}
      <aside
        id="admin-sidebar"
        className={`w-60 h-screen sticky top-0 self-start shrink-0 overflow-hidden bg-card border-r border-border flex flex-col md:fixed md:inset-y-0 md:left-0 md:z-50 md:h-[100dvh] md:transition-transform md:duration-300 md:ease-out md:shadow-2xl ${menuOpen ? "md:translate-x-0" : "md:-translate-x-full md:shadow-none"}`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">

          <div className="flex  items-end  justify-end">
             <img src={etmsLogo} alt="TMS logo" className="w-5 h-5 object-contain mb-[6px]" />
          <span className="text-foreground  font-extrabold text-3xl tracking-wide">TMS</span>
          </div>
         
          <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0d8a92]/10 text-[#0d8a92] dark:bg-[#17b3ac]/15 dark:text-[#17b3ac] text-[10px] font-bold uppercase tracking-wide">
            <ShieldCheck className="w-3 h-3" />Admin
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map((item, index) => {
            const isActive = pathname === item.to;
            if (isIPCRComingSoon(item.to)) {
              return (
                <div key={item.label} aria-disabled="true" title="Coming soon" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground/60 cursor-not-allowed select-none">
                  {item.icon}
                  <span className="flex-1 min-w-0">{item.label}</span>
                  <span className="ml-auto px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap">Coming soon</span>
                </div>
              );
            }
            return (
              <Link
                key={item.label}
                to={item.to}
                style={{ transitionDelay: menuOpen ? `${80 + index * 40}ms` : "0ms" }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-[colors,opacity,transform] duration-300 ${menuOpen ? "md:opacity-100 md:translate-x-0" : "md:opacity-0 md:-translate-x-3"} ${isActive
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
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="admin-sidebar"
              className="hidden md:inline-flex flex-col items-center justify-center gap-[5px] w-9 h-9 shrink-0 rounded-lg border border-border text-foreground transition-colors hover:bg-accent active:scale-95"
            >
              <span className={`block h-0.5 w-4 rounded bg-current transition-transform duration-300 ${menuOpen ? "translate-y-[7px] rotate-45" : ""}`} />
              <span className={`block h-0.5 w-4 rounded bg-current transition-all duration-300 ${menuOpen ? "opacity-0 scale-x-0" : ""}`} />
              <span className={`block h-0.5 w-4 rounded bg-current transition-transform duration-300 ${menuOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-foreground">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground sm:hidden">{subtitle}</p>}
            </div>
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

        <main className="flex-1 px-6 py-6 slg:px-4 sm:px-3 overflow-y-auto overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>

    </div>
  );
};

export default AdminLayout;
