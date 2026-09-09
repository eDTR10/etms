import api from "../../plugin/axios";
import type { AppNotification } from "./types";

export const notificationService = {
  list: async () => (await api.get<AppNotification[]>("etm/notifications/")).data,
  unreadCount: async () => (await api.get<{ count: number }>("etm/notifications/unread_count/")).data.count,
  markRead: async (id: number) => (await api.post<AppNotification>(`etm/notifications/${id}/read/`)).data,
  markAllRead: async () => { await api.post("etm/notifications/read-all/"); },
};
