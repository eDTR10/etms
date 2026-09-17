import type { UserProfile } from "./authService";

// Mirrors the backend's permissions.is_admin — same org-wide admin convention used by the
// documents/kms/gpass apps, not a separate eTM-specific flag.
export function isAdmin(user: UserProfile | null): boolean {
  return !!user && (user.is_staff || user.role === "admin");
}

export function getHomePath(user: UserProfile | null): string {
  if (isAdmin(user)) return "/etms/admin/dashboard";
  return "/etms/dashboard";
}
