import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Plus,
  ListChecks,
  BarChart3,
  Calendar,
  HelpCircle,
  LogOut,
  UserCircle,
  Bookmark,
  Link2,
  FileSpreadsheet,
  ArrowLeftRight,
} from "lucide-react";
import { isIPCRComingSoon } from "../../features/ipcr/IPCRComingSoon";
import { ModeToggle } from "../../components/mode-toggle";
import { useAuth } from "../Auth/AuthContext";
import { isAdmin } from "../Auth/roles";
import NotificationBell from "../../features/notifications/NotificationBell";
import { useUnseenAssignedCount } from "../../features/tasks/useUnseenAssignedCount";
import etmsLogo from "../../assets/eTMS-icon.png";

// ── Nav config ────────────────────────────────────────────────────────────
// Grouped for the desktop sidebar (a divider renders between groups, none before the first).
const NAV_GROUPS: { title?: string; items: { label: string; icon: React.ReactNode; to: string; note?: string }[] }[] = [
  {
    items: [
      { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, to: "/etms/dashboard" },
      { label: "Add Task", icon: <Plus className="w-4 h-4" />, to: "/etms/tasks/new" },
      { label: "All Tasks", icon: <ListChecks className="w-4 h-4" />, to: "/etms/tasks" },
      { label: "Calendar", icon: <Calendar className="w-4 h-4" />, to: "/etms/calendar" },
      { label: "Task Sub-Task Templates", icon: <Bookmark className="w-4 h-4" />, to: "/etms/templates" },
    ],
  },
  {
    items: [
      { label: "Task Grouping", icon: <BarChart3 className="w-4 h-4" />, to: "/etms/reports", note: "for IPCR purposes" },
      { label: "Generate IPCR", icon: <FileSpreadsheet className="w-4 h-4" />, to: "/etms/ipcr" },
    ],
  },
  {
    items: [
      { label: "Quick Links", icon: <Link2 className="w-4 h-4" />, to: "/etms/quick-links" },
      { label: "How To?", icon: <HelpCircle className="w-4 h-4" />, to: "/etms/how-to" },
    ],
  },
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
        id="user-sidebar"
        className={`w-60 h-screen sticky top-0 self-start shrink-0 overflow-hidden bg-card border-r border-border flex flex-col md:fixed md:inset-y-0 md:left-0 md:z-50 md:h-[100dvh] md:transition-transform md:duration-300 md:ease-out md:shadow-2xl ${menuOpen ? "md:translate-x-0" : "md:-translate-x-full md:shadow-none"}`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">

          <div className="flex  items-end  justify-end">
             <img src={etmsLogo} alt="TMS logo" className="w-5 h-5 object-contain mb-[6px]" />
          <span className="text-foreground  font-extrabold text-3xl tracking-wide">TMS</span>
          </div>
         
          
        </div>
        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.title ?? `group-${groupIndex}`} className={groupIndex > 0 ? "mt-3 pt-3 border-t border-border" : undefined}>
              {group.title && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{group.title}</p>
              )}
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
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
                  const order = NAV_GROUPS.slice(0, groupIndex).reduce((sum, g) => sum + g.items.length, 0) + group.items.indexOf(item);
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      style={{ transitionDelay: menuOpen ? `${80 + order * 35}ms` : "0ms" }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-[colors,opacity,transform] duration-300 ${menuOpen ? "md:opacity-100 md:translate-x-0" : "md:opacity-0 md:-translate-x-3"} ${isActive
                        ? "bg-[#0d8a92] text-white dark:bg-[#17b3ac]"
                        : "text-muted-foreground hover:bg-[#0d8a92] hover:text-white dark:hover:bg-[#17b3ac]"
                        }`}
                    >
                      {item.icon}
                      <span className="flex-1 min-w-0">
                        {item.label}
                        {item.note && <span className="block text-[10px] italic font-normal opacity-70 leading-tight">({item.note})</span>}
                      </span>
                      {item.to === "/etms/tasks" && unseenAssignedCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#e0453c] text-white text-[10px] font-bold flex items-center justify-center">
                          {unseenAssignedCount > 9 ? "9+" : unseenAssignedCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User info + Logout */}
        <div className="px-3 pb-5 border-t border-border pt-4 flex flex-col gap-2">
          <Link
            to="/etms/user/profile"
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

          {isAdmin(user) && (
            <Link
              to="/etms/admin/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Switch to Admin View
            </Link>
          )}

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
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="user-sidebar"
              className="hidden md:inline-flex flex-col items-center justify-center gap-[5px] w-9 h-9 shrink-0 rounded-lg border border-border text-foreground transition-colors hover:bg-accent active:scale-95"
            >
              <span className={`block h-0.5 w-4 rounded bg-current transition-transform duration-300 ${menuOpen ? "translate-y-[7px] rotate-45" : ""}`} />
              <span className={`block h-0.5 w-4 rounded bg-current transition-all duration-300 ${menuOpen ? "opacity-0 scale-x-0" : ""}`} />
              <span className={`block h-0.5 w-4 rounded bg-current transition-transform duration-300 ${menuOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-foreground">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground sm:hidden">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
            <NotificationBell />
            <Link
              to="/etms/how-to"
              aria-label="Open How To guide"
              className={`hidden md:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${pathname === "/etms/how-to" ? "bg-accent text-[#0d8a92] dark:text-[#17b3ac]" : ""}`}
            >
              <HelpCircle className="w-5 h-5" />
            </Link>
            <Link
              to="/etms/user/profile"
              aria-label="Open profile"
              className={`hidden md:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${pathname === "/etms/user/profile" ? "bg-accent text-[#0d8a92] dark:text-[#17b3ac]" : ""}`}
            >
              <UserCircle className="w-5 h-5" />
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-6 py-6 slg:px-4 sm:px-3 overflow-y-auto overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>

    </div>
  );
};

export default UserLayout;
