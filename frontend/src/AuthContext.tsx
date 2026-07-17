import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export type CurrentUser = {
  id: number; username: string; role: "admin" | "tpm_csm" | "utility";
  allowed_pilot_ids: number[]; content_scope: string; channel_scope: string;
};

// The backend's single source of truth for field-level RBAC (see
// backend/app/rbac_matrix.py) — fetched once per session alongside the user,
// so every component asks this map instead of hardcoding its own copy of the
// permission rules.
export type PermissionLevel = "edit" | "view" | "none";
export type PermissionMap = Record<string, PermissionLevel>;

type AuthState = {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  actionPermissions: PermissionMap;
  insightPermissions: PermissionMap;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState>({
  user: null, loading: true, error: null, actionPermissions: {}, insightPermissions: {},
  login: async () => {}, logout: () => {},
});

async function loadPermissions(setActionPermissions: (m: PermissionMap) => void, setInsightPermissions: (m: PermissionMap) => void) {
  const [actionPerms, insightPerms] = await Promise.all([api.getActionPermissions(), api.getInsightPermissions()]);
  setActionPermissions(actionPerms);
  setInsightPermissions(insightPerms);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPermissions, setActionPermissions] = useState<PermissionMap>({});
  const [insightPermissions, setInsightPermissions] = useState<PermissionMap>({});

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.me().then((u) => {
      setUser(u);
      return loadPermissions(setActionPermissions, setInsightPermissions);
    }).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    setError(null);
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      setUser(res.user);
      await loadPermissions(setActionPermissions, setInsightPermissions);
    } catch (e: any) {
      setError("Invalid username or password");
      throw e;
    }
  };

  const logout = () => {
    api.logout().catch(() => {});
    setToken(null);
    setUser(null);
    setActionPermissions({});
    setInsightPermissions({});
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, actionPermissions, insightPermissions, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Compatibility shim so existing components can keep reading `role` without
// threading the full user object through every prop chain.
export function useRole() {
  const { user } = useAuth();
  return { role: user?.role ?? "tpm_csm" };
}

// The single place components ask "what can I do with field X" — backed by
// the backend's resolved rbac_matrix.py map, not a locally-hardcoded set.
export function usePermissions(kind: "action" | "insight"): PermissionMap {
  const { actionPermissions, insightPermissions } = useAuth();
  return kind === "action" ? actionPermissions : insightPermissions;
}
