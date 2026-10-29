import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, MapPin, Menu, X } from "lucide-react";
import { NAV_CATEGORIES, NAV_ITEMS, ROLES, canAccess, type NavCategory, type Role } from "@/api/auth";
import { TravelLogo } from "@/components/ui/hero-section-6";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

export function AppLayout() {
  const { session, logout, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openCategory, setOpenCategory] = useState<NavCategory | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenCategory(null);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setOpenCategory(null);
        setMobileMenu(false);
      }
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, []);

  useEffect(() => {
    setOpenCategory(null);
    setMobileMenu(false);
  }, [location.pathname]);

  if (!session) return null;
  const { user } = session;
  const items = NAV_ITEMS.filter((n) => n.allowedRoles.includes(user.role));
  const directItems = items.filter((n) => !n.category);
  const categoryGroups = NAV_CATEGORIES.map((category) => ({
    category,
    items: items.filter((n) => n.category === category),
  })).filter((group) => group.items.length > 0);

  const onRole = (r: Role) => {
    switchRole(r);
    const here = window.location.pathname;
    if (!canAccess(r, here)) navigate({ to: "/sin-permiso" });
  };

  const onLogout = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await logout();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40">
        <div className="h-0.5 w-full bg-gradient-to-r from-primary via-sky-400 to-cta" aria-hidden />
        <nav
          ref={navRef}
          data-state={mobileMenu ? "active" : undefined}
          aria-label="Navegación principal"
          className="group border-b border-border bg-card/90 backdrop-blur-md"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4 py-3 lg:flex-nowrap">
              <div className="flex w-full items-center justify-between lg:w-auto">
                <Link to="/inicio" aria-label="TravelRequests inicio">
                  <TravelLogo />
                </Link>

                <button
                  type="button"
                  onClick={() => setMobileMenu((m) => !m)}
                  aria-label={mobileMenu ? "Cerrar menú" : "Abrir menú"}
                  aria-expanded={mobileMenu}
                  className="relative z-20 -m-2 block cursor-pointer p-2 lg:hidden"
                >
                  <Menu className="m-auto size-6 duration-200 group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0" />
                  <X className="absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200 group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100" />
                </button>
              </div>

              <div className="mb-3 hidden w-full flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-lg group-data-[state=active]:flex lg:mb-0 lg:flex lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none">
                {/* Opciones agrupadas por categorías (acordeón en móvil, desplegable flotante en escritorio) */}
                <div className="flex flex-col gap-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-1.5 lg:pl-4">
                  {directItems.map((n) => (
                    <Link
                      key={n.path}
                      to={n.path}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      activeProps={{
                        className:
                          "rounded-lg px-3 py-2 text-sm font-semibold bg-primary text-primary-foreground",
                      }}
                    >
                      {n.label}
                    </Link>
                  ))}

                  {categoryGroups.map(({ category, items: groupItems }) => {
                    const isOpen = openCategory === category;
                    const activeItem = groupItems.find(
                      (n) => location.pathname === n.path || location.pathname.startsWith(`${n.path}/`)
                    );
                    const isActive = Boolean(activeItem);
                    return (
                      <div key={category} className="relative">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-haspopup="menu"
                          onClick={() => setOpenCategory((curr) => (curr === category ? null : category))}
                          className={cn(
                            "flex w-full items-center justify-between gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:inline-flex lg:w-auto",
                            isActive || isOpen
                              ? "bg-primary font-semibold text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <span>{category}</span>
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform duration-150", isOpen && "rotate-180")}
                          />
                        </button>
                        {isOpen && (
                          <div
                            role="menu"
                            aria-label={category}
                            className="mt-1 ml-2 space-y-0.5 border-l-2 border-border pl-2.5 lg:absolute lg:left-0 lg:top-full lg:z-50 lg:mt-2 lg:ml-0 lg:min-w-48 lg:rounded-xl lg:border lg:bg-card lg:p-1.5 lg:shadow-lg"
                          >
                            {groupItems.map((n) => (
                              <Link
                                key={n.path}
                                to={n.path}
                                role="menuitem"
                                onClick={() => {
                                  setOpenCategory(null);
                                  setMobileMenu(false);
                                }}
                                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                activeProps={{
                                  className:
                                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold bg-primary-soft text-primary",
                                }}
                              >
                                {n.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Selector de rol simulado y perfil */}
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">Rol</span>
                    <select
                      value={user.role}
                      onChange={(e) => onRole(e.target.value as Role)}
                      className="h-8 rounded-lg border border-peach/50 bg-peach-soft px-2.5 text-xs font-semibold text-peach-foreground outline-none focus:border-peach"
                    >
                      {ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>

                  <div className="relative" ref={menuRef}>
                    <Button
                      variant="ghost"
                      onClick={() => setOpen((o) => !o)}
                      className="min-h-8 gap-1.5 rounded-lg p-1"
                      aria-label="Menú de usuario"
                    >
                      <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full border border-border" />
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    {open && (
                      <div className="absolute right-0 mt-2 w-60 rounded-xl border border-border bg-card p-3.5 shadow-lg">
                        <p className="text-sm font-semibold text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          {user.branch} · {user.role}
                        </p>
                        <div className="mt-2.5 border-t border-border pt-2">
                          <Button
                            variant="ghost"
                            onClick={onLogout}
                            className="min-h-8 w-full justify-start rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
