import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { isAxiosError } from "axios";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { AlertTriangle, Bold, CalendarDays, Check, CheckCheck, ChevronRight, Circle, ClipboardList, Clock3, Download, Edit3, Flag, Folder, History, Italic, List, Loader2, MessageSquare, Paperclip, Pencil, Plus, Reply, Send, SmilePlus, Trash2, Underline, User, Users, X } from "lucide-react";
import MentionField from "./MentionField";
import { useAuth } from "../../screens/Auth/AuthContext";
import { useTasks } from "./taskContext";
import { completionPercent, formatDate, formatFileSize, isOverdue, memberName, REACTION_EMOJI, STATUSES, type Attachment, type Member, type ProgressLog, type Remark, type SubTask, type Task, type TaskStatus } from "./types";
import "./forms.css";

interface TaskDetailsProps {
  task: Task;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onProgress: (message: string, status: TaskStatus) => Promise<void>;
  onEditProgress: (logId: number, message: string) => Promise<void>;
  onDeleteProgress: (logId: number) => Promise<void>;
  onAddRemark: (message: string, file?: File) => Promise<void>;
  onEditRemark: (remarkId: number, message: string) => Promise<void>;
  onDeleteRemark: (remarkId: number) => Promise<void>;
  onReactRemark: (remarkId: number, emoji: string) => Promise<void>;
  onAddRemarkReply: (remarkId: number, message: string) => Promise<void>;
  onAddSubtaskRemark: (subtaskId: number, message: string, file?: File) => Promise<void>;
  onEditSubtaskRemark: (subtaskId: number, remarkId: number, message: string) => Promise<void>;
  onDeleteSubtaskRemark: (subtaskId: number, remarkId: number) => Promise<void>;
  onReactSubtaskRemark: (subtaskId: number, remarkId: number, emoji: string) => Promise<void>;
  onAddSubtaskRemarkReply: (subtaskId: number, remarkId: number, message: string) => Promise<void>;
  onSetSubtaskStatus: (subtaskId: number, message: string, status: TaskStatus) => Promise<void>;
  onAddSubtask: (title: string, description?: string) => Promise<void>;
  onEditSubtask: (subtaskId: number, input: { title?: string; description?: string }) => Promise<void>;
  onDeleteSubtask: (subtaskId: number) => Promise<void>;
  onSetSubtaskCompletion: (subtaskId: number, isCompleted: boolean) => Promise<void>;
  onAddRemarkAttachment: (remarkId: number, file: File) => Promise<void>;
  onDeleteRemarkAttachment: (remarkId: number, attachmentId: number) => Promise<void>;
  onAddSubtaskRemarkAttachment: (subtaskId: number, remarkId: number, file: File) => Promise<void>;
  onDeleteSubtaskRemarkAttachment: (subtaskId: number, remarkId: number, attachmentId: number) => Promise<void>;
  onMarkCompletionSeen: () => Promise<void>;
  onMarkViewed: () => Promise<void>;
  initialSubtaskId?: number | null;
  page?: boolean;
}

// Progress History (and its dedicated status form) is superseded by the status
// field now built into the Remarks composer — hidden for now, not removed.
const SHOW_PROGRESS_HISTORY = false;

function progressError(error: unknown): string {
  if (isAxiosError(error)) {
    if (typeof error.response?.data?.message === "string") return error.response.data.message;
    if (!error.response) return "We couldn’t reach the server. Check your connection and try again.";
  }
  return "The update couldn’t be saved. Please try again.";
}

function remarkError(error: unknown): string {
  if (isAxiosError(error)) {
    if (typeof error.response?.data?.message === "string") return error.response.data.message;
    if (!error.response) return "We couldn’t reach the server. Check your connection and try again.";
  }
  return "The remark couldn’t be saved. Please try again.";
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;

function linkifyTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node as Text);
  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest("a")) continue;
    const text = textNode.textContent ?? "";
    URL_PATTERN.lastIndex = 0;
    if (!URL_PATTERN.test(text)) continue;
    URL_PATTERN.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_PATTERN.exec(text))) {
      let url = match[0];
      let trailing = "";
      while (url.length && /[.,:;!?'")\]]/.test(url[url.length - 1])) {
        trailing = url[url.length - 1] + trailing;
        url = url.slice(0, -1);
      }
      if (!url) continue;
      if (match.index > lastIndex) fragment.append(text.slice(lastIndex, match.index));
      const anchor = document.createElement("a");
      anchor.setAttribute("href", /^https?:\/\//i.test(url) ? url : `https://${url}`);
      anchor.textContent = url;
      fragment.append(anchor);
      if (trailing) fragment.append(trailing);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) fragment.append(text.slice(lastIndex));
    textNode.replaceWith(fragment);
  }
}

function safeRichText(value: string): string {
  const documentNode = new DOMParser().parseFromString(value, "text/html");
  linkifyTextNodes(documentNode.body);
  const allowed = new Set(["A", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "P", "BR"]);
  documentNode.body.querySelectorAll("*").forEach(node => {
    if (!allowed.has(node.tagName)) { node.replaceWith(...Array.from(node.childNodes)); return; }
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      Array.from(node.attributes).forEach(attribute => node.removeAttribute(attribute.name));
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute("href", href);
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      } else {
        node.replaceWith(...Array.from(node.childNodes));
      }
    } else {
      Array.from(node.attributes).forEach(attribute => node.removeAttribute(attribute.name));
    }
  });
  return documentNode.body.innerHTML;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function showReactors(emoji: string, names: string[], ids: number[], currentUserId: number | undefined, onUnreact?: () => Promise<void>) {
  const rows = names.map((name, index) => {
    const isMine = onUnreact && currentUserId != null && ids[index] === currentUserId;
    return `<li class="etm-reactor-row"><span>${escapeHtml(name)}${isMine ? " (you)" : ""}</span>${isMine ? `<button type="button" class="etm-reactor-remove" data-emoji-remove aria-label="Remove your reaction">✕</button>` : ""}</li>`;
  });
  const listHtml = rows.length
    ? `<ul class="etm-reactor-list">${rows.join("")}</ul>`
    : "<p>No one has reacted yet.</p>";
  void Swal.fire({
    title: `${emoji} Reactions`,
    html: listHtml,
    confirmButtonText: "Close",
    didOpen: popup => {
      const removeButton = popup.querySelector<HTMLButtonElement>("[data-emoji-remove]");
      removeButton?.addEventListener("click", () => {
        void onUnreact?.().then(() => Swal.close());
      });
    },
  });
}

async function confirmDanger(what: string): Promise<boolean> {
  const result = await Swal.fire({
    title: `Delete this ${what}?`,
    text: "This can't be undone.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Delete",
    confirmButtonColor: "#c85f5a",
    cancelButtonText: "Cancel",
    customClass: { popup: "etm-danger-dialog" },
  });
  return result.isConfirmed;
}

