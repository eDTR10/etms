import api from "../../plugin/axios";
import { secureStorage } from "../../lib/secureStorage";

export interface LoginPayload {
  email: string;
  password: string;
}

// NOTE: the backend's UserAccount model has no `username` field and requires
// first_name/last_name/position/office/acc_lvl to create a user (see
// accounts/models.py, accounts/serializers.py). Self-registration is also
// restricted to admins via DJOSER['PERMISSIONS']['user_create'] in
// config/settings.py, so this payload/endpoint is a placeholder until the
// Register screen collects those fields.
export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  re_password: string;
}

export interface AuthToken {
  auth_token: string;
}

export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  office: number;
  acc_lvl: number;
  is_active: boolean;
  is_staff: boolean;
}

// Matches the DRF-token scheme the backend actually exposes (djoser.urls.authtoken):
// the same one DMT-Front-end and KMS-Front-end use — "Authorization: Token <token>",
// no refresh token, no expiry to decode.
export const authService = {
  login: async (payload: LoginPayload): Promise<AuthToken> => {
    const { data } = await api.post<AuthToken>("token/login/", payload);
    secureStorage.setItem("auth_token", data.auth_token);
    return data;
  },

  register: async (payload: RegisterPayload): Promise<UserProfile> => {
    const { data } = await api.post<UserProfile>("users/", payload);
    return data;
  },

  getMe: async (): Promise<UserProfile> => {
    const { data } = await api.get<UserProfile>("users/me/");
    // Shared key with the other DICT front-ends (DMT, KMS) — same secureStorage/AES
    // scheme, same VITE_PASSWORD secret — so a cached profile is recognized across systems.
    secureStorage.setItem("auth_user_profile", data);
    return data;
  },

  logout: async (): Promise<void> => {
    // Best-effort — invalidates the token server-side; client-side storage
    // is cleared either way.
    await api.post("token/logout/").catch(() => {});
    secureStorage.removeItem("auth_token");
    secureStorage.removeItem("auth_user_profile");
  },

  isAuthenticated: (): boolean => {
    return !!secureStorage.getItem<string>("auth_token");
  },

  getCachedUser: (): UserProfile | null => {
    return secureStorage.getItem<UserProfile>("auth_user_profile");
  },
};

export default api;
