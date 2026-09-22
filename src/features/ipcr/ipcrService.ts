import api from "../../plugin/axios";
import type { IPCRSubmission, IPCRSubmissionInput, IPCRTemplate, IPCRTemplateInput } from "./types";

export const ipcrService = {
  listTemplates: async () => (await api.get<IPCRTemplate[]>("etm/ipcr-templates/")).data,
  createTemplate: async (input: IPCRTemplateInput) => (await api.post<IPCRTemplate>("etm/ipcr-templates/", input)).data,
  updateTemplate: async (id: number, input: IPCRTemplateInput) => (await api.patch<IPCRTemplate>(`etm/ipcr-templates/${id}/`, input)).data,
  deleteTemplate: async (id: number) => { await api.delete(`etm/ipcr-templates/${id}/`); },

  listSubmissions: async () => (await api.get<IPCRSubmission[]>("etm/ipcr-submissions/")).data,
  createSubmission: async (input: IPCRSubmissionInput) => (await api.post<IPCRSubmission>("etm/ipcr-submissions/", input)).data,
  updateSubmission: async (id: number, input: Partial<IPCRSubmissionInput>) =>
    (await api.patch<IPCRSubmission>(`etm/ipcr-submissions/${id}/`, input)).data,
  deleteSubmission: async (id: number) => { await api.delete(`etm/ipcr-submissions/${id}/`); },
};
