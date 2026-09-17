import api from "../../plugin/axios";
import type { QuickLink, QuickLinkInput } from "./types";

export const quickLinkService = {
  list: async () => (await api.get<QuickLink[]>("etm/quick-links/")).data,
  create: async (input: QuickLinkInput) => (await api.post<QuickLink>("etm/quick-links/", input)).data,
  update: async (id: number, input: QuickLinkInput) => (await api.patch<QuickLink>(`etm/quick-links/${id}/`, input)).data,
  remove: async (id: number) => { await api.delete(`etm/quick-links/${id}/`); },
};
