import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { taskError } from "../tasks/taskService";
import { quickLinkService } from "./quickLinkService";
import type { QuickLink, QuickLinkInput } from "./types";

interface QuickLinksContextValue {
  links: QuickLink[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createLink: (input: QuickLinkInput) => Promise<QuickLink>;
  updateLink: (id: number, input: QuickLinkInput) => Promise<QuickLink>;
  deleteLink: (id: number) => Promise<void>;
}

const QuickLinksContext = createContext<QuickLinksContextValue | null>(null);

export function useQuickLinks() {
  const context = useContext(QuickLinksContext);
  if (!context) throw new Error("useQuickLinks requires a QuickLinksProvider");
  return context;
}

export default function QuickLinksProvider({ children }: { children: ReactNode }) {
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await quickLinkService.list());
    } catch (err) {
      setError(taskError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const createLink = async (input: QuickLinkInput) => {
    const link = await quickLinkService.create(input);
    setLinks(current => [link, ...current]);
    return link;
  };
  const updateLink = async (id: number, input: QuickLinkInput) => {
    const link = await quickLinkService.update(id, input);
    setLinks(current => current.map(item => item.id === id ? link : item));
    return link;
  };
  const deleteLink = async (id: number) => {
    await quickLinkService.remove(id);
    setLinks(current => current.filter(item => item.id !== id));
  };

  return <QuickLinksContext.Provider value={{ links, loading, error, refresh, createLink, updateLink, deleteLink }}>{children}</QuickLinksContext.Provider>;
}
