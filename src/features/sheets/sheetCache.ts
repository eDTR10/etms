import type { SheetTable } from "./sheetService";

// A saved copy of a synced tab, kept on this device so opening the page again shows it at once (and asks the server only
// whether anything changed). Held in memory for the visit, and in IndexedDB (which, unlike localStorage, can take a big tab)
// across visits. Everything here is best effort: when the browser refuses to store, the page simply works without it.
export interface CachedTable {
  table: SheetTable & { version: string };
  version: string;
  // When it was last checked against the sheet.
  at: number;
}

const memory = new Map<string, CachedTable>();
const DB_NAME = "etm-sheet-cache";
const STORE = "tables";
// A saved copy older than this is dropped instead of shown.
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getCachedTable(key: string): Promise<CachedTable | null> {
  const held = memory.get(key);
  if (held) return held;
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result as CachedTable | undefined;
        db.close();
        if (value && Date.now() - value.at < MAX_AGE) { memory.set(key, value); resolve(value); } else resolve(null);
      };
      request.onerror = () => { db.close(); resolve(null); };
    } catch {
      resolve(null);
    }
  });
}

export async function putCachedTable(key: string, value: CachedTable): Promise<void> {
  memory.set(key, value);
  const db = await openDb();
  if (!db) return;
  try {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(value, key);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
    transaction.onabort = () => db.close();
  } catch {
    db.close();
  }
}

// "just now", "5 min ago", "2 h ago"...
export function ago(when: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - when) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(when).toLocaleDateString();
}
