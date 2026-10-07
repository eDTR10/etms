import type { UserProfile } from "../../screens/Auth/authService";
import type { IPCRAutofill } from "./types";

export const AUTOFILL_LABEL: Record<IPCRAutofill, string> = {
  name: "Full name",
  email: "Email",
  designation: "Designation",
  office: "Office",
};

// What a field set to "utilize the existing information" starts out as when someone fills in an IPCR. It is only a
// starting value — the person filling it in can type over it.
export function autofillValue(kind: IPCRAutofill, user: UserProfile | null, officeName: string): string {
  if (!user) return "";
  if (kind === "name") return `${user.first_name} ${user.last_name}`.trim();
  if (kind === "email") return user.email ?? "";
  if (kind === "designation") return user.position ?? "";
  return officeName;
}
