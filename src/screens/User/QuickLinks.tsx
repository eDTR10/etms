import { useState, type FormEvent } from "react";
import { BookOpen, Calendar, Cloud, ExternalLink, FileText, Folder, Github, Globe, Link2, Mail, MapPin, MessageSquare, Pencil, Plus, ShoppingCart, Trash2, Video, Youtube, type LucideIcon } from "lucide-react";
import Swal from "sweetalert2";
import UserLayout from "./UserLayout";
import Modal from "../../components/ui/modal";
import QuickLinksProvider, { useQuickLinks } from "../../features/quicklinks/QuickLinksProvider";
import { taskError } from "../../features/tasks/taskService";
import type { QuickLink, QuickLinkInput } from "../../features/quicklinks/types";
import "../../features/tasks/etm-base.css";
import "../Etm/etm-app.css";

const ICON_OPTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "link", label: "Link", Icon: Link2 },
  { key: "globe", label: "Website", Icon: Globe },
  { key: "file-text", label: "Document", Icon: FileText },
  { key: "folder", label: "Folder", Icon: Folder },
  { key: "mail", label: "Mail", Icon: Mail },
  { key: "calendar", label: "Calendar", Icon: Calendar },
  { key: "video", label: "Video", Icon: Video },
  { key: "message-square", label: "Chat", Icon: MessageSquare },
  { key: "book-open", label: "Docs", Icon: BookOpen },
  { key: "github", label: "GitHub", Icon: Github },
  { key: "youtube", label: "YouTube", Icon: Youtube },
  { key: "cloud", label: "Cloud", Icon: Cloud },
  { key: "shopping-cart", label: "Shopping", Icon: ShoppingCart },
  { key: "map-pin", label: "Map", Icon: MapPin },
];
const DEFAULT_ICON = "link";

function iconFor(key: string): LucideIcon {
  return ICON_OPTIONS.find(option => option.key === key)?.Icon ?? Link2;
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function emptyForm(): QuickLinkInput {
  return { title: "", description: "", url: "", icon: DEFAULT_ICON };
}

function QuickLinkFormDialog({ link, open, onClose, onSave }: { link?: QuickLink; open: boolean; onClose: () => void; onSave: (input: QuickLinkInput) => Promise<void> }) {
  const [form, setForm] = useState<QuickLinkInput>(() => link ? { title: link.title, description: link.description, url: link.url, icon: link.icon || DEFAULT_ICON } : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!form.title.trim() || !form.url.trim()) {
      setError("Title and URL are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, title: form.title.trim(), description: form.description.trim(), url: normalizeUrl(form.url) });
      setForm(emptyForm());
    } catch (caught) {
      setError(taskError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={link ? "Edit quick link" : "New quick link"}>
      <form className="etm-report-form" onSubmit={handleSubmit}>
        {error && <p className="etm-report-error">{error}</p>}
        <label>Title<input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="e.g. Team Drive" maxLength={255} required disabled={saving} /></label>
        <label>URL<input value={form.url} onChange={event => setForm(current => ({ ...current, url: event.target.value }))} placeholder="https://…" maxLength={1000} required disabled={saving} /></label>
        <label>Description <span className="etm-form-optional">(optional)</span><textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="What's this link for?" rows={2} maxLength={500} disabled={saving} /></label>
        <fieldset className="etm-quicklink-icon-field">
          <legend>Icon</legend>
          <div className="etm-quicklink-icon-options">
            {ICON_OPTIONS.map(({ key, label, Icon }) => (
              <button type="button" key={key} className={`etm-quicklink-icon-option ${form.icon === key ? "selected" : ""}`} aria-pressed={form.icon === key} aria-label={label} title={label} disabled={saving} onClick={() => setForm(current => ({ ...current, icon: key }))}>
                <Icon size={17} />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="etm-report-form-actions">
          <button type="button" className="etm-button ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="etm-button" disabled={saving}>{saving ? "Saving…" : link ? "Save changes" : "Add link"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function QuickLinksContent() {
  const { links, loading, error, createLink, updateLink, deleteLink } = useQuickLinks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<QuickLink | undefined>(undefined);

  const openCreate = () => { setEditingLink(undefined); setDialogOpen(true); };
  const openEdit = (link: QuickLink) => { setEditingLink(link); setDialogOpen(true); };
  const closeDialog = () => setDialogOpen(false);

  const confirmDelete = async (link: QuickLink) => {
    const result = await Swal.fire({
      title: "Delete this quick link?",
      text: `"${link.title}" will be permanently removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#c85f5a",
      cancelButtonText: "Cancel",
      customClass: { popup: "etm-danger-dialog" },
    });
    if (!result.isConfirmed) return;
    try {
      await deleteLink(link.id);
    } catch (err) {
      void Swal.fire({ title: "Couldn't delete link", text: taskError(err), icon: "error" });
    }
  };

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><Link2 size={15} /> Your bookmarks</p>
          <h2>Quick Links</h2>
          <p>Shortcuts to the sites and tools you use most — each opens in a new tab.</p>
        </div>
        <button type="button" className="etm-button" onClick={openCreate}><Plus size={16} /> New Quick Link</button>
      </section>

      {error && <p className="etm-report-error">{error}</p>}
      {!loading && !error && (
        links.length ? (
          <div className="etm-quicklinks-grid">
            {links.map(link => {
              const Icon = iconFor(link.icon);
              return (
                <div className="etm-panel etm-quicklink-card" key={link.id}>
                  <a className="etm-quicklink-card-open" href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${link.title} in a new tab`}>
                    <span className="etm-quicklink-card-icon"><Icon size={19} /></span>
                    <span className="etm-quicklink-card-body">
                      <strong>{link.title}</strong>
                      {link.description && <small>{link.description}</small>}
                      <span className="etm-quicklink-card-url"><ExternalLink size={11} />{link.url.replace(/^https?:\/\//, "")}</span>
                    </span>
                  </a>
                  <div className="etm-quicklink-card-actions">
                    {link.can_manage && <>
                    <button type="button" className="etm-icon-button" aria-label={`Edit ${link.title}`} onClick={() => openEdit(link)}><Pencil size={15} /></button>
                    <button type="button" className="etm-icon-button danger" aria-label={`Delete ${link.title}`} onClick={() => void confirmDelete(link)}><Trash2 size={15} /></button>
                    </>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="etm-empty-row">No quick links yet. Add one to jump straight to the sites and tools you use most.</p>
      )}

      <QuickLinkFormDialog
        link={editingLink}
        open={dialogOpen}
        onClose={closeDialog}
        onSave={async input => {
          if (editingLink) await updateLink(editingLink.id, input);
          else await createLink(input);
          closeDialog();
        }}
      />
    </div>
  );
}

export default function QuickLinks() {
  return (
    <UserLayout title="Quick Links" subtitle="Shortcuts to the sites and tools you use most.">
      <QuickLinksProvider>
        <QuickLinksContent />
      </QuickLinksProvider>
    </UserLayout>
  );
}
