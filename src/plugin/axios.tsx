import axios from "axios";
import { secureStorage } from "../lib/secureStorage";

const baseURL = `${import.meta.env.VITE_BACKEND_URL}/api/v1/`;

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = secureStorage.getItem<string>("auth_token");
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

// Redirect to login on 401 (token deleted/invalidated server-side mid-session).
// DRF tokens don't expire and there's no refresh endpoint, so unlike JWT there's
// nothing to silently retry — a 401 just means the session is over.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      secureStorage.removeItem("auth_token");
      secureStorage.removeItem("user");
      window.location.href = "/etms/login";
    }
    return Promise.reject(error);
  }
);

export default api;
