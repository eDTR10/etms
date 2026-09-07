import type { UserProfile } from "./authService";

export function getHomePath(_user: UserProfile | null): string {
  return "/tm/user/dashboard";
}
