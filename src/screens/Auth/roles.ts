import type { UserProfile } from "./authService";

// Mirrors the backend's permissions.is_admin — same org-wide admin convention used by the
// documents/kms/gpass apps, not a separate eTM-specific flag.
export function isAdmin(user: UserProfile | null): boolean {
  return !!user && (user.is_staff || user.role === "admin" || user.role === "super_admin");
}

// Only a Super Admin may open User Management; an ordinary Admin may not.
export function isSuperAdmin(user: UserProfile | null): boolean {
  return !!user && user.role === "super_admin";
}

export function getHomePath(user: UserProfile | null): string {
  if (isAdmin(user)) return "/etms/admin/dashboard";
  return "/etms/dashboard";
}
