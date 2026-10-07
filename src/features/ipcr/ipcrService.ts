import api from "../../plugin/axios";
import type { IPCRSubmission, IPCRSubmissionInput, IPCRTemplate, IPCRTemplateInput } from "./types";

export const ipcrService = {
  listTemplates: async () => (await api.get<IPCRTemplate[]>("etm/ipcr-templates/")).data,
  createTemplate: async (input: IPCRTemplateInput) => (await api.post<IPCRTemplate>("etm/ipcr-templates/", input)).data,
  updateTemplate: async (id: number, input: IPCRTemplateInput) => (await api.patch<IPCRTemplate>(`etm/ipcr-templates/${id}/`, input)).data,
  deleteTemplate: async (id: number) => { await api.delete(`etm/ipcr-templates/${id}/`); },
  uploadSampleDocument: async (id: number, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return (await api.post<IPCRTemplate>(`etm/ipcr-templates/${id}/sample-document/`, body, { headers: { "Content-Type": "multipart/form-data" } })).data;
  },
  removeSampleDocument: async (id: number) => (await api.delete<IPCRTemplate>(`etm/ipcr-templates/${id}/sample-document/`)).data,

  listSubmissions: async () => (await api.get<IPCRSubmission[]>("etm/ipcr-submissions/")).data,
  createSubmission: async (input: IPCRSubmissionInput) => (await api.post<IPCRSubmission>("etm/ipcr-submissions/", input)).data,
  updateSubmission: async (id: number, input: Partial<IPCRSubmissionInput>) =>
    (await api.patch<IPCRSubmission>(`etm/ipcr-submissions/${id}/`, input)).data,
  deleteSubmission: async (id: number) => { await api.delete(`etm/ipcr-submissions/${id}/`); },
};
