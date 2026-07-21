// Configurable via a build-time env var so the same bundle can point at a
// deployed backend instead of hardcoding localhost — set VITE_API_BASE_URL
// (e.g. in a .env file, see .env.example) before building for anywhere other
// than local dev. Explicitly set to "" (as build.sh does) for a single-origin
// deployment where uvicorn serves the built frontend itself — relative paths
// then resolve to the same host:port automatically. `??`, not `||`: an
// explicit empty string must stick, only a truly unset var falls back.
const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "nbi_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

async function request(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(body.detail ?? body));
  }
  return res.json();
}

async function upload(path: string, file: File) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", body: form,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(body.detail ?? body));
  }
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request("/api/auth/me"),
  getActionPermissions: () => request("/api/permissions/actions"),
  getInsightPermissions: () => request("/api/permissions/insights"),
  getSchemaReference: () => request("/api/schema"),

  listUsers: () => request("/api/users"),
  createUser: (body: {
    username: string; password: string; role: string;
    allowed_pilot_ids?: number[]; content_scope?: string; channel_scope?: string;
  }) => request("/api/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: number, body: Record<string, unknown>) =>
    request(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: number) => request(`/api/users/${id}`, { method: "DELETE" }),

  listPilots: () => request("/api/pilots"),
  createPilot: (code: string, name: string) =>
    request("/api/pilots", { method: "POST", body: JSON.stringify({ code, name }) }),
  cloneFromMaster: (pilotId: number) =>
    request(`/api/pilots/${pilotId}/clone-from-master`, { method: "POST" }),
  uploadActionsSheet: (pilotId: number, file: File) =>
    upload(`/api/pilots/${pilotId}/upload/actions`, file),
  uploadInsightsSheet: (pilotId: number, file: File) =>
    upload(`/api/pilots/${pilotId}/upload/insights`, file),
  deletePilot: (pilotId: number) => request(`/api/pilots/${pilotId}`, { method: "DELETE" }),
  listActions: (pilotId: number) => request(`/api/pilots/${pilotId}/actions`),
  getAction: (id: number) => request(`/api/actions/${id}`),
  reviewAction: (id: number) => request(`/api/actions/${id}/review`),
  updateAction: (id: number, fields: Record<string, unknown>) =>
    request(`/api/actions/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) }),
  validateAction: (id: number) => request(`/api/actions/${id}/validate`, { method: "POST" }),
  submitAction: (id: number) => request(`/api/actions/${id}/submit`, { method: "POST" }),
  unlockAction: (id: number) => request(`/api/actions/${id}/unlock`, { method: "POST" }),
  deleteAction: (id: number) => request(`/api/actions/${id}`, { method: "DELETE" }),
  publishActions: (pilotId: number, ids: number[]) =>
    request(`/api/pilots/${pilotId}/actions/publish`, { method: "POST", body: JSON.stringify({ ids }) }),
  exportActionsSheet: (pilotId: number) => request(`/api/pilots/${pilotId}/actions/export`),

  listInsights: (pilotId: number) => request(`/api/pilots/${pilotId}/insights`),
  getInsight: (id: number) => request(`/api/insights/${id}`),
  reviewInsight: (id: number) => request(`/api/insights/${id}/review`),
  updateInsight: (id: number, fields: Record<string, unknown>) =>
    request(`/api/insights/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) }),
  validateInsight: (id: number) => request(`/api/insights/${id}/validate`, { method: "POST" }),
  submitInsight: (id: number) => request(`/api/insights/${id}/submit`, { method: "POST" }),
  unlockInsight: (id: number) => request(`/api/insights/${id}/unlock`, { method: "POST" }),
  deleteInsight: (id: number) => request(`/api/insights/${id}`, { method: "DELETE" }),
  publishInsights: (pilotId: number, ids: number[]) =>
    request(`/api/pilots/${pilotId}/insights/publish`, { method: "POST", body: JSON.stringify({ ids }) }),
  exportInsightsSheet: (pilotId: number) => request(`/api/pilots/${pilotId}/insights/export`),

  listInteractions: (pilotId: number) => request(`/api/pilots/${pilotId}/interactions`),
  createInteraction: (actionItemId: number, insightItemId: number) =>
    request(
      "/api/interactions",
      { method: "POST", body: JSON.stringify({ action_item_id: actionItemId, insight_item_id: insightItemId }) },
    ),
  exportInteraction: (id: number) => request(`/api/interactions/${id}/export`),
  unmergeInteraction: (id: number) => request(`/api/interactions/${id}`, { method: "DELETE" }),

  auditLog: (entityType?: string, entityId?: number) => {
    const params = new URLSearchParams();
    if (entityType) params.set("entity_type", entityType);
    if (entityId) params.set("entity_id", String(entityId));
    return request(`/api/audit-log?${params}`);
  },
};