interface RemarkChipProps {
  remark: Remark;
  members: Member[];
  onEdit: (message: string, status?: TaskStatus) => Promise<void>;
  onDelete: () => Promise<void>;
  canUpload?: boolean;
  onAddAttachment?: (file: File) => Promise<void>;
  onDeleteAttachment?: (attachmentId: number) => Promise<void>;
  showStatusField?: boolean;
  currentStatus?: TaskStatus;
  canChangeStatus?: boolean;
  subtasks?: SubTask[];
  onOpenSubtask?: (subtaskId: number) => void;
  onReact?: (emoji: string) => Promise<void>;
  onReply?: (message: string) => Promise<void>;
  onEditById?: (remarkId: number, message: string) => Promise<void>;
  onDeleteById?: (remarkId: number) => Promise<void>;
  onReactById?: (remarkId: number, emoji: string) => Promise<void>;
  allowReply?: boolean;
}

function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div className="etm-reaction-picker" ref={ref}>
      <button type="button" className="etm-inline-link-button" aria-label="Add reaction" aria-expanded={open} onClick={() => setOpen(value => !value)}><SmilePlus size={12} /></button>
      {open && (
        <div className="etm-reaction-picker-menu" role="menu">
          {REACTION_EMOJI.map(emoji => (
            <button type="button" key={emoji} role="menuitem" onClick={() => { onPick(emoji); setOpen(false); }}>{emoji}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function RemarkChip({ remark, members, onEdit, onDelete, canUpload, onAddAttachment, onDeleteAttachment, showStatusField, currentStatus, canChangeStatus, subtasks, onOpenSubtask, onReact, onReply, onEditById, onDeleteById, onReactById, allowReply = true }: RemarkChipProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const taskMentions = [...remark.message.matchAll(/@Task #(\d+)/g)].map(match => Number(match[1]));
  const subtaskTagMatch = remark.message.match(/^@Subtask(?:\s+#(\d+))?\s+"([^"]*)"\s*/);
  const strippedMessage = subtaskTagMatch ? remark.message.slice(subtaskTagMatch[0].length) : remark.message;
  const subtaskTagId = subtaskTagMatch ? Number(subtaskTagMatch[1]) || subtasks?.find(sub => sub.title === subtaskTagMatch[2])?.id : undefined;
  const subtaskTagTitle = subtaskTagMatch?.[2];
  const subtaskMentions = [...strippedMessage.matchAll(/@Subtask #(\d+) "([^"]*)"/g)].map(match => ({ id: Number(match[1]), title: match[2] }));
  const displayMessage = strippedMessage.replace(/@Subtask #\d+ "([^"]*)"/g, "@$1");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayMessage);
  const [editStatus, setEditStatus] = useState<TaskStatus | undefined>(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [replyError, setReplyError] = useState("");

  function startEditing() {
    setDraft(displayMessage);
    setEditStatus(currentStatus);
    setEditing(true);
  }

  async function save() {
    if (saving || !draft.replace(/<[^>]*>/g, "").trim()) return;
    setSaving(true);
    setError("");
    try {
      await onEdit(draft.trim(), showStatusField ? editStatus : undefined);
      setEditing(false);
    } catch (caught) {
      setError(remarkError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!(await confirmDanger("remark"))) return;
    try {
      await onDelete();
    } catch (caught) {
      void Swal.fire({ title: "Couldn't delete remark", text: remarkError(caught), icon: "error" });
    }
  }

  async function handleReact(emoji: string) {
    try {
      await onReact?.(emoji);
    } catch (caught) {
      void Swal.fire({ title: "Couldn't update reaction", text: remarkError(caught), icon: "error" });
    }
  }

  async function submitReply() {
    if (replySaving || !replyDraft.replace(/<[^>]*>/g, "").trim()) return;
    setReplySaving(true);
    setReplyError("");
    try {
      await onReply?.(replyDraft.trim());
      setReplyDraft("");
      setReplying(false);
    } catch (caught) {
      setReplyError(remarkError(caught));
    } finally {
      setReplySaving(false);
    }
  }

  async function handleReplyDelete(replyId: number) {
    if (!(await confirmDanger("reply"))) return;
    try {
      await onDeleteById?.(replyId);
    } catch (caught) {
      void Swal.fire({ title: "Couldn't delete reply", text: remarkError(caught), icon: "error" });
    }
  }

  return (
    <span className="etm-remark-chip">
      <span className="etm-remark-author"><User size={13} />{remark.created_by_name || "Unknown commenter"}</span>
      {editing ? (
        <div className="etm-progress-edit">
          <RichTextRemarkField value={draft} onChange={setDraft} disabled={saving} members={members} subtasks={subtasks} />
          {error && <p className="etm-field-error">{error}</p>}
          <div className="etm-progress-edit-actions">
            {showStatusField && (
              <select value={editStatus} onChange={event => setEditStatus(event.target.value as TaskStatus)} disabled={saving || !canChangeStatus} aria-label="Task status">
                {STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            )}
            <button type="button" className="etm-button ghost small" disabled={saving} onClick={() => { setEditing(false); setDraft(displayMessage); setError(""); }}>Cancel</button>
            <button type="button" className="etm-button primary small" disabled={saving || !draft.replace(/<[^>]*>/g, "").trim()} onClick={() => void save()}>{saving ? <Loader2 size={13} className="etm-form-spinner" /> : <Check size={13} />}Save</button>
          </div>
        </div>
      ) : <>{subtaskTagMatch && (
          subtaskTagId ? <button type="button" className="etm-remark-subtask-tag" onClick={() => onOpenSubtask?.(subtaskTagId)}><CheckCheck size={11} />Subtask: {subtaskTagTitle}</button>
          : <span className="etm-remark-subtask-tag"><CheckCheck size={11} />Subtask: {subtaskTagTitle}</span>
        )}<span className="etm-remark-chip-message" dangerouslySetInnerHTML={{ __html: safeRichText(displayMessage) }} />{(taskMentions.length > 0 || subtaskMentions.length > 0) && <span className="etm-remark-task-links">{taskMentions.map(taskId => <button type="button" key={`task-${taskId}`} onClick={() => navigate(`/etms/tasks/${taskId}`)}>Open Task #{taskId}</button>)}{subtaskMentions.map(mention => <button type="button" key={`subtask-${mention.id}`} onClick={() => onOpenSubtask?.(mention.id)}>Open Subtask: {mention.title}</button>)}</span>}</>}
      {remark.reactions.length > 0 && !editing && (
        <span className="etm-reaction-pills">
          {remark.reactions.map(reaction => (
            <button
              type="button"
              key={reaction.emoji}
              className={`etm-reaction-pill ${reaction.reacted_by_me ? "active" : ""}`}
              onClick={() => showReactors(
                reaction.emoji,
                reaction.reactor_names,
                reaction.reactor_ids,
                user?.id,
                reaction.reacted_by_me && onReact ? () => handleReact(reaction.emoji) : undefined,
              )}
            >
              {reaction.emoji} <span>{reaction.count}</span>
            </button>
          ))}
        </span>
      )}
      <span className="etm-remark-chip-footer">
        <span className="etm-remark-chip-meta">{formatDate(remark.created_at, true)}{remark.created_by_name ? ` · ${remark.created_by_name}` : ""}</span>
        {!editing && (
          <span className="etm-remark-chip-actions">
            {onReact && <ReactionPicker onPick={emoji => void handleReact(emoji)} />}
            {allowReply && onReply && <button type="button" className="etm-inline-link-button" onClick={() => setReplying(value => !value)}><Reply size={10} /> Reply</button>}
            {remark.can_edit && (<>
              <button type="button" className="etm-inline-link-button" onClick={startEditing}><Pencil size={10} /> Edit</button>
              <button type="button" className="etm-inline-link-button danger" onClick={() => void handleDelete()}><Trash2 size={10} /> Delete</button>
            </>)}
          </span>
        )}
      </span>
      {onAddAttachment && onDeleteAttachment && !editing && (
        <span className="etm-remark-chip-attachments">
          <AttachmentsPanel attachments={remark.attachments ?? []} canUpload={!!canUpload} onAdd={onAddAttachment} onDelete={onDeleteAttachment} />
        </span>
      )}
      {allowReply && onReply && onEditById && onDeleteById && (
        <span className="etm-remark-replies">
          {(remark.replies ?? []).length > 0 && (
            <span className="etm-remark-reply-list">
              {remark.replies!.map(reply => (
                <RemarkChip
                  key={reply.id}
                  remark={reply}
                  members={members}
                  onEdit={message => onEditById(reply.id, message)}
                  onDelete={() => handleReplyDelete(reply.id)}
                  onReact={onReactById ? emoji => onReactById(reply.id, emoji) : undefined}
                  subtasks={subtasks}
                  onOpenSubtask={onOpenSubtask}
                  allowReply={false}
                />
              ))}
            </span>
          )}
          {replying && (
            <div className="etm-remark-reply-composer">
              <RichTextRemarkField value={replyDraft} onChange={setReplyDraft} disabled={replySaving} members={members} subtasks={subtasks} />
              {replyError && <p className="etm-field-error">{replyError}</p>}
              <div className="etm-remark-reply-composer-actions">
                <button type="button" className="etm-button ghost small" disabled={replySaving} onClick={() => { setReplying(false); setReplyDraft(""); setReplyError(""); }}>Cancel</button>
                <button type="button" className="etm-button primary small" disabled={replySaving || !replyDraft.replace(/<[^>]*>/g, "").trim()} onClick={() => void submitReply()}>{replySaving ? <Loader2 size={13} className="etm-form-spinner" /> : <Send size={13} />}Reply</button>
              </div>
            </div>
          )}
        </span>
      )}
    </span>
  );
}

interface RemarkListProps {
  remarks: Remark[];
  canComment: boolean;
  members: Member[];
  onAdd: (message: string, status?: TaskStatus, file?: File) => Promise<void>;
  onEdit: (remarkId: number, message: string, status?: TaskStatus) => Promise<void>;
  onDelete: (remarkId: number) => Promise<void>;
  emptyText: string;
  compact?: boolean;
  showStatusField?: boolean;
  currentStatus?: TaskStatus;
  canChangeStatus?: boolean;
  incompleteSubtaskCount?: number;
  onAddAttachment?: (remarkId: number, file: File) => Promise<void>;
  onDeleteAttachment?: (remarkId: number, attachmentId: number) => Promise<void>;
  subtasks?: SubTask[];
  onOpenSubtask?: (subtaskId: number) => void;
  onReact?: (remarkId: number, emoji: string) => Promise<void>;
  onAddReply?: (remarkId: number, message: string) => Promise<void>;
}

function RichTextRemarkField({ value, onChange, disabled, members, subtasks }: { value: string; onChange: (value: string) => void; disabled?: boolean; members: Member[]; subtasks?: SubTask[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { tasks } = useTasks();
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value; }, [value]);
  function format(command: "bold" | "italic" | "underline" | "insertUnorderedList") { ref.current?.focus(); document.execCommand(command); onChange(ref.current?.innerHTML ?? ""); }
  const people = members.filter(member => memberName(member).toLowerCase().replace(/\s/g, "").includes(mentionQuery.toLowerCase().replace(/\s/g, ""))).slice(0, 4);
  const taskMatches = tasks.filter(task => task.title.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 4);
  const subtaskMatches = (subtasks ?? []).filter((subtask): subtask is SubTask & { id: number } => subtask.id != null && subtask.title.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 4);
  function update() {
    const text = ref.current?.innerText ?? "";
    const match = text.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionActive(match !== null);
    setMentionQuery(match ? match[1] : "");
    if (match !== null && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    onChange(ref.current?.innerHTML ?? "");
  }
  function insertAtCaret(text: string) {
    const node = ref.current;
    if (!node) return;
    node.focus();
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range && node.contains(range.startContainer) && range.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = range.startContainer as Text;
      const charsToRemove = Math.min(mentionQuery.length + 1, range.startOffset);
      const insertionStart = range.startOffset - charsToRemove;
      textNode.deleteData(insertionStart, charsToRemove);
      textNode.insertData(insertionStart, text);
      const newRange = document.createRange();
      const caretPos = insertionStart + text.length;
      newRange.setStart(textNode, Math.min(caretPos, textNode.length));
      newRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(newRange);
    } else {
      node.append(document.createTextNode(text));
    }
    onChange(node.innerHTML);
    setMentionActive(false);
    setMentionQuery("");
  }
  function insertMention(label: string) { insertAtCaret(`@${label} `); }
  const showMentionMenu = mentionActive && menuPos && (people.length > 0 || taskMatches.length > 0 || subtaskMatches.length > 0);
  return <div className="etm-rich-text" ref={containerRef}><div className="etm-rich-text-toolbar" aria-label="Text formatting"><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("bold")} aria-label="Bold"><Bold size={14} /></button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("italic")} aria-label="Italic"><Italic size={14} /></button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("underline")} aria-label="Underline"><Underline size={14} /></button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("insertUnorderedList")} aria-label="Bullet list"><List size={14} /></button></div><div ref={ref} className="etm-rich-text-editor" contentEditable={!disabled} role="textbox" aria-multiline="true" aria-label="Add a rich-text remark" data-placeholder="Add a remark…" onInput={update} onBlur={() => setTimeout(() => setMentionActive(false), 150)} />{showMentionMenu && menuPos && createPortal(<div className="etm-rich-mention-menu" style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}>{people.map(member => <button type="button" key={`person-${member.id}`} onMouseDown={event => { event.preventDefault(); insertMention(memberName(member).replace(/\s/g, "")); }}><User size={13} />{memberName(member)}<small>Person</small></button>)}{taskMatches.map(task => <button type="button" key={`task-${task.id}`} onMouseDown={event => { event.preventDefault(); insertMention(`Task #${task.id}`); }}><ClipboardList size={13} />{task.title}<small>Task #{task.id}</small></button>)}{subtaskMatches.map(subtask => <button type="button" key={`subtask-${subtask.id}`} onMouseDown={event => { event.preventDefault(); insertAtCaret(`@Subtask #${subtask.id} "${subtask.title}" `); }}><CheckCheck size={13} />{subtask.title}<small>Subtask</small></button>)}</div>, document.body)}</div>;
}

function RemarkList({ remarks, canComment, members, onAdd, onEdit, onDelete, emptyText, compact, showStatusField, currentStatus, canChangeStatus, incompleteSubtaskCount, onAddAttachment, onDeleteAttachment, subtasks, onOpenSubtask, onReact, onAddReply }: RemarkListProps) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<TaskStatus | undefined>(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sorted = [...remarks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id - a.id);
  const visible = showAll ? sorted : sorted.slice(0, 1);

  function openComposer() {
    setStatus(currentStatus);
    setError("");
    setComposing(true);
  }

  function cancelComposer() {
    setComposing(false);
    setDraft("");
    setPendingFile(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !draft.replace(/<[^>]*>/g, "").trim()) return;
    if (showStatusField && status === "Completed" && status !== currentStatus && (incompleteSubtaskCount ?? 0) > 0) {
      setError(`Complete the ${incompleteSubtaskCount} remaining subtask${incompleteSubtaskCount === 1 ? "" : "s"} before completing this task.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAdd(draft.trim(), showStatusField ? status : undefined, pendingFile ?? undefined);
      setDraft("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setComposing(false);
    } catch (caught) {
      setError(remarkError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`etm-remarks ${compact ? "compact" : ""}`}>
      {sorted.length > 0 ? (
        <>
          <div className="etm-remark-chips">
            {visible.map((remark, index) => (
              <div className="etm-remark-item" key={remark.id}>
                <div className="etm-remark-timeline" aria-hidden="true">
                  <span className="etm-remark-timeline-dot" />
                  {index < visible.length - 1 && <span className="etm-remark-timeline-line" />}
                </div>
                <div className="etm-remark-timeline-content">
                  <time className="etm-remark-timeline-time" dateTime={remark.created_at}>{formatDate(remark.created_at, true)}</time>
                  <RemarkChip
                    remark={remark}
                    members={members}
                    onEdit={(message, editStatus) => onEdit(remark.id, message, editStatus)}
                    onDelete={() => onDelete(remark.id)}
                    canUpload={canComment}
                    onAddAttachment={onAddAttachment ? file => onAddAttachment(remark.id, file) : undefined}
                    onDeleteAttachment={onDeleteAttachment ? attachmentId => onDeleteAttachment(remark.id, attachmentId) : undefined}
                    showStatusField={showStatusField}
                    currentStatus={currentStatus}
                    canChangeStatus={canChangeStatus}
                    subtasks={subtasks}
                    onOpenSubtask={onOpenSubtask}
                    onReact={onReact ? emoji => onReact(remark.id, emoji) : undefined}
                    onReply={onAddReply ? message => onAddReply(remark.id, message) : undefined}
                    onEditById={onEdit}
                    onDeleteById={onDelete}
                    onReactById={onReact}
                  />
                </div>
              </div>
            ))}
          </div>
          {sorted.length > 1 && (
            <button type="button" className="etm-inline-link-button etm-remarks-toggle-all" onClick={() => setShowAll(value => !value)}>
              {showAll ? "Show only the latest remark" : `Show all remarks (${sorted.length})`}
            </button>
          )}
        </>
      ) : <p className="etm-remarks-empty">{emptyText}</p>}
      {canComment && (composing ? (
        <form className="etm-remark-form" onSubmit={submit}>
          <RichTextRemarkField value={draft} onChange={setDraft} disabled={saving} members={members} subtasks={subtasks} />
          {onAddAttachment && (
            <div className="etm-remark-form-attachment">
              <input ref={fileInputRef} type="file" hidden onChange={event => setPendingFile(event.target.files?.[0] ?? null)} disabled={saving} />
              {pendingFile ? (
                <span className="etm-remark-form-pending-file">
                  <Paperclip size={11} />{pendingFile.name}
                  <button type="button" aria-label="Remove selected file" disabled={saving} onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}><X size={11} /></button>
                </span>
              ) : (
                <button type="button" className="etm-inline-link-button" disabled={saving} onClick={() => fileInputRef.current?.click()}><Paperclip size={11} />Attach a file</button>
              )}
            </div>
          )}
          <div className="etm-remark-form-actions">
            {showStatusField && (
              <select value={status} onChange={event => setStatus(event.target.value as TaskStatus)} disabled={saving || !canChangeStatus} aria-label="Task status">
                {STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            )}
            <button type="button" className="etm-button ghost small" disabled={saving} onClick={cancelComposer}>Cancel</button>
            <button type="submit" className="etm-button primary small" disabled={saving || !draft.replace(/<[^>]*>/g, "").trim()}>{saving ? <Loader2 size={15} className="etm-form-spinner" /> : <Send size={15} />}Post remark</button>
          </div>
        </form>
      ) : (
        <button type="button" className="etm-button ghost small etm-remark-add-trigger" onClick={openComposer}><Plus size={14} />Add new remark</button>
      ))}
      {error && <p className="etm-field-error">{error}</p>}
    </div>
  );
}

interface ProgressHistoryItemProps {
  log: ProgressLog;
  onEdit: (message: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function ProgressHistoryItem({ log, onEdit, onDelete }: ProgressHistoryItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(log.message);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (saving || !draft.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onEdit(draft.trim());
      setEditing(false);
    } catch (caught) {
      setError(progressError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!(await confirmDanger("progress update"))) return;
    try {
      await onDelete();
    } catch (caught) {
      void Swal.fire({ title: "Couldn't delete update", text: progressError(caught), icon: "error" });
    }
  }

  return (
    <li>
      <span className={`etm-progress-history-dot ${log.status === "Completed" ? "completed" : ""}`} aria-hidden="true">{log.status === "Completed" ? <Check size={11} /> : <MessageSquare size={10} />}</span>
      <div>
        <div className="etm-progress-history-top"><span className={`etm-badge ${log.status.toLowerCase().replace(/\s+/g, "-")}`}>{log.status}</span><time dateTime={log.created_at}>{formatDate(log.created_at, true)}</time></div>
        {editing ? (
          <div className="etm-progress-edit">
            <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={3} maxLength={5000} disabled={saving} aria-label="Edit progress update" />
            {error && <p className="etm-field-error">{error}</p>}
            <div className="etm-progress-edit-actions">
              <button type="button" className="etm-button ghost small" disabled={saving} onClick={() => { setEditing(false); setDraft(log.message); setError(""); }}>Cancel</button>
              <button type="button" className="etm-button primary small" disabled={saving || !draft.trim()} onClick={() => void save()}>{saving ? <Loader2 size={13} className="etm-form-spinner" /> : <Check size={13} />}Save</button>
            </div>
          </div>
        ) : <p>{log.message}</p>}
        <div className="etm-progress-history-footer">
          {log.created_by_name && <span className="etm-progress-author">{log.created_by_name}</span>}
          {log.can_edit && !editing && <>
            <button type="button" className="etm-inline-link-button" onClick={() => setEditing(true)}><Pencil size={10} /> Edit</button>
            <button type="button" className="etm-inline-link-button danger" onClick={() => void handleDelete()}><Trash2 size={10} /> Delete</button>
          </>}
        </div>
      </div>
    </li>
  );
}

function SubtaskPanel({ task, subtask, members, canComment, onSetCompletion, onAddRemark, onEditRemark, onDeleteRemark, onSetStatus, onReactRemark, onAddReplyRemark, onEditSubtask, onDeleteSubtask, onAddRemarkAttachment, onDeleteRemarkAttachment, defaultOpen = false, jumpToSubtaskId }: {
  task: Task; subtask: SubTask; members: Member[]; canComment: boolean;
  onSetCompletion: (id: number, completed: boolean) => Promise<void>;
  onAddRemark: (id: number, message: string, file?: File) => Promise<void>;
  onEditRemark: (id: number, remarkId: number, message: string) => Promise<void>;
  onDeleteRemark: (id: number, remarkId: number) => Promise<void>;
  onSetStatus: (id: number, message: string, status: TaskStatus) => Promise<void>;
  onReactRemark: (id: number, remarkId: number, emoji: string) => Promise<void>;
  onAddReplyRemark: (id: number, remarkId: number, message: string) => Promise<void>;
  onEditSubtask: (id: number, input: { title?: string; description?: string }) => Promise<void>;
  onDeleteSubtask: (id: number) => Promise<void>;
  onAddRemarkAttachment: (subtaskId: number, remarkId: number, file: File) => Promise<void>;
  onDeleteRemarkAttachment: (subtaskId: number, remarkId: number, attachmentId: number) => Promise<void>;
  defaultOpen?: boolean;
  jumpToSubtaskId?: { id: number; token: number } | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingSubtask, setEditingSubtask] = useState(false);
  const [draftTitle, setDraftTitle] = useState(subtask.title);
  const [draftDescription, setDraftDescription] = useState(subtask.description);
  const [savingSubtask, setSavingSubtask] = useState(false);
  const panelRef = useRef<HTMLLIElement>(null);
  const id = subtask.id;
  const canComplete = subtask.can_complete ?? task.can_edit;
  const commentCount = subtask.remarks?.length ?? 0;
  useEffect(() => {
    if (!jumpToSubtaskId || jumpToSubtaskId.id !== id) return;
    // Reacting to an external "jump to this subtask" signal from a remark tag click, not
    // syncing from props — the effect intentionally opens this panel and scrolls to it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    // Re-run on every click of the same tag, not only when the target subtask changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToSubtaskId?.token]);
  async function complete() {
    if (!id || saving) return;
    setSaving(true); setError("");
    try { await onSetCompletion(id, !subtask.is_completed); } catch (caught) { setError(progressError(caught)); } finally { setSaving(false); }
  }
  async function submitUpdateWithStatus(message: string, newStatus?: TaskStatus, file?: File) {
    if (!id) return;
    await onAddRemark(id, message, file);
    if (newStatus && newStatus !== subtask.status) {
      await onSetStatus(id, message, newStatus);
    }
  }
  async function editUpdateWithStatus(remarkId: number, message: string, newStatus?: TaskStatus) {
    if (!id) return;
    await onEditRemark(id, remarkId, message);
    if (newStatus && newStatus !== subtask.status) {
      await onSetStatus(id, message, newStatus);
    }
  }
  function startEditingSubtask() {
    setDraftTitle(subtask.title);
    setDraftDescription(subtask.description);
    setError("");
    setEditingSubtask(true);
  }
  async function saveSubtaskEdit() {
    if (!id || savingSubtask || !draftTitle.trim()) return;
    setSavingSubtask(true); setError("");
    try {
      await onEditSubtask(id, { title: draftTitle.trim(), description: draftDescription.trim() });
      setEditingSubtask(false);
    } catch (caught) {
      setError(progressError(caught));
    } finally {
      setSavingSubtask(false);
    }
  }
  async function handleDeleteSubtask() {
    if (!id || !(await confirmDanger(`subtask "${subtask.title}"`))) return;
    try {
      await onDeleteSubtask(id);
    } catch (caught) {
      void Swal.fire({ title: "Couldn't delete subtask", text: progressError(caught), icon: "error" });
    }
  }
  return <li ref={panelRef} className={`etm-subtask-panel ${subtask.is_completed ? "completed" : ""}`}>
    <div className="etm-subtask-panel-summary">
      {editingSubtask ? (
        <div className="etm-subtask-edit-inline">
          <input value={draftTitle} onChange={event => setDraftTitle(event.target.value)} maxLength={255} disabled={savingSubtask} aria-label="Subtask title" placeholder="Subtask title" />
          <textarea value={draftDescription} onChange={event => setDraftDescription(event.target.value)} maxLength={2000} rows={2} disabled={savingSubtask} aria-label="Subtask description" placeholder="Description (optional)" />
          {error && <p className="etm-field-error" role="alert">{error}</p>}
          <div className="etm-subtask-edit-actions">
            <button type="button" className="etm-button ghost small" disabled={savingSubtask} onClick={() => { setEditingSubtask(false); setError(""); }}>Cancel</button>
            <button type="button" className="etm-button primary small" disabled={savingSubtask || !draftTitle.trim()} onClick={() => void saveSubtaskEdit()}>{savingSubtask ? <Loader2 size={13} className="etm-form-spinner" /> : <Check size={13} />}Save</button>
          </div>
        </div>
      ) : (<>
        {canComplete ? <button type="button" className={`etm-details-subtask-toggle ${subtask.is_completed ? "checked" : ""}`} aria-label={`${subtask.is_completed ? "Reopen" : "Complete"} subtask: ${subtask.title}`} disabled={saving} onClick={() => void complete()}>{subtask.is_completed ? <Check size={13} /> : <Circle size={16} />}</button> : <span className="etm-details-subtask-check">{subtask.is_completed ? <Check size={13} /> : <Circle size={16} />}</span>}
        <button type="button" className="etm-subtask-panel-open" aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="etm-details-subtask-text"><strong>{subtask.title}</strong>{subtask.description && <small>{subtask.description}</small>}</span><span className={`etm-badge ${subtask.status.toLowerCase().replace(/\s+/g, "-")}`}>{subtask.status}</span><span className="etm-subtask-update-count">{commentCount} {commentCount === 1 ? "update" : "updates"}</span><ChevronRight className={open ? "open" : ""} size={16} /></button>
        {task.can_edit && (
          <span className="etm-subtask-panel-actions">
            <button type="button" className="etm-icon-button" aria-label={`Edit subtask: ${subtask.title}`} onClick={startEditingSubtask}><Pencil size={14} /></button>
            <button type="button" className="etm-icon-button danger" aria-label={`Delete subtask: ${subtask.title}`} onClick={() => void handleDeleteSubtask()}><Trash2 size={14} /></button>
          </span>
        )}
      </>)}
    </div>
    {open && <div className="etm-subtask-panel-body">
      {id && <RemarkList
        remarks={subtask.remarks ?? []}
        canComment={canComment}
        members={members}
        onAdd={submitUpdateWithStatus}
        onEdit={editUpdateWithStatus}
        onDelete={remarkId => onDeleteRemark(id, remarkId)}
        onReact={(remarkId, emoji) => onReactRemark(id, remarkId, emoji)}
        onAddReply={(remarkId, message) => onAddReplyRemark(id, remarkId, message)}
        onAddAttachment={(remarkId, file) => onAddRemarkAttachment(id, remarkId, file)}
        onDeleteAttachment={(remarkId, attachmentId) => onDeleteRemarkAttachment(id, remarkId, attachmentId)}
        subtasks={task.subtasks}
        emptyText="No updates on this subtask yet."
        showStatusField
        currentStatus={subtask.status}
        canChangeStatus={canComplete}
        compact
      />}
      {error && <p className="etm-field-error" role="alert">{error}</p>}
    </div>}
  </li>;
}

function attachmentError(error: unknown): string {
  if (isAxiosError(error)) {
    const fileErrors = error.response?.data?.file;
    if (typeof fileErrors === "string") return fileErrors;
    if (Array.isArray(fileErrors) && typeof fileErrors[0] === "string") return fileErrors[0];
    if (typeof error.response?.data?.detail === "string") return error.response.data.detail;
    if (!error.response) return "We couldn’t reach the server. Check your connection and try again.";
  }
  return "The file couldn’t be uploaded. Please try again.";
}

interface AttachmentsPanelProps {
  attachments: Attachment[];
  canUpload: boolean;
  onAdd: (file: File) => Promise<void>;
  onDelete: (attachmentId: number) => Promise<void>;
}

function AttachmentsPanel({ attachments, canUpload, onAdd, onDelete }: AttachmentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const sorted = [...attachments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id - a.id);

  if (sorted.length === 0 && !canUpload) return null;

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await onAdd(file);
    } catch (caught) {
      setError(attachmentError(caught));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(attachmentId: number, filename: string) {
    if (!(await confirmDanger(`attachment "${filename}"`))) return;
    try {
      await onDelete(attachmentId);
    } catch (caught) {
      void Swal.fire({ title: "Couldn't delete attachment", text: attachmentError(caught), icon: "error" });
    }
  }

  return (
    <div className="etm-attachments">
      {sorted.length > 0 && (
        <ul className="etm-attachment-list">
          {sorted.map(attachment => (
            <li key={attachment.id}>
              <Paperclip size={14} />
              <div className="etm-attachment-info">
                <span className="etm-attachment-name">{attachment.original_filename}</span>
                <small>{formatFileSize(attachment.size)} · {attachment.uploaded_by_name ?? "Unknown"} · {formatDate(attachment.created_at, true)}</small>
              </div>
              <div className="etm-attachment-actions">
                {attachment.url && <a href={attachment.url} target="_blank" rel="noreferrer" className="etm-icon-button" aria-label={`Download ${attachment.original_filename}`}><Download size={14} /></a>}
                {attachment.can_delete && <button type="button" className="etm-icon-button danger" aria-label={`Delete ${attachment.original_filename}`} onClick={() => void handleDelete(attachment.id, attachment.original_filename)}><Trash2 size={14} /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="etm-attachment-upload">
          <input ref={inputRef} type="file" hidden onChange={event => void handleFiles(event.target.files)} disabled={uploading} />
          <button type="button" className="etm-inline-link-button" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <Loader2 size={11} className="etm-form-spinner" /> : <Paperclip size={11} />}{uploading ? "Uploading…" : "Attach a file"}</button>
        </div>
      )}
      {error && <p className="etm-field-error" role="alert">{error}</p>}
    </div>
  );
}

function TaskDetailsContent({ task, onClose, onEdit, onProgress, onEditProgress, onDeleteProgress, onAddRemark, onEditRemark, onDeleteRemark, onReactRemark, onAddRemarkReply, onAddSubtaskRemark, onEditSubtaskRemark, onDeleteSubtaskRemark, onReactSubtaskRemark, onAddSubtaskRemarkReply, onSetSubtaskStatus, onAddSubtask, onEditSubtask, onDeleteSubtask, onSetSubtaskCompletion, onAddRemarkAttachment, onDeleteRemarkAttachment, onAddSubtaskRemarkAttachment, onDeleteSubtaskRemarkAttachment, onMarkCompletionSeen, onMarkViewed, initialSubtaskId, page = false }: Omit<TaskDetailsProps, "open">) {
  const fieldId = useId();
  const [taskInfoOpen, setTaskInfoOpen] = useState(false);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [messageError, setMessageError] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState("");
  const [jumpToSubtaskId, setJumpToSubtaskId] = useState<{ id: number; token: number } | null>(null);
  const percent = completionPercent(task);
  const incompleteSubtasks = task.subtasks.filter(subtask => !subtask.is_completed);
  const logs = [...task.progress_logs].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime() || right.id - left.id);
  const activityLogs = [...task.activity_logs].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime() || right.id - left.id);
  const canComment = task.can_edit || task.my_role === "Commentor";
  const canAddSubtasks = task.can_edit;

  function openSubtask(subtaskId: number) {
    setJumpToSubtaskId({ id: subtaskId, token: Date.now() });
  }

  async function addSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newSubtaskTitle.trim() || addingSubtask) return;
    setAddingSubtask(true); setSubtaskError("");
    try { await onAddSubtask(newSubtaskTitle.trim()); setNewSubtaskTitle(""); }
    catch (caught) { setSubtaskError(progressError(caught)); }
    finally { setAddingSubtask(false); }
  }

  async function submitRemarkWithStatus(remarkMessage: string, newStatus?: TaskStatus, file?: File) {
    await onAddRemark(remarkMessage, file);
    if (newStatus && newStatus !== task.status) {
      await onProgress(remarkMessage, newStatus);
    }
  }

  async function editRemarkWithStatus(remarkId: number, remarkMessage: string, newStatus?: TaskStatus) {
    await onEditRemark(remarkId, remarkMessage);
    if (newStatus && newStatus !== task.status) {
      await onProgress(remarkMessage, newStatus);
    }
  }

  useEffect(() => {
    if (task.is_creator && task.status === "Completed" && !task.completion_seen) {
      void onMarkCompletionSeen();
    }
    // Only re-check when the task identity or its completion-seen state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.status, task.completion_seen, task.is_creator]);

  useEffect(() => {
    if (!task.is_creator) {
      void onMarkViewed();
    }
    // Only re-fire when the task identity changes, i.e. once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function handleProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!message.trim()) {
      setMessageError("Write a short update before saving.");
      document.getElementById(`${fieldId}-message`)?.focus();
      return;
    }
    if (status === "Completed" && incompleteSubtasks.length > 0) {
      setError(`Complete the ${incompleteSubtasks.length} remaining subtask${incompleteSubtasks.length === 1 ? "" : "s"} before completing this task.`);
      return;
    }
    setError("");
    setSuccess("");
    setMessageError("");
    setSaving(true);
    try {
      await onProgress(message.trim(), status);
      setMessage("");
      setSuccess("Progress update added.");
    } catch (caught) {
      setError(progressError(caught));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="etm-details-header">
      <div className="etm-details-eyebrow"><span>MAJOR TASK</span><span>#{String(task.id).padStart(3, "0")}</span></div>
      {page ? <h1 className={`etm-details-title ${task.is_completed ? "completed" : ""}`}>{task.title}</h1> : <Dialog.Title className={`etm-details-title ${task.is_completed ? "completed" : ""}`}>{task.title}</Dialog.Title>}
      {page ? <p className="etm-details-description">{task.details || "No description provided."}</p> : <Dialog.Description className="etm-details-description">{task.details || "No description provided."}</Dialog.Description>}
      <div className="etm-details-badges"><span className={`etm-badge ${task.status.toLowerCase().replace(/\s+/g, "-")}`}><span className="etm-details-status-dot" />{task.status}</span><span className={`etm-details-priority ${task.priority.toLowerCase()}`}><Flag size={13} />{task.priority} priority</span></div>
      {!page && <button type="button" className="etm-icon-button etm-details-close" onClick={onClose} aria-label="Close task details"><X size={21} /></button>}
    </div>
    <div className="etm-details-body">
      <section className="etm-details-section etm-task-info">
        <button type="button" className="etm-task-info-toggle" aria-expanded={taskInfoOpen} aria-controls={`${fieldId}-task-info`} onClick={() => setTaskInfoOpen(value => !value)}>
          <span>Task Info</span>
          <ChevronRight className={taskInfoOpen ? "open" : ""} size={15} />
        </button>
        {taskInfoOpen && (
          <dl className="etm-details-metadata" id={`${fieldId}-task-info`}>
            <div><dt><Folder size={15} />Project</dt><dd>{task.project ? task.project.name : <span className="etm-details-personal-tag"><User size={12} />Personal task</span>}</dd></div>
            <div><dt><CalendarDays size={15} />Deadline</dt><dd className={isOverdue(task) ? "etm-details-overdue" : ""}>{formatDate(task.deadline)}{isOverdue(task) && <span>Overdue</span>}</dd></div>
            <div><dt><CalendarDays size={15} />Created</dt><dd>{formatDate(task.created_at, true)}</dd></div>
            <div><dt><Clock3 size={15} />Last progress update</dt><dd>{task.latest_progress_at ? formatDate(task.latest_progress_at, true) : "No updates yet"}</dd></div>
            <div><dt><Users size={15} />Requestor</dt><dd>{task.requestor || "Not specified"}</dd></div>
            <div><dt><Users size={15} />Assigned persons</dt><dd>{task.assignments.length ? <div className="etm-details-people">{task.assignments.map(person => <span className="etm-details-person" key={person.id}><span aria-hidden="true">{person.first_name?.charAt(0)}{person.last_name?.charAt(0)}</span>{memberName(person)}<span className="etm-details-person-role">{person.role}</span></span>)}</div> : <span className="etm-details-unassigned">Unassigned</span>}</dd></div>
          </dl>
        )}
      </section>

      <section className="etm-details-section">
        <div className="etm-details-section-title"><h3><CheckCheck size={17} />Subtasks <span className="etm-form-count">{task.subtasks.length}</span></h3><div className="etm-subtask-section-actions">{task.subtasks.length > 0 && <span>{task.subtasks.filter(subtask => subtask.is_completed).length} of {task.subtasks.length} complete</span>}{canAddSubtasks && <button type="button" className="etm-inline-link-button" onClick={() => document.getElementById(`${fieldId}-new-subtask`)?.focus()}><Plus size={14} />Add subtask</button>}</div></div>
        {task.is_completed && incompleteSubtasks.length > 0 && <div className="etm-subtask-completion-warning" role="alert"><AlertTriangle size={17} /><span><strong>{incompleteSubtasks.length} subtask{incompleteSubtasks.length === 1 ? "" : "s"} still incomplete.</strong> Reopen this task, finish the remaining subtasks, then complete it again.</span></div>}
        {task.subtasks.length > 0 ? <>
          <div className="etm-details-progress-track" role="progressbar" aria-label="Task completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>
          <ul className="etm-details-subtasks">{task.subtasks.map((subtask, index) => <SubtaskPanel key={subtask.id ?? index} task={task} subtask={subtask} members={task.assignments} canComment={canComment} onSetCompletion={onSetSubtaskCompletion} onAddRemark={onAddSubtaskRemark} onEditRemark={onEditSubtaskRemark} onDeleteRemark={onDeleteSubtaskRemark} onReactRemark={onReactSubtaskRemark} onAddReplyRemark={onAddSubtaskRemarkReply} onSetStatus={onSetSubtaskStatus} onEditSubtask={onEditSubtask} onDeleteSubtask={onDeleteSubtask} onAddRemarkAttachment={onAddSubtaskRemarkAttachment} onDeleteRemarkAttachment={onDeleteSubtaskRemarkAttachment} defaultOpen={subtask.id === initialSubtaskId} jumpToSubtaskId={jumpToSubtaskId} />)}</ul>
        </> : <p className="etm-details-text empty">This task has no subtasks.</p>}
        {canAddSubtasks && <form className="etm-add-subtask-later" onSubmit={addSubtask}><input id={`${fieldId}-new-subtask`} value={newSubtaskTitle} onChange={event => { setNewSubtaskTitle(event.target.value); setSubtaskError(""); }} placeholder="Add a subtask to this task" maxLength={255} disabled={addingSubtask} /><button type="submit" className="etm-button primary small" disabled={addingSubtask || !newSubtaskTitle.trim()}>{addingSubtask ? <Loader2 size={14} className="etm-form-spinner" /> : <Plus size={14} />}Add</button>{subtaskError && <p className="etm-field-error" role="alert">{subtaskError}</p>}</form>}
      </section>

      <section className="etm-details-section etm-details-section-highlight">
        <div className="etm-details-section-title"><h3><MessageSquare size={17} />Remarks <span className="etm-form-count">{task.remarks.length}</span></h3></div>
        <p className="etm-details-section-caption">The latest remark reflects this task's current progress.</p>
        <RemarkList
          remarks={task.remarks}
          canComment={canComment}
          members={task.assignments}
          onAdd={submitRemarkWithStatus}
          onEdit={editRemarkWithStatus}
          onDelete={onDeleteRemark}
          onReact={onReactRemark}
          onAddReply={onAddRemarkReply}
          emptyText="No remarks yet."
          showStatusField
          currentStatus={task.status}
          canChangeStatus={task.can_edit}
          incompleteSubtaskCount={incompleteSubtasks.length}
          onAddAttachment={onAddRemarkAttachment}
          onDeleteAttachment={onDeleteRemarkAttachment}
          subtasks={task.subtasks}
          onOpenSubtask={openSubtask}
        />
      </section>

      {SHOW_PROGRESS_HISTORY && <section className="etm-details-section">
        <div className="etm-details-section-title"><h3><Clock3 size={17} />Progress history</h3><span>{logs.length} {logs.length === 1 ? "update" : "updates"}</span></div>
        {logs.length ? <ol className="etm-progress-history">{logs.map(log => <ProgressHistoryItem key={log.id} log={log} onEdit={editMessage => onEditProgress(log.id, editMessage)} onDelete={() => onDeleteProgress(log.id)} />)}</ol> : <div className="etm-progress-history-empty"><MessageSquare size={21} /><p>No progress updates yet.<span>Add an update below to keep everyone in the loop.</span></p></div>}
      </section>}

      {SHOW_PROGRESS_HISTORY && (canComment ? <form className="etm-details-progress-form" onSubmit={handleProgress} noValidate aria-busy={saving}>
        <h3>Add a progress update</h3>
        <div className="etm-field">
          <label htmlFor={`${fieldId}-message`}>Update</label>
          <MentionField id={`${fieldId}-message`} multiline rows={3} maxLength={5000} members={task.assignments} value={message} onChange={value => { setMessage(value); setMessageError(""); setSuccess(""); }} placeholder="Share what’s moving forward… (@ to mention)" disabled={saving} aria-invalid={!!messageError} aria-describedby={messageError ? `${fieldId}-message-error` : `${fieldId}-timestamp-hint`} />
          {messageError && <p className="etm-field-error" id={`${fieldId}-message-error`}>{messageError}</p>}
        </div>
        <p className="etm-form-helper" id={`${fieldId}-timestamp-hint`}><Clock3 size={12} />Date and time are captured automatically.</p>
        {status === "Completed" && incompleteSubtasks.length > 0 && <div className="etm-subtask-completion-warning" role="alert"><AlertTriangle size={17} /><span><strong>{incompleteSubtasks.length} subtask{incompleteSubtasks.length === 1 ? "" : "s"} still incomplete.</strong> Complete every subtask before completing this task.</span></div>}
        <div className="etm-details-progress-actions"><div className="etm-field"><label htmlFor={`${fieldId}-status`}>Task status</label><select id={`${fieldId}-status`} value={status} onChange={event => setStatus(event.target.value as TaskStatus)} disabled={saving || !task.can_edit}>{STATUSES.map(item => <option key={item} value={item}>{item}</option>)}</select></div><button type="submit" className="etm-button primary small" disabled={saving}>{saving ? <Loader2 size={15} className="etm-form-spinner" /> : <Send size={15} />}{saving ? "Saving…" : "Add update"}</button></div>
        {error && <p className="etm-form-error-banner" role="alert">{error}</p>}
        {success && <p className="etm-form-success" role="status"><Check size={15} />{success}</p>}
      </form> : <p className="etm-details-text empty etm-details-viewonly">You have view-only access to this task.</p>)}

      <section className="etm-details-section etm-task-info">
        <button type="button" className="etm-task-info-toggle" aria-expanded={activityLogOpen} aria-controls={`${fieldId}-activity-log`} onClick={() => setActivityLogOpen(value => !value)}>
          <span className="etm-task-info-toggle-label"><History size={17} />Activity log <span className="etm-form-count">{activityLogs.length}</span></span>
          <ChevronRight className={activityLogOpen ? "open" : ""} size={15} />
        </button>
        {activityLogOpen && (
          activityLogs.length ? <ul className="etm-activity-log" id={`${fieldId}-activity-log`}>{activityLogs.map(entry => <li key={entry.id}>
            <div className="etm-activity-log-entry">
              {entry.actor_name && <span className="etm-activity-log-chip">{entry.actor_name}</span>}
              <span className="etm-activity-log-message">{entry.message}</span>
            </div>
            <time className="etm-activity-log-time" dateTime={entry.created_at}>{formatDate(entry.created_at, true)}</time>
          </li>)}</ul> : <p className="etm-details-text empty" id={`${fieldId}-activity-log`}>No changes recorded yet.</p>
        )}
      </section>
    </div>
    {!page && <div className="etm-details-footer"><button type="button" className="etm-button ghost" onClick={onClose}>Close</button>{task.can_edit && <button type="button" className="etm-button primary" onClick={onEdit} disabled={saving}><Edit3 size={16} />Edit task</button>}</div>}
  </>;
}

export default function TaskDetails({ task, open, onClose, onEdit, onProgress, onEditProgress, onDeleteProgress, onAddRemark, onEditRemark, onDeleteRemark, onReactRemark, onAddRemarkReply, onAddSubtaskRemark, onEditSubtaskRemark, onDeleteSubtaskRemark, onReactSubtaskRemark, onAddSubtaskRemarkReply, onSetSubtaskStatus, onAddSubtask, onEditSubtask, onDeleteSubtask, onSetSubtaskCompletion, onAddRemarkAttachment, onDeleteRemarkAttachment, onAddSubtaskRemarkAttachment, onDeleteSubtaskRemarkAttachment, onMarkCompletionSeen, onMarkViewed, initialSubtaskId, page = false }: TaskDetailsProps) {
  if (page) return <div className="etm-task-details-page"><TaskDetailsContent task={task} onClose={onClose} onEdit={onEdit} onProgress={onProgress} onEditProgress={onEditProgress} onDeleteProgress={onDeleteProgress} onAddRemark={onAddRemark} onEditRemark={onEditRemark} onDeleteRemark={onDeleteRemark} onReactRemark={onReactRemark} onAddRemarkReply={onAddRemarkReply} onAddSubtaskRemark={onAddSubtaskRemark} onEditSubtaskRemark={onEditSubtaskRemark} onDeleteSubtaskRemark={onDeleteSubtaskRemark} onReactSubtaskRemark={onReactSubtaskRemark} onAddSubtaskRemarkReply={onAddSubtaskRemarkReply} onSetSubtaskStatus={onSetSubtaskStatus} onAddSubtask={onAddSubtask} onEditSubtask={onEditSubtask} onDeleteSubtask={onDeleteSubtask} onSetSubtaskCompletion={onSetSubtaskCompletion} onAddRemarkAttachment={onAddRemarkAttachment} onDeleteRemarkAttachment={onDeleteRemarkAttachment} onAddSubtaskRemarkAttachment={onAddSubtaskRemarkAttachment} onDeleteSubtaskRemarkAttachment={onDeleteSubtaskRemarkAttachment} onMarkCompletionSeen={onMarkCompletionSeen} onMarkViewed={onMarkViewed} initialSubtaskId={initialSubtaskId} page /></div>;
  function ignoreWhileSwalOpen(event: { preventDefault: () => void }) {
    // A SweetAlert popup renders outside this Dialog.Content in the DOM, so Radix sees
    // clicks/Escape on it as "outside" and would otherwise close this dialog underneath it.
    if (document.querySelector(".swal2-container")) event.preventDefault();
  }

  return <Dialog.Root open={open} onOpenChange={nextOpen => { if (!nextOpen) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="etm-dialog-overlay" /><Dialog.Content
      className="etm-dialog etm-task-details"
      onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLElement>(`[data-task-view="${task.id}"]`)?.focus(); }}
      onPointerDownOutside={ignoreWhileSwalOpen}
      onInteractOutside={ignoreWhileSwalOpen}
      onEscapeKeyDown={ignoreWhileSwalOpen}
    ><TaskDetailsContent key={`${task.id}-${initialSubtaskId ?? "task"}`} task={task} onClose={onClose} onEdit={onEdit} onProgress={onProgress} onEditProgress={onEditProgress} onDeleteProgress={onDeleteProgress} onAddRemark={onAddRemark} onEditRemark={onEditRemark} onDeleteRemark={onDeleteRemark} onReactRemark={onReactRemark} onAddRemarkReply={onAddRemarkReply} onAddSubtaskRemark={onAddSubtaskRemark} onEditSubtaskRemark={onEditSubtaskRemark} onDeleteSubtaskRemark={onDeleteSubtaskRemark} onReactSubtaskRemark={onReactSubtaskRemark} onAddSubtaskRemarkReply={onAddSubtaskRemarkReply} onSetSubtaskStatus={onSetSubtaskStatus} onAddSubtask={onAddSubtask} onEditSubtask={onEditSubtask} onDeleteSubtask={onDeleteSubtask} onSetSubtaskCompletion={onSetSubtaskCompletion} onAddRemarkAttachment={onAddRemarkAttachment} onDeleteRemarkAttachment={onDeleteRemarkAttachment} onAddSubtaskRemarkAttachment={onAddSubtaskRemarkAttachment} onDeleteSubtaskRemarkAttachment={onDeleteSubtaskRemarkAttachment} onMarkCompletionSeen={onMarkCompletionSeen} onMarkViewed={onMarkViewed} initialSubtaskId={initialSubtaskId} /></Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
