import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { BarChart3, CheckCircle2, ChevronRight, FolderKanban, GripVertical, Info, ListChecks, MousePointer2, Play, Plus, Square, Target } from "lucide-react";
import Modal from "../../components/ui/modal";
import TaskForm from "../../features/tasks/TaskForm";
import { useTasks } from "../../features/tasks/taskContext";
import { formatDate, type Task } from "../../features/tasks/types";

type GuideKey = "add-task" | "update-task" | "reports";

interface StepDemo {
  selector: string;
  action?: "click" | "focus" | "type" | "select" | "toggle" | "drag";
  value?: string;
  // Only used when action === "drag" — the element `selector` gets dropped onto.
  targetSelector?: string;
}

interface StepItem {
  text: React.ReactNode;
  short: string;
  demo?: StepDemo;
}

interface Guide {
  key: GuideKey;
  label: string;
  icon: React.ReactNode;
  title: string;
  intro: string;
  items: StepItem[];
}

const GUIDES: Guide[] = [
  {
    key: "add-task",
    label: "Add Task",
    icon: <Plus size={15} />,
    title: "Creating a new task",
    intro: "Every task starts here, whether it's personal or tied to a project.",
    items: [
      {
        text: <>Click <strong>Add Task</strong> in the sidebar (or the <strong>+</strong> button on mobile).</>,
        short: "Open Add Task",
        demo: { selector: '[data-howto="task-title"]', action: "focus" },
      },
      {
        text: <>Give it a clear <strong>Task Title</strong> — this is required.</>,
        short: "Type the task title",
        demo: { selector: '[data-howto="task-title"]', action: "type", value: "Prepare monthly status report" },
      },
      {
        text: <>Choose <strong>Personal</strong> or <strong>Project task</strong>. Project tasks need a Project/Office; personal ones are only visible to you.</>,
        short: "Choose Personal or Project",
        demo: { selector: '[data-howto="task-type-personal"]', action: "click" },
      },
      {
        text: <>Pick a <strong>Deadline</strong> (required) and, if it repeats, set <strong>Repeat</strong> to Daily, Weekly, Monthly, or Anytime.</>,
        short: "Set the deadline",
        demo: { selector: '[data-howto="deadline"]', action: "type", value: sampleFutureDate(5) },
      },
      {
        text: <>Set the <strong>Priority</strong> — Low, Medium, or High.</>,
        short: "Pick a priority",
        demo: { selector: '[data-howto="priority-high"]', action: "click" },
      },
      {
        text: <>Optionally fill in the <strong>Requestor</strong>, <strong>Location</strong>, assign <strong>people</strong> with a role, and add <strong>Subtasks</strong>.</>,
        short: "Fill in requestor & extras",
        demo: { selector: '[data-howto="requestor"]', action: "type", value: "Office of the Division Chief" },
      },
      {
        text: <>Click <strong>Create task</strong>. New tasks always start as <strong>Pending</strong>.</>,
        short: "Create the task",
        demo: { selector: '[data-howto="submit-button"]', action: "click" },
      },
    ],
  },
  {
    key: "update-task",
    label: "Updating Task",
    icon: <ListChecks size={15} />,
    title: "Updating a task from All Tasks",
    intro: "Edit any task's details, status, or assignees straight from the task list.",
    items: [
      {
        text: <>Go to <strong>All Tasks</strong> in the sidebar.</>,
        short: "Open All Tasks",
        demo: { selector: '[data-howto="task-title"]', action: "focus" },
      },
      {
        text: <>Find the task in the table — use the search bar or filters if the list is long.</>,
        short: "Find the task",
        demo: { selector: '[data-howto="task-title"]', action: "type", value: "Prepare monthly status report (Q3 review)" },
      },
      {
        text: <>Click the pencil (<strong>Edit</strong>) icon in the Action Buttons column.</>,
        short: "Click the Edit icon",
        demo: { selector: '[data-howto="task-title"]', action: "focus" },
      },
      {
        text: <>Change whatever needs updating — status, priority, deadline, assignees, or the subtask checklist.</>,
        short: "Update the status",
        demo: { selector: '[data-howto="status"]', action: "select", value: "Blocked/Stuck" },
      },
      {
        text: <>Click <strong>Save changes</strong> to apply your updates.</>,
        short: "Save your changes",
        demo: { selector: '[data-howto="submit-button"]', action: "click" },
      },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    icon: <BarChart3 size={15} />,
    title: "Grouping completed tasks into a report",
    intro: "Turn finished work into a reusable activity report you can reopen anytime.",
    items: [
      {
        text: <>Go to <strong>Reports</strong> in the sidebar.</>,
        short: "Open Reports",
        demo: { selector: '[data-howto="report-checkbox-0"]', action: "focus" },
      },
      {
        text: <>Tick the checkbox next to each <strong>completed task</strong> you want to include.</>,
        short: "Tick a completed task",
        demo: { selector: '[data-howto="report-checkbox-0"]', action: "click" },
      },
      {
        text: <>Click <strong>Group Activity</strong> — it appears once at least one task is selected.</>,
        short: "Click Group Activity",
        demo: { selector: '[data-howto="group-activity-button"]', action: "click" },
      },
      {
        text: <>Fill in the <strong>Grouped Tasks Name</strong>, pick a <strong>Project</strong>, and set a <strong>target</strong> if you have one.</>,
        short: "Name the group",
        demo: { selector: '[data-howto="group-name-input"]', action: "type", value: "eGov Booth Conducted" },
      },
      {
        text: <>Click <strong>Submit</strong> to save it. You can reopen any group later to see which tasks are inside it.</>,
        short: "Submit the group",
        demo: { selector: '[data-howto="group-submit-button"]', action: "click" },
      },
      {
        text: <>Once it's saved, find it under <strong>Grouped Tasks</strong> below — open it to see the tagged tasks inside, then close it again.</>,
        short: "Open the new group",
        demo: { selector: '[data-howto="report-group-row"]', action: "toggle" },
      },
      {
        text: <>You don't have to use the dialog every time — <strong>drag a completed task</strong> straight onto an existing group in the list to tag it, no dialog needed.</>,
        short: "Drag a task onto a group",
        demo: { selector: '[data-howto="report-task-row-1"]', action: "drag", targetSelector: '[data-howto="report-group-row"]' },
      },
    ],
  },
];

const SAMPLE_SUBTASKS = [
  { id: 1, title: "Pull data from the task board", description: "", status: "Completed" as const, is_completed: true },
  { id: 2, title: "Draft the summary write-up", description: "", status: "Pending" as const, is_completed: false },
];

const SAMPLE_COMPLETED_TASKS = [
  { id: -1, title: "Distribute onboarding kits", project: "Administrative and Finance Division", details: "Handed out welcome kits to new hires for this quarter's batch.", updated_at: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: -2, title: "Submit Q3 accomplishment summary", project: "Budget Office", details: "Compiled and submitted the quarterly accomplishment report.", updated_at: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: -3, title: "Update office directory", project: "", details: "", updated_at: new Date(Date.now() - 9 * 86400000).toISOString() },
];

const SAMPLE_GROUPS = [
  { id: -1, grouped_task_id: "ACT-20260901-1234", name: "eGov Booth Conducted", project_name: "Administrative and Finance Division", created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
];

const DRAG_TASK_TYPE = "application/x-etm-task-id";

function sampleFutureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}

type Speed = "slow" | "fast";
const SPEED_PRESETS: Record<Speed, { scrollWait: number; moveWait: number; stepPause: number; typeDelay: number; viewPause: number }> = {
  slow: { scrollWait: 550, moveWait: 850, stepPause: 1300, typeDelay: 55, viewPause: 1700 },
  fast: { scrollWait: 220, moveWait: 320, stepPause: 380, typeDelay: 16, viewPause: 650 },
};
const SNACKBAR_DURATION = 4200;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function previewNoop() {
  // Deliberately does nothing — this form is for the How To guide, not real data.
}

// Bypasses React's controlled-input value tracking by calling the native
// property setter directly — a plain `el.value = x` is silently ignored by
// React, so the field would never actually reflect the typed text.
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(el, value);
}

