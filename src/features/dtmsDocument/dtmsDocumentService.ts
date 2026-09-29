import api from "../../plugin/axios";
import type { DtmsDocumentCreateResult, DtmsDocumentStatus, DtmsDocumentTemplate, DtmsSignatoryEntry, DtmsSignatoryUser } from "./dtmsDocumentTypes";

// Calls straight into the `documents` app on the same shared backend ETMS's own `api` axios
// instance already talks to (same baseURL, same DRF token) — no separate auth or instance
// needed, since ETMS and DMT-Front-end are two frontends over one Django project.
export const dtmsDocumentService = {
  listTemplates: async (signal?: AbortSignal) =>
    (await api.get<DtmsDocumentTemplate[]>("document/templates/", { signal })).data,
  listSignatoryUsers: async (signal?: AbortSignal) =>
    (await api.get<DtmsSignatoryUser[]>("users/signatories/", { signal })).data,
  // Metadata only, deliberately no file — mirrors DMT-Front-end's own create flow, which
  // splits the file into a separate upload_file call to avoid a proxy 413 on large files.
  create: async (fd: FormData) =>
    (await api.post<DtmsDocumentCreateResult>("document/", fd)).data,
  uploadFile: async (documentId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    await api.post(`document/${documentId}/upload_file/`, fd);
  },
  send: async (documentId: number, signatories: DtmsSignatoryEntry[]) => {
    await api.post(`document/${documentId}/send/`, { signatories });
  },
  getStatus: async (tracknumber: string, signal?: AbortSignal) =>
    (await api.get<DtmsDocumentStatus>(`document/tracknumber/${tracknumber}`, { signal })).data,
};
