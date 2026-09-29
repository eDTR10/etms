/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
  readonly VITE_STORAGE_KEY: string;
  readonly VITE_DMT_FRONTEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