async function typeIntoField(el: HTMLInputElement | HTMLTextAreaElement, text: string, charDelay: number, token: number, tokenRef: { current: number }) {
  setNativeValue(el, "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  let current = "";
  for (const char of text) {
    if (tokenRef.current !== token) return;
    current += char;
    setNativeValue(el, current);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(charDelay);
  }
}

function selectValue(el: HTMLSelectElement, value: string) {
  setNativeValue(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function HowToCursor({ pos, rippleKey }: { pos: { x: number; y: number } | null; rippleKey: number }) {
  if (!pos) return null;
  return createPortal(
    <>
      <div className="etm-howto-cursor" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <MousePointer2 size={26} fill="currentColor" />
      </div>
      {rippleKey > 0 && <div key={rippleKey} className="etm-howto-ripple" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} />}
    </>,
    document.body,
  );
}

interface DragGhost {
  x: number;
  y: number;
  label: string;
}

// A small floating chip that follows the cursor during a "drag" demo step, standing in
// for the dragged row itself — without it, the cursor just slides over and a count
// changes, with nothing visibly showing what got picked up and carried.
function HowToDragGhost({ ghost }: { ghost: DragGhost | null }) {
  if (!ghost) return null;
  return createPortal(
    <div className="etm-howto-drag-ghost" style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}>
      <GripVertical size={12} />
      <span>{ghost.label}</span>
    </div>,
    document.body,
  );
}

function HowToSnackbar({ text }: { text: string | null }) {
  if (!text) return null;
  return createPortal(
    <div className="etm-howto-snackbar" role="status">{text}</div>,
    document.body,
  );
}

function StepList({ guide, activeStep, isPlaying, speed, onStepTap, onPlayAll, onStop, onSpeedChange }: { guide: Guide; activeStep: number | null; isPlaying: boolean; speed: Speed; onStepTap: (index: number) => void; onPlayAll: () => void; onStop: () => void; onSpeedChange: (speed: Speed) => void }) {
  return (
    <div className="etm-panel etm-howto-steps">
      <div className="etm-howto-steps-head">
        <h2>{guide.title}</h2>
        <p>{guide.intro}</p>
      </div>
      <ol className={`etm-howto-step-list ${isPlaying ? "playing" : ""}`}>
        {guide.items.map((item, index) => (
          <li key={index}>
            <button type="button" className={`etm-howto-step ${activeStep === index ? "active" : ""}`} onClick={() => onStepTap(index)}>
              <span className="etm-howto-step-number">{index + 1}</span>
              <span className="etm-howto-step-text">{item.text}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="etm-howto-controls">
        <div className="etm-howto-speed" role="radiogroup" aria-label="Preview speed">
          <button type="button" role="radio" aria-checked={speed === "slow"} className={speed === "slow" ? "active" : ""} onClick={() => onSpeedChange("slow")}>Slow</button>
          <button type="button" role="radio" aria-checked={speed === "fast"} className={speed === "fast" ? "active" : ""} onClick={() => onSpeedChange("fast")}>Fast</button>
        </div>
        <button type="button" className={`etm-button small ${isPlaying ? "ghost" : ""}`} onClick={isPlaying ? onStop : onPlayAll}>
          {isPlaying ? <><Square size={13} />Stop</> : <><Play size={13} />Preview</>}
        </button>
      </div>
    </div>
  );
}

function ReportsPreview() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [groupOpen, setGroupOpen] = useState(false);
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [hasTarget, setHasTarget] = useState(false);
  const [target, setTarget] = useState(SAMPLE_COMPLETED_TASKS.length);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  // Starts with only the first sample task tagged, so the "drag a task onto a group" step
  // has something real to demonstrate — dragging the second task actually grows this set.
  const [groupTaskIds, setGroupTaskIds] = useState<number[]>([SAMPLE_COMPLETED_TASKS[0].id]);
  const [dragOverGroup, setDragOverGroup] = useState(false);

  const toggle = (id: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = selected.size === SAMPLE_COMPLETED_TASKS.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(SAMPLE_COMPLETED_TASKS.map(task => task.id)));

  const openGroupDialog = () => {
    setName("");
    setProjectName(SAMPLE_COMPLETED_TASKS.find(task => selected.has(task.id))?.project ?? "");
    setHasTarget(false);
    setTarget(selected.size);
    setGroupOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGroupOpen(false);
  };

  const handleGroupDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOverGroup(false);
    const raw = event.dataTransfer.getData(DRAG_TASK_TYPE) || event.dataTransfer.getData("text/plain");
    const taskId = Number(raw);
    if (!taskId || groupTaskIds.includes(taskId)) return;
    setGroupTaskIds(current => [...current, taskId]);
    setExpandedGroupId(SAMPLE_GROUPS[0].id);
  };

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><CheckCircle2 size={15} /> Completed work</p>
          <h2>Completed Tasks</h2>
          <p>Select completed tasks, then collect them into a grouped activity report.</p>
        </div>
        {selected.size > 0 && (
          <button type="button" data-howto="group-activity-button" className="etm-button" onClick={openGroupDialog}><FolderKanban size={16} /> Group Activity ({selected.size})</button>
        )}
      </section>

      <section className="etm-panel etm-table-wrap">
        <table className="etm-tasks-table etm-report-table">
          <thead><tr>
            <th className="etm-report-check"><input type="checkbox" aria-label="Select all completed tasks" checked={allSelected} onChange={toggleAll} /></th>
            <th>Task Title</th><th>Date and Time Finished</th><th>Description</th>
          </tr></thead>
          <tbody>
            {SAMPLE_COMPLETED_TASKS.map((task, index) => (
              <tr
                key={task.id}
                draggable
                data-howto={index === 1 ? "report-task-row-1" : undefined}
                title="Drag onto a group below to add it there"
                onDragStart={event => {
                  event.dataTransfer.setData(DRAG_TASK_TYPE, String(task.id));
                  event.dataTransfer.setData("text/plain", String(task.id));
                  event.dataTransfer.effectAllowed = "copy";
                }}
              >
                <td className="etm-report-check"><input data-howto={index === 0 ? "report-checkbox-0" : undefined} type="checkbox" aria-label={`Select ${task.title}`} checked={selected.has(task.id)} onChange={() => toggle(task.id)} /></td>
                <td className="etm-report-task-title"><GripVertical size={13} className="etm-report-drag-handle" aria-hidden="true" />{task.title}</td>
                <td>{formatDate(task.updated_at, true)}</td>
                <td className="etm-tasks-table-details-col">{task.details ? <span title={task.details}>{task.details}</span> : <span className="etm-tasks-table-unassigned">No details</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="etm-report-groups-section">
        <div className="etm-report-section-title"><div><p className="etm-report-eyebrow"><FolderKanban size={15} /> Activity reports</p><h2>Grouped Tasks</h2></div><span>{SAMPLE_GROUPS.length} group</span></div>
        <div className="etm-panel etm-table-wrap etm-report-groups">
          <table className="etm-tasks-table etm-report-groups-table">
            <thead><tr><th>Grouped Task</th><th>Project</th><th>Created</th></tr></thead>
            <tbody>{SAMPLE_GROUPS.map(group => {
              const expanded = expandedGroupId === group.id;
              const taggedTasks = SAMPLE_COMPLETED_TASKS.filter(task => groupTaskIds.includes(task.id));
              return (
                <Fragment key={group.id}>
                  <tr
                    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragOverGroup(true); }}
                    onDragLeave={() => setDragOverGroup(false)}
                    onDrop={handleGroupDrop}
                    className={dragOverGroup ? "etm-report-group-drag-over" : undefined}
                  >
                    <td><button type="button" data-howto="report-group-row" className="etm-report-group-row" onClick={() => setExpandedGroupId(expanded ? null : group.id)} aria-expanded={expanded}><ChevronRight className={expanded ? "open" : ""} size={18} /><span className="etm-report-group-name">{group.name} <strong>({taggedTasks.length}/{taggedTasks.length})</strong></span><small>{group.grouped_task_id}</small></button></td><td>{group.project_name}</td><td>{formatDate(group.created_at)}</td></tr>
                  {expanded && <tr className="etm-report-group-expanded"><td colSpan={3}><div className="etm-report-group-tasks">{taggedTasks.map(task => <div key={task.id}><CheckCircle2 size={15} /><span>{task.title}</span><small>{task.project || "Personal"}</small></div>)}</div></td></tr>}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
      </section>

      <Modal open={groupOpen} onClose={() => setGroupOpen(false)} title="Group Activity">
        <form className="etm-report-form" onSubmit={submit}>
          <p className="etm-report-form-intro">Grouping {selected.size} completed {selected.size === 1 ? "task" : "tasks"}.</p>
          <label>Grouped Tasks ID<input value="ACT-20260910-0001" readOnly aria-label="Automatically generated grouped task ID" /></label>
          <label>Grouped Tasks Name<input data-howto="group-name-input" value={name} onChange={event => setName(event.target.value)} required maxLength={255} placeholder="e.g. eGov Booth Conducted" /></label>
          <label>Created Date<input value={formatDate(new Date().toISOString())} readOnly aria-label="Created date" /></label>
          <label>Project Name<input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Type to search projects…" /></label>
          <fieldset><legend>Do you have a target?</legend><div className="etm-report-radio-row"><label><input type="radio" checked={!hasTarget} onChange={() => setHasTarget(false)} /> No</label><label><input type="radio" checked={hasTarget} onChange={() => setHasTarget(true)} /> Yes</label></div></fieldset>
          {hasTarget && <div className="etm-report-target-row"><label>Target<input type="number" min="1" value={target} onChange={event => setTarget(Number(event.target.value) || 0)} /></label></div>}
          <div className="etm-report-form-actions"><button type="button" className="etm-button ghost" onClick={() => setGroupOpen(false)}>Cancel</button><button type="submit" data-howto="group-submit-button" className="etm-button"><Target size={16} />Submit</button></div>
        </form>
      </Modal>
    </div>
  );
}

export default function HowTo() {
  const { members, projects } = useTasks();
  const [activeKey, setActiveKey] = useState<GuideKey>("add-task");
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [rippleKey, setRippleKey] = useState(0);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [speed, setSpeed] = useState<Speed>("slow");
  const [snackbarText, setSnackbarText] = useState<string | null>(null);
  const runToken = useRef(0);
  const playToken = useRef(0);
  const snackbarTimer = useRef<number | undefined>(undefined);
  const layoutRef = useRef<HTMLDivElement>(null);
  const activeGuide = GUIDES.find(guide => guide.key === activeKey)!;

  useEffect(() => {
    setActiveStep(null);
    setCursorPos(null);
    setDragGhost(null);
    setSnackbarText(null);
    if (snackbarTimer.current) window.clearTimeout(snackbarTimer.current);
    playToken.current++;
    setIsPlaying(false);
  }, [activeKey]);

  useEffect(() => {
    function recalc() {
      if (!layoutRef.current) return;
      const top = layoutRef.current.getBoundingClientRect().top;
      // The panel's bottom edge lands at (top + height); <main> then adds its own
      // bottom padding below that. Reuse that real padding as our bottom margin
      // instead of guessing one, so the two don't stack into extra page scroll.
      const mainEl = layoutRef.current.closest("main");
      const bottomGap = mainEl ? parseFloat(getComputedStyle(mainEl).paddingBottom) || 18 : 18;
      setPanelHeight(Math.max(360, window.innerHeight - top - bottomGap));
    }
    recalc();
    const raf = requestAnimationFrame(() => requestAnimationFrame(recalc));
    window.addEventListener("resize", recalc);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", recalc);
    };
  }, []);

  const sampleTask = useMemo<Task>(() => ({
    id: 0,
    title: "Prepare monthly status report",
    project: { id: 0, name: "Administrative and Finance Division" },
    details: "Compile last month's completed tasks and blockers into a one-page summary.",
    requestor: "Office of the Division Chief",
    location_province: "",
    location_city: "",
    location_barangay: "",
    priority: "Medium",
    deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    recurrence: "Monthly",
    recurrence_weekdays: "",
    recurrence_dates: [],
    occurrence_completions: [],
    status: "In-Progress",
    is_completed: false,
    is_archived: false,
    completion_seen: true,
    is_creator: true,
    assignments: members[0] ? [{ ...members[0], role: "Editor" }] : [],
    subtasks: SAMPLE_SUBTASKS,
    remarks: [],
    attachments: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    latest_progress_at: null,
    progress_logs: [],
    activity_logs: [],
    my_role: "Owner",
    can_edit: true,
    can_delete: true,
    can_manage_assignments: true,
  }), [members]);

  function showNextStepSnackbar(index: number) {
    if (snackbarTimer.current) window.clearTimeout(snackbarTimer.current);
    const next = activeGuide.items[index + 1];
    const text = next
      ? `Next — Step ${index + 2}: ${next.short}`
      : `That's all ${activeGuide.items.length} steps for "${activeGuide.label}."`;
    setSnackbarText(text);
    snackbarTimer.current = window.setTimeout(() => setSnackbarText(null), SNACKBAR_DURATION);
  }

  async function runStep(index: number) {
    setActiveStep(index);
    setSnackbarText(null);
    const demo = activeGuide.items[index]?.demo;
    if (!demo) {
      showNextStepSnackbar(index);
      return;
    }
    const token = ++runToken.current;
    const target = document.querySelector<HTMLElement>(demo.selector);
    if (!target) return;

    const preset = SPEED_PRESETS[speed];
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    await wait(preset.scrollWait);
    if (runToken.current !== token) return;

    const rect = target.getBoundingClientRect();
    setCursorPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    await wait(preset.moveWait);
    if (runToken.current !== token) return;

    setRippleKey(key => key + 1);
    if (demo.action === "click") {
      target.click();
    } else if (demo.action === "focus") {
      target.focus();
    } else if (demo.action === "type" && demo.value) {
      target.focus();
      await typeIntoField(target as HTMLInputElement, demo.value, preset.typeDelay, token, runToken);
    } else if (demo.action === "select" && demo.value) {
      target.focus();
      selectValue(target as HTMLSelectElement, demo.value);
    } else if (demo.action === "toggle") {
      target.click();
      await wait(preset.viewPause);
      if (runToken.current !== token) return;
      target.click();
    } else if (demo.action === "drag" && demo.targetSelector) {
      const dropTarget = document.querySelector<HTMLElement>(demo.targetSelector);
      if (dropTarget) {
        // A real HTML5 drag never fires from scripted `.click()`-style calls — dispatch
        // the actual DragEvents sharing one DataTransfer, so the same onDragStart/onDrop
        // handlers a real drag would hit (including setData/getData) run for real.
        const dataTransfer = new DataTransfer();
        const label = target.querySelector(".etm-report-task-title")?.textContent?.trim() || target.textContent?.trim() || "Task";
        // A floating chip stands in for the row being carried — otherwise the cursor
        // just slides over and a count changes, with nothing visibly "picked up".
        setDragGhost({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, label });
        target.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
        dropTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        await wait(preset.scrollWait);
        if (runToken.current !== token) { setDragGhost(null); return; }
        const dropRect = dropTarget.getBoundingClientRect();
        const dropPos = { x: dropRect.left + dropRect.width / 2, y: dropRect.top + dropRect.height / 2 };
        setCursorPos(dropPos);
        setDragGhost({ ...dropPos, label });
        await wait(preset.moveWait);
        if (runToken.current !== token) { setDragGhost(null); return; }
        setRippleKey(key => key + 1);
        dropTarget.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
        dropTarget.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
        target.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
        // Let the chip visibly rest on the drop target for a beat before it disappears,
        // instead of vanishing the instant the drop fires.
        await wait(preset.viewPause / 2);
        setDragGhost(null);
      }
    }
    if (runToken.current !== token) return;
    showNextStepSnackbar(index);
  }

  function handleStepTap(index: number) {
    if (isPlaying) return;
    void runStep(index);
  }

  async function playAll() {
    if (isPlaying) return;
    const token = ++playToken.current;
    // Remount the preview so playback always starts from a clean slate,
    // regardless of whatever a previous manual tap left behind.
    setReplayKey(key => key + 1);
    setCursorPos(null);
    setDragGhost(null);
    setIsPlaying(true);
    await wait(150);
    for (let index = 0; index < activeGuide.items.length; index++) {
      if (playToken.current !== token) return;
      await runStep(index);
      if (playToken.current !== token) return;
      await wait(SPEED_PRESETS[speed].stepPause);
    }
    if (playToken.current === token) {
      setIsPlaying(false);
      setCursorPos(null);
    }
  }

  function stopPlaying() {
    playToken.current++;
    runToken.current++;
    setIsPlaying(false);
    setDragGhost(null);
    setSnackbarText(null);
    if (snackbarTimer.current) window.clearTimeout(snackbarTimer.current);
  }

  return (
    <div>
      <div className="etm-tabs etm-howto-tabs" role="tablist" aria-label="How-to guide">
        {GUIDES.map(guide => (
          <button
            key={guide.key}
            type="button"
            role="tab"
            aria-selected={activeKey === guide.key}
            className={`etm-tab ${activeKey === guide.key ? "active" : ""}`}
            onClick={() => setActiveKey(guide.key)}
          >
            {guide.icon}{guide.label}
          </button>
        ))}
      </div>

      <div
        className="etm-howto-layout"
        ref={layoutRef}
        style={panelHeight ? { "--etm-howto-panel-height": `${panelHeight}px` } as React.CSSProperties : undefined}
      >
        <StepList guide={activeGuide} activeStep={activeStep} isPlaying={isPlaying} speed={speed} onStepTap={handleStepTap} onPlayAll={() => void playAll()} onStop={stopPlaying} onSpeedChange={setSpeed} />
        <div className="etm-panel etm-howto-preview-wrap">
          <span className="etm-howto-preview-badge"><Info size={12} />Preview only — nothing here is saved</span>
          {activeKey === "add-task" && <TaskForm key={`add-task-${replayKey}`} members={members} projects={projects} onSave={previewNoop} onCancel={previewNoop} />}
          {activeKey === "update-task" && <TaskForm key={`update-task-${replayKey}`} task={sampleTask} members={members} projects={projects} onSave={previewNoop} onCancel={previewNoop} />}
          {activeKey === "reports" && <ReportsPreview key={`reports-${replayKey}`} />}
        </div>
      </div>

      <HowToCursor pos={cursorPos} rippleKey={rippleKey} />
      <HowToDragGhost ghost={dragGhost} />
      <HowToSnackbar text={snackbarText} />
    </div>
  );
}
