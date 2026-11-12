import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";
import { ArrowLeft, FolderPlus, ListPlus, MapPin, ExternalLink, Link2, Plus, RefreshCw, UserCog } from "lucide-react";
import Modal from "../../components/ui/modal";
import MultiSelect from "../../components/ui/multiselect";
import CreateTaskDialog, { type CreateTaskValues } from "./CreateTaskDialog";
import RowAccessDialog from "./RowAccessDialog";
import SheetEntryForm from "./SheetEntryForm";
import SheetTableView, { type SheetSort } from "./SheetTableView";
import UserLayout from "../../screens/User/UserLayout";
import AdminLayout from "../../screens/Admin/AdminLayout";
import { useAuth } from "../../screens/Auth/AuthContext";
import { sheetService, type ProjectCard, type SheetSchema, type SheetTable, type SheetTarget } from "./sheetService";
import { taskError, taskService } from "../tasks/taskService";
import { splitProgressLog } from "./progressLog";
import { ago, getCachedTable, putCachedTable } from "./sheetCache";
import "../tasks/etm-base.css";
import "../../screens/Etm/etm-app.css";
import "./sheets.css";

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// The titles of the live (not archived) tasks I created, to tell which rows already have a task. Asked for again on every sync.
let myTasksCache: { at: number; map: Record<string, number> } | null = null;
async function myTaskTitles(fresh = true): Promise<Record<string, number>> {
  if (!fresh && myTasksCache && Date.now() - myTasksCache.at < 60 * 1000) return myTasksCache.map;
  const list = await taskService.list();
  myTasksCache = { at: Date.now(), map: Object.fromEntries(list.filter(task => task.is_creator && !task.is_archived).map(task => [task.title.trim().toLowerCase(), task.id])) };
  return myTasksCache.map;
}

// The columns and dropdown choices of a tab (for the Add entry form), kept for 5 minutes and dropped when a row is added.
const schemaMemory = new Map<string, { at: number; schema: SheetSchema }>();

// The tab last looked at on this device, per sheet.
const rememberedTab = (cardKey: string) => { try { return localStorage.getItem(`etm-sheet-tab:${cardKey}`) ?? ""; } catch { return ""; } };
const rememberTab = (cardKey: string, tab: string) => { try { localStorage.setItem(`etm-sheet-tab:${cardKey}`, tab); } catch { /* storage unavailable */ } };

interface SheetTasksPageProps {
  // The card (see the server's sheet_cards.py) whose sheet this page shows.
  cardKey: string;
  title: string;
  subtitle: string;
  // A link back to the page this one was opened from, when there is one.
  back?: { to: string; label: string };
  // Columns (by their title in the sheet) that get a checkbox dropdown to filter the table by.
  filterLabels?: string[];
  // Shown inside the admin's layout instead of the user's.
  admin?: boolean;
  // The column (by its title) that says when each row was logged: newest first follows it.
  latestLabel?: string;
  // Columns (by title) shown right after another one, in the order given, instead of where the sheet has them.
  moveColumns?: { after: string; columns: string[] };
  // Gives every row a "Create task" button: a task is made in the system from the row's cells (by their titles).
  // `link` (optional): the column whose links are attached to the task.
  taskFrom?: { title: string; details: string; log: string; link?: string };
}

const normalize = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The table with some columns moved to sit right after another one (titles that the tab does not have are skipped).
function arranged(table: SheetTable, move?: SheetTasksPageProps["moveColumns"]): SheetTable {
  if (!move) return table;
  const find = (label: string) => table.headers.findIndex(header => normalize(header.label) === normalize(label));
  const anchor = find(move.after);
  const moving = move.columns.map(find).filter((position, index, all) => position >= 0 && position !== anchor && all.indexOf(position) === index);
  if (anchor < 0 || !moving.length) return table;
  const order: number[] = [];
  table.headers.forEach((_, position) => {
    if (moving.includes(position)) return;
    order.push(position);
    if (position === anchor) order.push(...moving);
  });
  return {
    ...table,
    headers: order.map(position => table.headers[position]),
    rows: table.rows.map(row => ({ ...row, cells: order.map(position => row.cells[position] ?? "") })),
  };
}

