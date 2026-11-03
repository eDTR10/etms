import axios from "axios";
import { secureStorage } from "../lib/secureStorage";
import { getMutationSignal } from "./mutationSignal";

const baseURL = `${import.meta.env.VITE_BACKEND_URL}/api/v1/`;

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = secureStorage.getItem<string>("auth_token");
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  const signal = getMutationSignal();
  if (signal && config.method !== "get" && !config.signal) config.signal = signal;
  return config;
});

// 401 handling. Tokens expire server-side after 30 days (or can be deleted mid-session),
// and there's no refresh endpoint — so a 401 normally means the session is over. The one
// thing worth retrying: the backend rejects an EXPIRED token even on the login call itself,
// so a request that carried a token and got 401 drops it and retries once anonymously (login
// then works with a stale token still in storage). If that retry is also 401, go to the
// login page (unless already there, to avoid a reload loop).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original) {
      if (original.headers?.Authorization && !original._retriedWithoutToken) {
        secureStorage.removeItem("auth_token");
        secureStorage.removeItem("auth_user_profile");
        original._retriedWithoutToken = true;
        delete original.headers.Authorization;
        return api(original);
      }
      if (!window.location.pathname.endsWith("/login")) {
        window.location.href = "/etms/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
