import { useCallback, useEffect, useState } from "react";
import { notificationService } from "./notificationService";
import type { AppNotification } from "./types";

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setNotifications(await notificationService.list());
    } catch {
      // Non-critical background fetch — the bell just stays quiet on failure.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const markRead = async (id: number) => {
    setNotifications(current => current.map(n => n.id === id ? { ...n, is_read: true } : n));
    try {
      await notificationService.markRead(id);
    } catch {
      void refresh();
    }
  };

  const markAllRead = async () => {
    setNotifications(current => current.map(n => ({ ...n, is_read: true })));
    try {
      await notificationService.markAllRead();
    } catch {
      void refresh();
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}
