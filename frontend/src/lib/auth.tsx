import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "@/api/auth";
import type { Session } from "@/api/auth";

interface AuthCtx {
  session: Session | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void api.restoreSession().then((restored) => {
      if (!active) return;
      setSession(restored);
      setReady(true);
    });
    return () => {
      active = false;
    };
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
      try {
        await api.logout();
      } finally {
        setSession(null);
      }
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return c;
}
