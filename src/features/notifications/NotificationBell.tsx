import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useNotifications } from "./useNotifications";
import type { AppNotification } from "./types";

function timeAgo(dateStr: string): string {
  const minutes = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  function openNotification(n: AppNotification) {
    if (!n.is_read) void markRead(n.id);
    setOpen(false);
    if (n.task) navigate(`/etms/tasks/${n.task}`);
  }

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(current => !current)}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => void markAllRead()}>
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.length ? notifications.map(n => (
              <button
                type="button"
                key={n.id}
                onClick={() => openNotification(n)}
                className={`w-full text-left px-4 py-3 flex items-start gap-2 hover:bg-accent transition-colors ${n.is_read ? "" : "bg-primary/5"}`}
              >
                {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-foreground leading-relaxed">{n.message}</span>
                  <span className="block text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</span>
                </span>
                {n.is_read && <Check className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />}
              </button>
            )) : (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No notifications yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
