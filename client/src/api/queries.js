import { api } from "./client";

export const authApi = {
  register: async (payload) => (await api.post("/auth/register", payload)).data,
  login: async (payload) => (await api.post("/auth/login", payload)).data,
  me: async () => (await api.get("/auth/me")).data
};

export const profileApi = {
  get: async () => (await api.get("/profile")).data,
  history: async () => (await api.get("/profile/history")).data,
  uploadResume: async (file) => {
    const formData = new FormData();
    formData.append("resume", file);
    return (await api.post("/profile/upload-resume", formData)).data;
  },
  update: async (payload) => (await api.patch("/profile", payload)).data,
  updatePreferences: async (payload) => (await api.patch("/profile/preferences", payload)).data,
  updateSkillProgress: async (payload) => (await api.patch("/profile/skill-progress", payload)).data
};

export const internshipApi = {
  list: async () => (await api.get("/internships")).data,
  get: async (id) => (await api.get(`/internships/${encodeURIComponent(id)}`)).data,
  sync: async () => (await api.post("/internships/sync")).data,
  search: async (filters) => (await api.get("/internships/search", { params: filters })).data
};

export const matchApi = {
  generate: async () => (await api.post("/matches/generate")).data,
  list: async () => (await api.get("/matches")).data
};

export const skillGapApi = {
  get: async (internshipId) => (await api.get(`/skill-gaps/${encodeURIComponent(internshipId)}`)).data
};

export const materialApi = {
  list: async () => (await api.get("/application-materials")).data,
  generate: async (internshipId) => (await api.post("/application-materials/generate", { internshipId })).data,
  update: async (resumeVersionId, payload) =>
    (await api.patch(`/application-materials/${encodeURIComponent(resumeVersionId)}`, {
      resumeVersionId,
      ...payload
    })).data,
  approve: async (resumeVersionId) =>
    (await api.post("/application-materials/approve", { resumeVersionId })).data,
  downloadPdf: async (resumeVersionId, { download = false } = {}) =>
    (await api.get(`/application-materials/${encodeURIComponent(resumeVersionId)}/pdf`, {
      responseType: "blob",
      params: download ? { download: 1 } : undefined
    })).data,
  openPdf: async (resumeVersionId) => {
    const blob = await materialApi.downloadPdf(resumeVersionId);
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      URL.revokeObjectURL(url);
      throw new Error("The resume PDF window was blocked by the browser.");
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  savePdf: async (resumeVersionId, filename = "careerpilot-resume.pdf") => {
    const blob = await materialApi.downloadPdf(resumeVersionId, { download: true });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
};

export const applicationApi = {
  create: async (payload) => (await api.post("/applications", payload)).data,
  list: async () => (await api.get("/applications")).data,
  update: async (id, payload) => (await api.patch(`/applications/${encodeURIComponent(id)}`, payload)).data,
  remove: async (id) => (await api.delete(`/applications/${encodeURIComponent(id)}`)).data
};

export const notificationApi = {
  list: async () => (await api.get("/notifications")).data,
  read: async (id) => (await api.patch(`/notifications/${encodeURIComponent(id)}/read`)).data
};

export const analyticsApi = {
  get: async () => (await api.get("/analytics")).data
};
