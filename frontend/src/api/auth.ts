import { apiRequest, ApiError, clearStoredSession, jsonBody } from "./http";

export type Role = "Administrador" | "Asesor" | "Contabilidad" | "Cliente";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string;
  branch: string;
  active: boolean;
}

export type PublicUser = User;

export interface Session {
  user: PublicUser;
  token: string;
  expiresAt: number;
}

export type NavCategory = "Gestión comercial" | "Reservas y pagos" | "Administración";

export interface NavItem {
  label: string;
  path: string;
  allowedRoles: Role[];
  category?: NavCategory;
}

export const NAV_CATEGORIES: NavCategory[] = ["Gestión comercial", "Reservas y pagos", "Administración"];
export const ROLES: Role[] = ["Administrador", "Asesor", "Contabilidad", "Cliente"];

export const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", path: "/inicio", allowedRoles: ["Administrador", "Asesor", "Contabilidad", "Cliente"] },
  { label: "Expedientes", path: "/expedientes", allowedRoles: ["Administrador", "Asesor", "Contabilidad", "Cliente"], category: "Gestión comercial" },
  { label: "Solicitudes", path: "/solicitudes", allowedRoles: ["Administrador", "Asesor", "Cliente"], category: "Gestión comercial" },
  { label: "Cotizador IA", path: "/cotizador-ia", allowedRoles: ["Administrador", "Asesor", "Contabilidad"], category: "Gestión comercial" },
  { label: "Mis cotizaciones", path: "/mis-cotizaciones", allowedRoles: ["Cliente"], category: "Gestión comercial" },
  { label: "Reservas", path: "/reservas", allowedRoles: ["Administrador", "Asesor", "Cliente"], category: "Reservas y pagos" },
  { label: "Pagos", path: "/pagos", allowedRoles: ["Administrador", "Contabilidad", "Cliente"], category: "Reservas y pagos" },
  { label: "Usuarios", path: "/usuarios", allowedRoles: ["Administrador"], category: "Administración" },
];

export function canAccess(role: Role, path: string) {
  const item = NAV_ITEMS.find((navItem) => navItem.path === path);
  return !item || item.allowedRoles.includes(role);
}

const STORAGE_KEY = "tr-session";
export class AuthError extends Error {}

export async function login(email: string, password: string): Promise<Session> {
  const session = await apiRequest<Session>("/api/auth/login", {
    method: "POST",
    body: jsonBody({ email, password }),
  });
  saveSession(session);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>("/api/auth/logout", { method: "POST" });
  } finally {
    clearStoredSession();
  }
}

export function saveSession(session: Session) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

export function getStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session.token || session.expiresAt <= Date.now()) {
      clearStoredSession();
      return null;
    }
    return session;
  } catch {
    clearStoredSession();
    return null;
  }
}

export async function restoreSession(): Promise<Session | null> {
  const session = getStoredSession();
  if (!session) return null;
  try {
    const user = await apiRequest<PublicUser>("/api/auth/me");
    const restored = { ...session, user };
    saveSession(restored);
    return restored;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearStoredSession();
      return null;
    }
    return session;
  }
}

export interface UserInput {
  name: string;
  email: string;
  role: Role;
  branch: string;
  password?: string;
}

export async function listUsers(_actor: PublicUser): Promise<PublicUser[]> {
  return apiRequest<PublicUser[]>("/api/users");
}

export async function saveUser(
  _actor: PublicUser,
  id: string | null,
  input: UserInput,
): Promise<PublicUser> {
  return apiRequest<PublicUser>(id ? `/api/users/${encodeURIComponent(id)}` : "/api/users", {
    method: id ? "PATCH" : "POST",
    body: jsonBody(input),
  });
}

export async function setUserActive(
  _actor: PublicUser,
  id: string,
  active: boolean,
): Promise<PublicUser> {
  return apiRequest<PublicUser>(`/api/users/${encodeURIComponent(id)}/active`, {
    method: "PATCH",
    body: jsonBody({ active }),
  });
}
