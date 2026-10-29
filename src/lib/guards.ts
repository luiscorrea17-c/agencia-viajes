import { redirect } from "@tanstack/react-router";
import { canAccess, getStoredSession } from "@/api/auth";

/** beforeLoad para rutas de módulo: exige sesión y rol permitido. */
export function requireAccess(path: string) {
  return ({ location }: { location: { href: string } }) => {
    const s = getStoredSession();
    if (!s) throw redirect({ to: "/login", search: { redirect: location.href } });
    if (!canAccess(s.user.role, path)) throw redirect({ to: "/sin-permiso" });
  };
}
