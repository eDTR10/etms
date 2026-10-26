import type { UserProfile } from "../../screens/Auth/authService";
import type { IPCRAutofill, IPCRField, IPCRFieldValue } from "./types";

export const AUTOFILL_LABEL: Record<IPCRAutofill, string> = {
  name: "Full name",
  email: "Email",
  designation: "Designation",
  office: "Office",
};

// What a field set to "utilize the existing information" starts out as when someone fills in an IPCR. It is only a
// starting value — the person filling it in can type over it.
export function autofillValue(kind: IPCRAutofill | IPCRAutofill[], user: UserProfile | null, officeName: string): string {
  if (!user) return "";
  if (Array.isArray(kind)) return kind.map(item => autofillValue(item, user, officeName)).filter(Boolean).join(", ");
  if (kind === "name") return `${user.first_name} ${user.last_name}`.trim();
  if (kind === "email") return user.email ?? "";
  if (kind === "designation") return user.position ?? "";
  return officeName;
}

// The kinds a field uses, whether it was saved with one or several.
export function autofillKinds(value: IPCRAutofill | IPCRAutofill[] | undefined): IPCRAutofill[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

// What to store for a chosen set: nothing, a single kind (as older templates have it), or the list.
export function normalizeAutofill(kinds: IPCRAutofill[]): IPCRAutofill | IPCRAutofill[] | undefined {
  return kinds.length === 0 ? undefined : kinds.length === 1 ? kinds[0] : kinds;
}

// Today as the YYYY-MM-DD a date input uses (local time, not UTC, so it is the right day late in the evening).
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// What a field starts out as: blank, or filled from the account / today's date if the template says so.
export function startingValue(field: IPCRField, profile: UserProfile | null, officeName: string): IPCRFieldValue {
  if (field.type === "number" || field.type === "rating" || field.type === "month" || field.type === "year") return null;
  if (field.type === "date" && field.dateMode === "today") return todayIso();
  return field.autofill ? autofillValue(field.autofill, profile, officeName) : "";
}
