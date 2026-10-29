// Servicio mock de autenticación. Reemplazar por llamadas a FastAPI manteniendo firmas.
export type Role = "Administrador" | "Asesor" | "Contabilidad" | "Cliente";

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: Role;
  avatarUrl: string;
  branch: string;
  active: boolean;
}

export interface Session {
  user: Omit<User, "password">;
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

const avatar = (seed: string) => `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}`;

let USERS: User[] = [
  { id: "u1", name: "Laura Gómez", email: "admin@travelrequests.co", password: "admin123", role: "Administrador", avatarUrl: avatar("Laura Gómez"), branch: "Bogotá - Chicó", active: true },
  { id: "u2", name: "Andrés Ruiz", email: "asesor@travelrequests.co", password: "asesor123", role: "Asesor", avatarUrl: avatar("Andrés Ruiz"), branch: "Medellín - El Poblado", active: true },
  { id: "u3", name: "Marta Díaz", email: "contabilidad@travelrequests.co", password: "conta123", role: "Contabilidad", avatarUrl: avatar("Marta Díaz"), branch: "Bogotá - Chicó", active: true },
  { id: "u4", name: "Carlos Pérez", email: "cliente@travelrequests.co", password: "cliente123", role: "Cliente", avatarUrl: avatar("Carlos Pérez"), branch: "Cali - Granada", active: true },
  { id: "u5", name: "Julián Ospina", email: "inactivo@travelrequests.co", password: "inactivo123", role: "Asesor", avatarUrl: avatar("Julián Ospina"), branch: "Cartagena", active: false },
];

export const DEMO_ACCOUNTS = USERS.filter((u) => u.active && u.password).map((u) => ({ email: u.email, password: u.password ?? "", role: u.role }));

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
  const item = NAV_ITEMS.find((n) => n.path === path);
  return !item || item.allowedRoles.includes(role);
}

const STORAGE_KEY = "tr-session";
const SESSION_MS = 8 * 60 * 60 * 1000;
const delay = (ms = 700) => new Promise((r) => setTimeout(r, ms));

export class AuthError extends Error {}

export async function login(email: string, password: string): Promise<Session> {
  await delay();
  const u = USERS.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u || u.password !== password) throw new AuthError("Correo o contraseña incorrectos.");
  if (!u.active) throw new AuthError("Tu usuario está inactivo. Contacta al administrador.");
  const { password: _omit, ...user } = u;
  const session: Session = { user, token: `mock.${u.id}.${Date.now()}`, expiresAt: Date.now() + SESSION_MS };
  saveSession(session);
  return session;
}

export async function logout(): Promise<void> {
  await delay(200);
  localStorage.removeItem(STORAGE_KEY);
}

export function saveSession(s: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function getStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export type PublicUser = Omit<User, "password">;
export interface UserInput { name: string; email: string; role: Role; branch: string; password?: string }
function adminOnly(actor: PublicUser) {
  if (!actor.active || actor.role !== "Administrador") throw new AuthError("Solo el Administrador puede gestionar usuarios.");
}
const publicUser = ({ password: _password, ...user }: User): PublicUser => user;
export async function listUsers(actor: PublicUser): Promise<PublicUser[]> {
  await delay(500); adminOnly(actor); return structuredClone(USERS.map(publicUser));
}
export async function saveUser(actor: PublicUser, id: string | null, input: UserInput): Promise<PublicUser> {
  await delay(500); adminOnly(actor);
  if (!input.name.trim() || !input.branch.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || !ROLES.includes(input.role)) throw new AuthError("Revisa nombre, correo, sede y rol.");
  if (USERS.some((u) => u.id !== id && u.email.toLowerCase() === input.email.trim().toLowerCase())) throw new AuthError("Este correo ya está registrado.");
  if (id === actor.id && input.role !== "Administrador") throw new AuthError("No puedes quitarte el acceso de Administrador.");
  const previous = id ? USERS.find((u) => u.id === id) : undefined;
  if (id && !previous) throw new AuthError("El usuario no está disponible.");
  if ((!id || input.password) && (input.password?.length ?? 0) < 8) throw new AuthError("La contraseña debe tener al menos 8 caracteres.");
  const user: User = { id: previous?.id ?? `user-${crypto.randomUUID()}`, name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, branch: input.branch.trim(), active: previous?.active ?? true, avatarUrl: avatar(input.name), password: input.password || previous?.password || "" };
  USERS = previous ? USERS.map((u) => u.id === id ? user : u) : [...USERS, user];
  return publicUser(user);
}
export async function setUserActive(actor: PublicUser, id: string, active: boolean): Promise<PublicUser> {
  await delay(500); adminOnly(actor);
  if (id === actor.id && !active) throw new AuthError("No puedes desactivar tu propia cuenta.");
  const user = USERS.find((u) => u.id === id);
  if (!user) throw new AuthError("El usuario no está disponible.");
  const updated = { ...user, active }; USERS = USERS.map((u) => u.id === id ? updated : u);
  return publicUser(updated);
}
