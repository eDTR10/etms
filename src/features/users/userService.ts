import { isAxiosError } from "axios";
import api from "../../plugin/axios";

export const USER_ROLES = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "budget", label: "Budget" },
  { value: "accounting", label: "Accounting" },
  { value: "cashier", label: "Cashier" },
  { value: "provincial_officer", label: "Provincial Officer" },
] as const;

export function roleLabel(role: string): string {
  return USER_ROLES.find(item => item.value === role)?.label ?? role;
}

export interface ManagedUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  office: number | null;
  acc_lvl: number;
  is_active: boolean;
  is_staff: boolean;
  role: string;
}

export interface ManagedUserInput {
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  office: number | null;
  acc_lvl: number;
  is_active: boolean;
  role: string;
  // Required when creating; when editing, leave out to keep the current password.
  password?: string;
}

// The user-management API returns DRF-style errors: {field: [messages]} or {detail: "…"}.
export function userError(error: unknown): string {
  if (isAxiosError(error)) {
    const body = error.response?.data;
    if (body && typeof body === "object") {
      if (typeof body.detail === "string") return body.detail;
      const messages = Object.entries(body as Record<string, unknown>).flatMap(([field, value]) => {
        const text = Array.isArray(value) ? value.join(" ") : String(value);
        return field === "non_field_errors" ? [text] : [`${field.replace(/_/g, " ")}: ${text}`];
      });
      if (messages.length) return messages.join(" ");
    }
    if (!error.response) return "We couldn’t reach the server. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

export const userService = {
  list: async () => (await api.get<ManagedUser[]>("users/manage/")).data,
  create: async (input: ManagedUserInput) => (await api.post<ManagedUser>("users/manage/", input)).data,
  update: async (id: number, input: Partial<ManagedUserInput>) => (await api.patch<ManagedUser>(`users/manage/${id}/`, input)).data,
  remove: async (id: number) => { await api.delete(`users/manage/${id}/`); },
};
