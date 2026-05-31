import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  api,
  clearToken,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
  type AppUser,
} from "@/lib/api";

export type AppRole = "student" | "instructor" | "admin";

export interface AuthState {
  user: AppUser | null;
  roles: AppRole[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  const roles = useMemo(() => (user?.roles ?? []) as AppRole[], [user]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = getToken();
      if (!token) {
        clearToken();
        setUser(null);
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const res = await api.me();
        if (cancelled) return;
        setUser(res.user);
        setStoredUser(res.user);
      } catch {
        clearToken();
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function syncSession(event: StorageEvent) {
      if (!event.key || event.key === "intellilearn_token" || event.key === "intellilearn_user") {
        setUser(getStoredUser());
      }
    }

    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login({ email, password });
    setToken(res.token);
    setStoredUser(res.user);
    setUser(res.user);
  }

  async function signup(name: string, email: string, password: string) {
    const res = await api.signup({ name, email, password });
    setToken(res.token);
    setStoredUser(res.user);
    setUser(res.user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, roles, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}

export function hasRole(roles: AppRole[], role: AppRole) {
  return roles.includes(role);
}
