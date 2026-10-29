import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "@/api/auth";
import { isBackendEnabled } from "@/api/client";
import type { Role, Session } from "@/api/auth";

interface AuthCtx {
  session: Session | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  /** Solo para demo: cambia el rol de la sesión simulada. */
  switchRole: (role: Role) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(api.getStoredSession());
    setReady(true);
  }, []);

  const value: AuthCtx = {
    session,
    ready,
    login: async (email, password) => {
      const s = await api.login(email, password);
      setSession(s);
      return s;
    },
    logout: async () => {
      await api.logout();
      setSession(null);
    },
    switchRole: (role) => {
      if (!session || isBackendEnabled()) return;
      const s = { ...session, user: { ...session.user, role } };
      api.saveSession(s);
      setSession(s);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return c;
}
