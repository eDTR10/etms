import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import Modal from "../../components/ui/modal";
import { useAuth } from "../Auth/AuthContext";
import { taskService } from "../../features/tasks/taskService";
import { SortTh, useTableSort } from "../../features/tasks/useTableSort";
import { roleLabel, USER_ROLES, userError, userService, type ManagedUser, type ManagedUserInput } from "../../features/users/userService";
import type { Project } from "../../features/tasks/types";
import "../../features/tasks/etm-base.css";
import "../../features/tasks/forms.css";
import "../Etm/etm-app.css";

const fieldClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-[#0d8a92] disabled:opacity-60";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted-foreground";

interface FormState {
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  office: string;
  projects: number[];
  acc_lvl: string;
  role: string;
  is_active: boolean;
  password: string;
}

const EMPTY_FORM: FormState = { email: "", first_name: "", last_name: "", position: "", office: "", projects: [], acc_lvl: "3", role: "user", is_active: true, password: "" };

function toForm(user: ManagedUser): FormState {
  return {
    email: user.email, first_name: user.first_name, last_name: user.last_name, position: user.position ?? "",
    office: user.office ? String(user.office) : "", projects: user.projects ?? [], acc_lvl: String(user.acc_lvl ?? 3), role: user.role, is_active: user.is_active, password: "",
  };
}

function UserFormModal({ user, offices, isSelf, onClose, onSaved }: { user: ManagedUser | "new"; offices: Project[]; isSelf: boolean; onClose: () => void; onSaved: (saved: ManagedUser, created: boolean) => void }) {
  const creating = user === "new";
  const [form, setForm] = useState<FormState>(() => creating ? EMPTY_FORM : toForm(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));
  const [projectSearch, setProjectSearch] = useState("");
  const toggleProject = (id: number) => setForm(current => ({ ...current, projects: current.projects.includes(id) ? current.projects.filter(item => item !== id) : [...current.projects, id] }));
  const visibleProjects = offices.filter(office => office.name.toLowerCase().includes(projectSearch.trim().toLowerCase()));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!form.email.trim() || !form.first_name.trim() || !form.last_name.trim()) { setError("Email, first name and last name are required."); return; }
    if (creating && !form.password) { setError("Set a password for the new user."); return; }
    setSaving(true);
    setError("");
    const input: ManagedUserInput = {
      email: form.email.trim(), first_name: form.first_name.trim(), last_name: form.last_name.trim(), position: form.position.trim(),
      office: form.office ? Number(form.office) : null, projects: form.projects, acc_lvl: Number(form.acc_lvl) || 3, role: form.role, is_active: form.is_active,
    };
    if (form.password) input.password = form.password;
    try {
      const saved = creating ? await userService.create(input) : await userService.update(user.id, input);
      onSaved(saved, creating);
    } catch (caught) {
      setError(userError(caught));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={saving ? () => {} : onClose} title={creating ? "New user" : "Edit user"} widthClass="max-w-xl">
      <form className="flex flex-col gap-4" onSubmit={event => void submit(event)}>
        <div className="grid grid-cols-2 sm:grid-cols-1 gap-3">
          <label className={labelClass}>First name *<input className={fieldClass} value={form.first_name} onChange={event => set("first_name", event.target.value)} disabled={saving} autoFocus /></label>
          <label className={labelClass}>Last name *<input className={fieldClass} value={form.last_name} onChange={event => set("last_name", event.target.value)} disabled={saving} /></label>
        </div>
        <label className={labelClass}>Email *<input type="email" className={fieldClass} value={form.email} onChange={event => set("email", event.target.value)} disabled={saving} /></label>
        <label className={labelClass}>Position<input className={fieldClass} value={form.position} onChange={event => set("position", event.target.value)} disabled={saving} /></label>
        <div className="grid grid-cols-2 sm:grid-cols-1 gap-3">
          <label className={labelClass}>Office
            <select className={fieldClass} value={form.office} onChange={event => set("office", event.target.value)} disabled={saving}>
              <option value="">No office</option>
              {offices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}
            </select>
          </label>
          <label className={labelClass}>Role
            <select className={fieldClass} value={form.role} onChange={event => set("role", event.target.value)} disabled={saving || (isSelf && user !== "new" && user.role === "admin")}>
              {USER_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </label>
        </div>
        <div className={labelClass}>
          <span>Projects <span className="text-xs font-normal text-muted-foreground">— {form.projects.length} selected</span></span>
          <input className={fieldClass} value={projectSearch} onChange={event => setProjectSearch(event.target.value)} placeholder="Search projects…" aria-label="Search projects" disabled={saving} />
          <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background p-1.5 flex flex-col gap-0.5" role="group" aria-label="Projects">
            {visibleProjects.length ? visibleProjects.map(office => (
              <label key={office.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm font-normal text-foreground hover:bg-muted cursor-pointer">
                <input type="checkbox" checked={form.projects.includes(office.id)} onChange={() => toggleProject(office.id)} disabled={saving} />
                {office.name}
              </label>
            )) : <p className="px-1.5 py-1 text-xs text-muted-foreground">No projects match.</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-1 gap-3">
          <label className={labelClass}>{creating ? "Password *" : "New password"}
            <input type="password" className={fieldClass} value={form.password} onChange={event => set("password", event.target.value)} disabled={saving} autoComplete="new-password" placeholder={creating ? "" : "Leave blank to keep the current one"} />
          </label>
          <label className={labelClass}>Access level
            <input type="number" min={1} className={fieldClass} value={form.acc_lvl} onChange={event => set("acc_lvl", event.target.value)} disabled={saving} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={form.is_active} onChange={event => set("is_active", event.target.checked)} disabled={saving || isSelf} />
          Active <span className="text-xs text-muted-foreground">— inactive users can't sign in{isSelf ? " (you can't deactivate yourself)" : ""}</span>
        </label>
        {error && <p className="text-sm font-semibold text-[#c0392b]" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="etm-button ghost small" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="etm-button primary small" disabled={saving}>{saving ? <Loader2 size={14} className="etm-form-spinner" /> : null}{creating ? "Create user" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

function UsersContent() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [offices, setOffices] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([userService.list(), taskService.projects().catch(() => [] as Project[])])
      .then(([list, officeList]) => { if (!cancelled) { setUsers(list); setOffices(officeList); } })
      .catch(caught => { if (!cancelled) setError(userError(caught)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const officeName = useMemo(() => new Map(offices.map(office => [office.id, office.name])), [offices]);
  const projectNames = (user: ManagedUser) => (user.projects ?? []).map(id => officeName.get(id) ?? `#${id}`).join(", ");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(user => `${user.first_name} ${user.last_name} ${user.email} ${user.position} ${roleLabel(user.role)} ${projectNames(user)}`.toLowerCase().includes(query));
  }, [users, search]);
  const { sorted, sort, toggle } = useTableSort(filtered, {
    name: user => `${user.last_name} ${user.first_name}`,
    email: user => user.email,
    position: user => user.position,
    office: user => user.office ? officeName.get(user.office) : null,
    projects: user => projectNames(user),
    role: user => roleLabel(user.role),
    status: user => user.is_active ? 1 : 0,
  });

  const onSaved = (saved: ManagedUser, created: boolean) => {
    setUsers(current => created ? [...current, saved] : current.map(item => item.id === saved.id ? saved : item));
    setEditing(null);
    void Swal.fire({ title: created ? "User created" : "User updated", text: `${saved.first_name} ${saved.last_name}`.trim(), icon: "success", timer: 1500, showConfirmButton: false });
  };

  const confirmDelete = async (user: ManagedUser) => {
    const name = `${user.first_name} ${user.last_name}`.trim() || user.email;
    const result = await Swal.fire({
      title: `Delete ${name}?`,
      html: "This permanently removes the account <strong>and the tasks they created</strong>. If you only want to stop them signing in, edit the user and untick <em>Active</em> instead.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete user",
      confirmButtonColor: "#c0392b",
    });
    if (!result.isConfirmed) return;
    try {
      await userService.remove(user.id);
      setUsers(current => current.filter(item => item.id !== user.id));
      void Swal.fire({ title: "User deleted", icon: "success", timer: 1400, showConfirmButton: false });
    } catch (caught) {
      void Swal.fire({ title: "Couldn't delete user", text: userError(caught), icon: "error" });
    }
  };

  return (
    <div className="etm-reports">
      <section className="etm-report-heading">
        <div>
          <p className="etm-report-eyebrow"><Users size={15} /> Administration</p>
          <h2>User Management</h2>
          <p>Create accounts, change roles, reset passwords, and deactivate or remove users.</p>
        </div>
        <button type="button" className="etm-button" onClick={() => setEditing("new")}><Plus size={16} /> New User</button>
      </section>

      {error && <p className="etm-report-error">{error}</p>}
      {loading ? <p className="etm-empty-row">Loading users…</p> : !error && (
        <>
          <div className="etm-filter-bar">
            <div className="etm-filter-search">
              <Search size={15} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, email, position or role…" aria-label="Search users" />
            </div>
            <span className="etm-tasks-table-unassigned">{filtered.length} of {users.length} user{users.length === 1 ? "" : "s"}</span>
          </div>
          <section className="etm-panel etm-table-wrap">
            <table className="etm-tasks-table etm-report-table">
              <thead><tr>
                <SortTh sortKey="name" sort={sort} onSort={toggle}>Name</SortTh>
                <SortTh sortKey="email" sort={sort} onSort={toggle}>Email</SortTh>
                <SortTh sortKey="position" sort={sort} onSort={toggle}>Position</SortTh>
                <SortTh sortKey="office" sort={sort} onSort={toggle}>Office</SortTh>
                <SortTh sortKey="projects" sort={sort} onSort={toggle}>Projects</SortTh>
                <SortTh sortKey="role" sort={sort} onSort={toggle}>Role</SortTh>
                <SortTh sortKey="status" sort={sort} onSort={toggle}>Status</SortTh>
                <th scope="col" className="etm-tasks-table-actions-col">Action Buttons</th>
              </tr></thead>
              <tbody>
                {sorted.length ? sorted.map(user => {
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <tr key={user.id}>
                      <td className="etm-tasks-table-details-col">{`${user.first_name} ${user.last_name}`.trim() || "—"}{isSelf && <span className="etm-badge" style={{ marginLeft: 8 }}>You</span>}</td>
                      <td>{user.email}</td>
                      <td>{user.position || <span className="etm-tasks-table-unassigned">Not set</span>}</td>
                      <td>{user.office ? officeName.get(user.office) ?? `#${user.office}` : <span className="etm-tasks-table-unassigned">None</span>}</td>
                      <td className="etm-tasks-table-details-col">{user.projects?.length ? <span title={projectNames(user)}>{projectNames(user)}</span> : <span className="etm-tasks-table-unassigned">None</span>}</td>
                      <td>{roleLabel(user.role)}</td>
                      <td><span className={`etm-badge ${user.is_active ? "completed" : "blocked-stuck"}`}>{user.is_active ? "Active" : "Inactive"}</span></td>
                      <td className="etm-report-group-actions">
                        <button type="button" className="etm-icon-button" aria-label={`Edit ${user.email}`} onClick={() => setEditing(user)}><Pencil size={15} /></button>
                        <button type="button" className="etm-icon-button danger" aria-label={`Delete ${user.email}`} title={isSelf ? "You can't delete your own account" : "Delete user"} disabled={isSelf} onClick={() => void confirmDelete(user)}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={8} className="etm-empty-row">{users.length ? "No users match your search." : "No users yet."}</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}

      {editing && <UserFormModal user={editing} offices={offices} isSelf={editing !== "new" && editing.id === currentUser?.id} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}

export default function AdminUsers() {
  return (
    <AdminLayout title="User Management" subtitle="Everyone with access to the system.">
      <UsersContent />
    </AdminLayout>
  );
}