// What a cell holds, as something that can be compared: a date, a number, or text. Empty cells sort last.
function sortValue(cell: string): { kind: "empty" | "number" | "text"; number: number; text: string } {
  const text = cell.trim();
  if (!text || text.toUpperCase() === "FALSE") return { kind: "empty", number: 0, text: "" };
  // "Nov 11, 2026" (with or without a time) is a date too.
  if (/^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}/.test(text)) {
    const when = Date.parse(text);
    if (Number.isFinite(when)) return { kind: "number", number: when, text };
  }
  const date = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (date) return { kind: "number", number: Date.UTC(Number(date[3]) < 100 ? 2000 + Number(date[3]) : Number(date[3]), Number(date[1]) - 1, Number(date[2])), text };
  const number = Number(text.replace(/,/g, ""));
  if (Number.isFinite(number)) return { kind: "number", number, text };
  return { kind: "text", number: 0, text: text.toLowerCase() };
}

// A page that shows one Google Sheet by month: link it once, pick a month, press Sync, add entries.
export default function SheetTasksPage({ cardKey, title, subtitle, back, filterLabels = [], latestLabel, moveColumns, taskFrom, admin = false }: SheetTasksPageProps) {
  const { user } = useAuth();
  const isAdmin = !!user && (user.is_staff || user.role === "admin" || user.role === "super_admin");
  const Layout = admin ? AdminLayout : UserLayout;
  const [card, setCard] = useState<ProjectCard | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlText, setUrlText] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [tab, setTab] = useState("");
  // The tabs the sheet has (read as soon as it is linked; the table itself still waits for Sync).
  const [tabs, setTabs] = useState<string[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [table, setTable] = useState<SheetTable | null>(null);
  const [loading, setLoading] = useState(false);
  // A saved copy is on screen and is being checked against the sheet in the background.
  const [refreshing, setRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  // Set when an admin limited what this person sees of the sheet.
  const [access, setAccess] = useState<{ conditions?: { column: string; values: string[] }[]; match?: "all" | "any"; assigned?: boolean } | null>(null);
  const [showAccess, setShowAccess] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // Newest first: the last row of the sheet is the latest one.
  const [sort, setSort] = useState<SheetSort>({ key: "latest", dir: "desc" });
  // The picked values of each filter dropdown, by the column's position in the table.
  const [filters, setFilters] = useState<Record<number, string[]>>({});
  const [adding, setAdding] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  // Tasks of mine that already exist (by title, i.e. the ticket id), and the rows being turned into a task right now.
  const [madeTasks, setMadeTasks] = useState<Record<string, number>>({});
  const memberList = useRef<Awaited<ReturnType<typeof taskService.members>> | null>(null);
  const [making, setMaking] = useState<Set<number>>(new Set());
  // The row whose "Create task" dialog is open.
  const [pendingTask, setPendingTask] = useState<{
    key: string; title: string; details: string; remarks: string[]; links: { title: string; url: string }[];
    viewers: { provincial: { id: number; name: string }[]; focal: { id: number; name: string }[] };
    members: { id: number; name: string; detail?: string }[];
  } | null>(null);
  const readOnly = card?.level === "assigned";
  const taskBase = admin ? "/etms/admin/tasks" : "/etms/tasks";
  const [opening, setOpening] = useState(false);
  const [preload, setPreload] = useState<{ target: SheetTarget; schema: SheetSchema } | null>(null);

  const loadCard = () => sheetService.projectCards().then(result => {
    const found = result.cards.find(item => item.key === cardKey) ?? null;
    setAllowed(!!found);
    setCard(found);
    setEditingUrl(!found?.target);
    setUrlText(found?.url ?? "");
  }).catch(caught => { setAllowed(false); setError(taskError(caught)); });
  useEffect(() => { void loadCard(); }, []);

  const targetId = card?.target ?? null;
  useEffect(() => {
    if (!targetId || editingUrl) return;
    let cancelled = false;
    setLoadingTabs(true);
    sheetService.tabs(targetId).then(names => {
      if (cancelled) return;
      setTabs(names);
      // Start on the tab picked last time, else the default tab, else this month's tab if the sheet has one, else its first tab.
      setTab(current => [current, rememberedTab(cardKey), card?.default_tab, MONTHS[new Date().getMonth()], names[0]].find(name => name && names.includes(name)) ?? "");
    }).catch(caught => { if (!cancelled) { setTabs([]); setError(taskError(caught)); } }).finally(() => { if (!cancelled) setLoadingTabs(false); });
    return () => { cancelled = true; };
  }, [targetId, card?.url, editingUrl, cardKey]);

  // What a tab shows: the copy saved on this device straight away (if there is one), then what the server says changed.
  // "sync" (the Sync button) always asks the sheet; "open" (the default tab, when the page opens) may use what the server read
  // moments ago. Either way a tab that did not change comes back as a tiny "unchanged", not as all its rows again.
  const autoSynced = useRef(false);
  async function load(mode: "sync" | "open") {
    if (!targetId || loading || refreshing || !tab) return;
    const key = `${user?.id ?? 0}:${targetId}:${tab}`;
    const saved = await getCachedTable(key);
    if (saved) { setTable(arranged(saved.table, moveColumns)); setSyncedAt(saved.at); }
    // Full-screen only when there is nothing to show yet; with a saved copy the check runs quietly.
    if (saved) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const result = await sheetService.rows(targetId, tab, { known: saved?.version, refresh: mode === "sync" });
      const at = Date.now();
      if (result.unchanged) {
        if (saved) { void putCachedTable(key, { ...saved, at }); setSyncedAt(at); }
      } else {
        setAccess(result.access ?? null);
        setTable(arranged(result, moveColumns));
        setSyncedAt(at);
        void putCachedTable(key, { table: result, version: result.version, at });
      }
      if (taskFrom) myTaskTitles().then(setMadeTasks).catch(() => undefined);
    } catch (caught) {
      if (!saved) setTable(null);
      setError(taskError(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Picking another tab shows its saved copy, if any, without asking the sheet; Sync brings it up to date.
  async function pickTab(next: string) {
    setTab(next);
    rememberTab(cardKey, next);
    setError("");
    const saved = targetId ? await getCachedTable(`${user?.id ?? 0}:${targetId}:${next}`) : null;
    setTable(saved ? arranged(saved.table, moveColumns) : null);
    setSyncedAt(saved?.at ?? null);
  }

  // The form is opened only once the sheet's columns and dropdown choices have been read, so it never shows half-empty.
  async function openEntry() {
    if (!targetId || opening || !tab) return;
    setOpening(true);
    setError("");
    try {
      const cacheKey = `${targetId}:${tab}`;
      const held = schemaMemory.get(cacheKey);
      const [targets, schema] = await Promise.all([
        sheetService.targets(),
        held && Date.now() - held.at < 5 * 60 * 1000 ? Promise.resolve(held.schema) : sheetService.schema(targetId, tab).then(fresh => { schemaMemory.set(cacheKey, { at: Date.now(), schema: fresh }); return fresh; }),
      ]);
      const target = targets.find(item => item.id === targetId);
      if (!target) throw new Error("missing");
      setPreload({ target, schema });
      setAdding(true);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "missing" ? "This sheet is not available." : taskError(caught));
    } finally {
      setOpening(false);
    }
  }

  useEffect(() => {
    // The page opened on the admin's default tab: it is synced straight away (a tab the person picked by hand is not).
    if (autoSynced.current || !tab || !targetId || loadingTabs || !card?.default_tab || tab !== card.default_tab || !tabs.includes(tab)) return;
    autoSynced.current = true;
    void load("open");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tabs, targetId, loadingTabs, card?.default_tab]);

  // One task from one row. The ticket id is the title (editable), the request details the description, each dated update of
  // the progress log a remark, and the links of the link column are attached. A dialog first asks for the rest.
  // What a row becomes: its ticket id (title), request details, progress-log remarks and attached links.
  function fromRow(row: SheetTable["rows"][number]) {
    if (!table || !taskFrom) return null;
    const cell = (label: string) => {
      const position = table.headers.findIndex(header => normalize(header.label) === normalize(label));
      return position < 0 ? "" : (row.cells[position] ?? "").trim();
    };
    const details = cell(taskFrom.details);
    const title = (cell(taskFrom.title) || details.split("\n")[0].slice(0, 120)).slice(0, 255);
    if (!title) return null;
    const remarks = splitProgressLog(cell(taskFrom.log));
    // Every web address in the link column becomes a link on the task (its attachments), e.g. the letter's response.
    const addresses = [...new Set((taskFrom.link ? cell(taskFrom.link) : "").match(/https?:\/\/[^\s<>"']+/g) ?? [])].slice(0, 10);
    const links = addresses.map((url, index) => ({ title: addresses.length === 1 ? "Letter response" : `Letter response ${index + 1}`, url }));
    return { key: title, title, details, remarks, links };
  }

  async function createTask(row: SheetTable["rows"][number]) {
    if (!table || !taskFrom || !user) return;
    const made = fromRow(row);
    if (!made) { void Swal.fire({ title: "Nothing to make a task from", text: `Row ${row.row} has no ${taskFrom.title}.`, icon: "info" }); return; }
    const { title, details, remarks, links } = made;
    setMaking(current => new Set(current).add(row.row));
    try {
      // Who else may see it (the Provincial Officer of my office, the Project Focal Officer) and who it can be handed to.
      const viewers = card ? await sheetService.taskViewers(card.page).catch(() => ({ provincial: [], focal: [] })) : { provincial: [], focal: [] };
      if (!memberList.current) memberList.current = await taskService.members().catch(() => []);
      const members = (memberList.current ?? []).filter(member => member.id !== user.id)
        .map(member => ({ id: member.id, name: `${member.first_name} ${member.last_name}`.trim(), detail: member.position || undefined }));
      setPendingTask({ key: title, title, details, remarks, links, viewers, members });
    } finally {
      setMaking(current => { const next = new Set(current); next.delete(row.row); return next; });
    }
  }

  async function submitTask(values: CreateTaskValues) {
    const pending = pendingTask;
    if (!pending || !user) return;
    const viewerIds = [...new Set([...(values.shareProvincial ? pending.viewers.provincial : []), ...(values.shareFocal ? pending.viewers.focal : [])].map(person => person.id))]
      .filter(id => id !== user.id && !values.assignees.includes(id));
    try {
      const task = await taskService.create({
        title: values.title, details: pending.details, project: card?.project_name || null, requestor: "", location_province: "", location_city: "", location_barangay: "",
        priority: values.priority, deadline: null, recurrence: "None", recurrence_weekdays: "", recurrence_dates: [],
        status: "Pending", is_completed: false, links: pending.links,
        assignments: [
          { user: user.id, role: "Editor" },
          ...values.assignees.filter(id => id !== user.id).map(id => ({ user: id, role: "Editor" as const })),
          ...viewerIds.map(id => ({ user: id, role: "Viewer" as const })),
        ],
        subtasks: values.subtasks.map(text => ({ title: text, description: "", deadline: null, status: "Pending" as const, is_completed: false, subtasks: [] })),
      });
      // Looked up later by the row's own ticket id, whatever the task was renamed to.
      setMadeTasks(current => ({ ...current, [pending.key.toLowerCase()]: task.id }));
      if (myTasksCache) myTasksCache.map[pending.key.toLowerCase()] = task.id;
      setPendingTask(null);
      let failed = 0;
      for (const message of pending.remarks) {
        try { await taskService.addRemark(task.id, message); } catch { failed += 1; }
      }
      const safe = values.title.replace(/</g, "&lt;");
      void Swal.fire({
        title: "Task created",
        html: `<a href="${taskBase}/${task.id}">Open “${safe}”</a>${pending.remarks.length ? ` · ${pending.remarks.length - failed} of ${pending.remarks.length} remarks added` : ""}`,
        icon: failed ? "warning" : "success",
      });
    } catch (caught) {
      void Swal.fire({ title: "Couldn't create the task", text: taskError(caught), icon: "error" });
      throw caught;
    }
  }

  // Ticked rows: each becomes a task of mine in All Tasks (as "Create task" would, with the defaults), optionally gathered in one
  // grouped task. A row that already has a task of mine is not made again (but is still put in the group).
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState(false);
  const navigate = useNavigate();
  const [locating, setLocating] = useState<string | null>(null);

  // Goes to the task made from a row, after checking it is still there (it may have been deleted or archived since).
  async function locate(key: string) {
    const id = madeTasks[key];
    if (!id || locating) return;
    setLocating(key);
    try {
      const live = await taskService.list();
      if (live.some(task => task.id === id && !task.is_archived)) { navigate(`${taskBase}/${id}`); return; }
      const archived = await taskService.listArchived().catch(() => []);
      const wasArchived = archived.some(task => task.id === id);
      // The marker was out of date: bring the rows in line with the tasks that really exist.
      setMadeTasks(await myTaskTitles());
      void Swal.fire({
        title: wasArchived ? "That task is archived" : "That task no longer exists",
        text: wasArchived ? "Open Archived in All Tasks to find it." : "It was deleted, so this row can be turned into a task again.",
        icon: "info",
      });
    } catch (caught) {
      void Swal.fire({ title: "Couldn't find the task", text: taskError(caught), icon: "error" });
    } finally {
      setLocating(null);
    }
  }
  const toggleRows = (numbers: number[], on: boolean) => setPicked(current => { const next = new Set(current); numbers.forEach(number => on ? next.add(number) : next.delete(number)); return next; });
  useEffect(() => { setPicked(new Set()); }, [tab, targetId]);

  async function addPicked(grouped: boolean) {
    if (!table || !taskFrom || !user || bulk || !picked.size) return;
    let groupName = "";
    if (grouped) {
      const asked = await Swal.fire({ title: "Add as a grouped task", input: "text", inputLabel: "Name of the grouped task", inputValue: `${title} - ${tab}`, showCancelButton: true, confirmButtonText: "Create", inputValidator: value => (value.trim() ? null : "Give it a name.") });
      if (!asked.isConfirmed) return;
      groupName = String(asked.value).trim();
    }
    setBulk(true);
    setError("");
    try {
      const existing = { ...(await myTaskTitles().catch(() => madeTasks)) };
      const ids: number[] = [];
      let created = 0, skipped = 0, empty = 0, failed = 0;
      for (const row of table.rows.filter(item => picked.has(item.row))) {
        const made = fromRow(row);
        if (!made) { empty += 1; continue; }
        const key = made.key.toLowerCase();
        if (existing[key]) { skipped += 1; ids.push(existing[key]); continue; }
        try {
          const task = await taskService.create({
            title: made.title, details: made.details, project: card?.project_name || null, requestor: "", location_province: "", location_city: "", location_barangay: "",
            priority: "Medium", deadline: null, recurrence: "None", recurrence_weekdays: "", recurrence_dates: [],
            status: "Pending", is_completed: false, links: made.links,
            assignments: [{ user: user.id, role: "Editor" }], subtasks: [],
          });
          existing[key] = task.id;
          if (myTasksCache) myTasksCache.map[key] = task.id;
          ids.push(task.id);
          created += 1;
          for (const message of made.remarks) { try { await taskService.addRemark(task.id, message); } catch { /* the task is made; a remark can be added by hand */ } }
        } catch {
          failed += 1;
        }
      }
      setMadeTasks(current => ({ ...current, ...existing }));
      let groupNote = "";
      if (grouped && ids.length) {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        await taskService.createGroupedTask({ grouped_task_id: `ACT-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`, name: groupName, project_name: card?.project_name ?? "", has_target: false, target_value: null, target_type: "number", task_ids: ids });
        groupNote = ` Grouped as “${groupName}”.`;
      }
      setPicked(new Set());
      void Swal.fire({
        title: failed ? "Done, with problems" : "Added",
        html: `${created} task${created === 1 ? "" : "s"} created in All Tasks.${skipped ? ` ${skipped} already had a task.` : ""}${empty ? ` ${empty} had no ${taskFrom.title} and were skipped.` : ""}${failed ? ` ${failed} could not be created.` : ""}${groupNote}`,
        icon: failed ? "warning" : "success",
      });
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setBulk(false);
    }
  }

  async function makeDefault() {
    if (!tab || savingDefault) return;
    setSavingDefault(true);
    setError("");
    try {
      await sheetService.setCardDefaultTab(cardKey, tab);
      await loadCard();
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSavingDefault(false);
    }
  }

  async function saveUrl(event: FormEvent) {
    event.preventDefault();
    if (savingUrl || !urlText.trim()) return;
    setSavingUrl(true);
    setError("");
    try {
      await sheetService.setCardUrl(cardKey, urlText.trim());
      setTable(null);
      await loadCard();
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSavingUrl(false);
    }
  }

  // Anything loaded afresh starts without filters.
  useEffect(() => { setFilters({}); setSort({ key: "latest", dir: "desc" }); }, [table]);

  const filterColumns = useMemo(() => {
    if (!table || !filterLabels.length) return [];
    const wanted = new Set(filterLabels.map(normalize));
    return table.headers.flatMap((header, position) => {
      if (!wanted.has(normalize(header.label))) return [];
      const values = [...new Set(table.rows.map(row => (row.cells[position] ?? "").trim()).filter(value => value && value.toUpperCase() !== "FALSE"))]
        .sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }));
      return [{ position, label: header.label, values }];
    });
  }, [table, filterLabels]);
  const latestColumn = useMemo(() => {
    if (!table || !latestLabel) return null;
    const position = table.headers.findIndex(header => normalize(header.label) === normalize(latestLabel));
    return position < 0 ? null : position;
  }, [table, latestLabel]);
  const activeFilters = Object.values(filters).reduce((count, picked) => count + picked.length, 0);

  const rows = useMemo(() => {
    if (!table) return [];
    const needle = search.trim().toLowerCase();
    let list = table.rows;
    if (needle) list = list.filter(row => row.cells.some(cell => cell.toLowerCase().includes(needle)));
    for (const [position, picked] of Object.entries(filters)) {
      if (picked.length) list = list.filter(row => picked.includes((row.cells[Number(position)] ?? "").trim()));
    }
    const direction = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "row" || (sort.key === "latest" && latestColumn === null)) return [...list].sort((x, y) => (x.row - y.row) * direction);
    const position = sort.key === "latest" ? (latestColumn as number) : sort.key;
    return [...list].sort((x, y) => {
      const left = sortValue(x.cells[position] ?? "");
      const right = sortValue(y.cells[position] ?? "");
      if (left.kind === "empty" || right.kind === "empty") return left.kind === right.kind ? 0 : left.kind === "empty" ? 1 : -1;  // empty cells last either way
      const order = left.kind === "number" && right.kind === "number" ? left.number - right.number : left.text.localeCompare(right.text, undefined, { numeric: true });
      return order * direction || (y.row - x.row);
    });
  }, [table, search, filters, sort, latestColumn]);

  function sortBy(position: number) {
    setSort(current => {
      const key = position < 0 ? "row" : position;
      // The newest-first order already is the sort of the logged column (or of the rows): clicking its title flips it.
      const same = current.key === key || (current.key === "latest" && (latestColumn === null ? key === "row" : key === latestColumn));
      if (same) return { key: current.key, dir: current.dir === "asc" ? "desc" : "asc" };
      return { key, dir: key === "row" ? "desc" : "asc" };
    });
  }

  return (
    <Layout title={title} subtitle={subtitle}>
      <div className="etm-reports">
        <section className="etm-report-heading">
          <div>
            {back && <Link to={back.to} className="etm-inline-link-button" style={{ marginBottom: 6 }}><ArrowLeft size={14} /> {back.label}</Link>}
            <h2>{title}</h2>
            <p>Choose a tab of the sheet and press Sync to load it.</p>
          </div>
          {card?.target && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!readOnly && <button type="button" className="etm-button" onClick={() => void openEntry()} disabled={opening}>{opening ? <RefreshCw size={16} className="etm-form-spinner" /> : <Plus size={16} />} {opening ? "Opening…" : "Add entry"}</button>}
              <a href={card.url} target="_blank" rel="noreferrer" className="etm-button ghost"><ExternalLink size={15} /> Open the sheet</a>
              {isAdmin && table && <button type="button" className="etm-button ghost" onClick={() => setShowAccess(true)} title="Decide which rows a person may see"><UserCog size={15} /> Who sees what</button>}
              {isAdmin && <button type="button" className="etm-button ghost" onClick={() => setEditingUrl(value => !value)}><Link2 size={15} /> Change link</button>}
            </div>
          )}
        </section>

        {allowed === false && <p className="etm-report-error">This page is not for your project.</p>}
        {error && <p className="etm-report-error">{error}</p>}

        {allowed && editingUrl && (isAdmin || !card?.target) && (
          <form className="etm-panel etm-report-form" onSubmit={saveUrl} style={{ padding: 16, display: "grid", gap: 10 }}>
            <label>Google Sheets link
              <input value={urlText} onChange={event => setUrlText(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" required disabled={savingUrl} />
            </label>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--etm-muted)" }}>{isAdmin ? "This is the sheet everyone on this page sees. " : ""}The column titles are read from row 1 of the tab you pick. The sheet has to be shared with eTMS’s Google account as an Editor.</p>
            <div className="etm-report-form-actions">
              {card?.target && <button type="button" className="etm-button ghost" onClick={() => { setEditingUrl(false); setUrlText(card.url); }} disabled={savingUrl}>Cancel</button>}
              <button type="submit" className="etm-button" disabled={savingUrl}>{savingUrl ? "Saving…" : "Save link"}</button>
            </div>
          </form>
        )}

        {card?.target && !editingUrl && (
          <>
            <div className="etm-panel" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end", padding: 16, margin: "4px 0 14px" }}>
              <label className="etm-field-label" style={{ minWidth: 220 }}>Sheet tab
                <select className="etm-select" value={tab} onChange={event => void pickTab(event.target.value)} disabled={loading || refreshing || loadingTabs || !tabs.length}>
                  {loadingTabs && <option value="">Reading tabs…</option>}
                  {!loadingTabs && !tabs.length && <option value="">No tabs found</option>}
                  {tabs.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              {isAdmin && tab && (
                card?.default_tab === tab
                  ? <span className="etm-sheet-default-badge" title="This tab opens first for everyone (who has not picked another)">Default tab</span>
                  : <button type="button" className="etm-button ghost" style={{ minHeight: 40 }} onClick={() => void makeDefault()} disabled={savingDefault || loadingTabs} title="Open on this tab for everyone (they can still pick another)">{savingDefault ? "Saving…" : "Make default"}</button>
              )}
              <button type="button" className="etm-button" style={{ minHeight: 40 }} onClick={() => void load("sync")} disabled={loading || refreshing || loadingTabs || !tab}><RefreshCw size={16} className={loading || refreshing ? "etm-form-spinner" : undefined} /> {loading || refreshing ? "Syncing…" : "Sync"}</button>
              <label className="etm-field-label" style={{ minWidth: 240 }}>Search
                <input className="etm-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find in this tab" />
              </label>
              {table && (
                <label className="etm-field-label" style={{ minWidth: 200 }}>Sort
                  <select className="etm-select" value={sort.key === "latest" ? sort.dir : "column"} onChange={event => setSort({ key: "latest", dir: event.target.value as "asc" | "desc" })}>
                    <option value="desc">Newest first</option>
                    <option value="asc">Oldest first</option>
                    {sort.key !== "latest" && <option value="column">{sort.key === "row" ? `By sheet row (${sort.dir === "asc" ? "first–last" : "last–first"})` : `By ${table.headers[sort.key]?.label ?? "column"} (${sort.dir === "asc" ? "A–Z" : "Z–A"})`}</option>}
                  </select>
                </label>
              )}
              {table && <span title={`Synced ${table.tab}`} style={{ marginLeft: "auto", fontSize: 13, color: "var(--etm-muted)", textAlign: "right" }}>{rows.length} row{rows.length === 1 ? "" : "s"}{syncedAt ? ` · synced ${ago(syncedAt)}${refreshing ? ", checking for changes…" : ""}` : ""}</span>}
            </div>
            {table && filterColumns.length > 0 && (
              <div className="etm-panel" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", padding: 16, margin: "0 0 14px" }}>
                {filterColumns.map(column => {
                  const options = column.values.map((value, index) => ({ id: index, name: value }));
                  const picked = filters[column.position] ?? [];
                  return (
                    <MultiSelect key={column.position} label={column.label} options={options} placeholder="All"
                      selected={options.filter(option => picked.includes(option.name)).map(option => option.id)}
                      onChange={ids => setFilters(current => ({ ...current, [column.position]: ids.map(id => options[id]?.name).filter((name): name is string => !!name) }))} />
                  );
                })}
                {activeFilters > 0 && <button type="button" className="etm-button ghost" style={{ minHeight: 40 }} onClick={() => setFilters({})}>Clear filters ({activeFilters})</button>}
              </div>
            )}
            {access && (access.assigned || access.conditions?.length) && (
              <p className="etm-panel" style={{ margin: "0 0 14px", padding: "10px 14px", fontSize: 13, color: "var(--etm-ink)" }}>
                {access.assigned && <>You see only the rows of the tasks assigned to you. </>}
                {access.conditions?.length ? <>You see only the rows where {access.conditions.map((item, index) => (
                  <span key={item.column}>{index ? (access.match === "any" ? " or " : " and ") : ""}<strong>{item.column}</strong> is {item.values.map((value, position) => <span key={value}>{position ? ", " : ""}<strong>{value}</strong></span>)}</span>
                ))}.</> : null}
              </p>
            )}
            {!table && !loading && !error && <p style={{ color: "var(--etm-muted)" }}>Choose a tab, then press Sync to load it from the sheet.</p>}
            {table && taskFrom && !readOnly && picked.size > 0 && (
              <div className="etm-panel" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 12, color: "var(--etm-ink)" }}>
                <strong style={{ fontSize: 13.5 }}>{picked.size} selected</strong>
                <button type="button" className="etm-button" style={{ minHeight: 36 }} onClick={() => void addPicked(false)} disabled={bulk}>{bulk ? <RefreshCw size={15} className="etm-form-spinner" /> : <ListPlus size={15} />} Add to my task list</button>
                <button type="button" className="etm-button ghost" style={{ minHeight: 36 }} onClick={() => void addPicked(true)} disabled={bulk}><FolderPlus size={15} /> Add as grouped task</button>
                <button type="button" className="etm-button ghost" style={{ minHeight: 36 }} onClick={() => setPicked(new Set())} disabled={bulk}>Clear</button>
              </div>
            )}
            {table && <SheetTableView table={table} rows={rows} select={taskFrom && !readOnly ? { picked, onToggle: number => toggleRows([number], !picked.has(number)), onToggleMany: toggleRows } : undefined} sort={sort} onSort={sortBy} latestColumn={latestColumn}
              action={taskFrom && !readOnly ? {
                label: "Task",
                render: row => {
                  const titlePosition = table.headers.findIndex(header => normalize(header.label) === normalize(taskFrom.title));
                  const existing = titlePosition < 0 ? undefined : madeTasks[(row.cells[titlePosition] ?? "").trim().toLowerCase()];
                  if (existing) {
                    const key = (row.cells[titlePosition] ?? "").trim().toLowerCase();
                    return <button type="button" className="etm-sheet-task-btn done wide" onClick={() => void locate(key)} disabled={locating === key} title="A task was made from this row: go to it" aria-label="Locate the task">{locating === key ? <RefreshCw size={14} className="etm-form-spinner" /> : <MapPin size={15} />} Locate</button>;
                  }
                  const busy = making.has(row.row);
                  return <button type="button" className="etm-sheet-task-btn" onClick={() => void createTask(row)} disabled={busy} title="Create a task from this row" aria-label="Create a task from this row">{busy ? <RefreshCw size={15} className="etm-form-spinner" /> : <ListPlus size={16} />}</button>;
                },
              } : undefined} />}
          </>
        )}
      </div>
      {adding && card?.target && preload && (
        <Modal open onClose={() => setAdding(false)} title={`New entry · ${tab}`} widthClass="max-w-6xl">
          <div className="etm-entry-modal">
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--etm-muted)" }}>The fields are the sheet’s own columns, and the dropdowns offer the sheet’s own choices. Sending adds one new line at the bottom of {tab}.</p>
          <SheetEntryForm embedded fixedTargetId={card.target} initialTab={tab} preload={preload} onSent={() => { setAdding(false); schemaMemory.delete(`${targetId}:${tab}`); }} />
          </div>
        </Modal>
      )}
      {showAccess && card?.target && table && (
        <RowAccessDialog targetId={card.target} page={card.page} headers={table.headers} rows={table.rows} defaultColumn="Assigned Personnel" onClose={() => setShowAccess(false)} />
      )}
      {pendingTask && (
        <CreateTaskDialog
          initialTitle={pendingTask.title}
          summary={[pendingTask.details ? "Description from the request details" : "", pendingTask.remarks.length ? `${pendingTask.remarks.length} remark${pendingTask.remarks.length === 1 ? "" : "s"} from the progress log` : "", pendingTask.links.length ? `${pendingTask.links.length} attached link${pendingTask.links.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
          members={pendingTask.members} provincial={pendingTask.viewers.provincial} focal={pendingTask.viewers.focal}
          onClose={() => setPendingTask(null)} onSubmit={submitTask} />
      )}
      {(loadingTabs || loading) && createPortal(
        <div className="etm-sheet-loading" role="status" aria-live="polite" aria-busy="true">
          <div className="etm-sheet-loading-card">
            <span className="etm-sheet-loading-spinner" aria-hidden="true" />
            <strong>{loading ? `Syncing ${tab || "the sheet"}…` : "Reading the sheet’s tabs…"}</strong>
            <span>{loading ? "Loading the rows from Google Sheets." : "Getting the tabs from Google Sheets."}</span>
          </div>
        </div>,
        document.body,
      )}
    </Layout>
  );
}
