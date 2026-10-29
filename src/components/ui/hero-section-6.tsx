import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Mail, Menu, Plane, SendHorizonal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface HeroMenuItem {
  name: string;
  href: string;
}

const defaultMenuItems: HeroMenuItem[] = [
  { name: "Solicitudes", href: "#operacion" },
  { name: "Cotizador IA", href: "#operacion" },
  { name: "Reservas", href: "#operacion" },
];

const DEFAULT_LIGHT_IMAGE =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2400&q=85";
const DEFAULT_DARK_IMAGE =
  "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=2400&q=85";

export interface HeroSectionProps {
  badgeTag?: string;
  badgeText?: string;
  badgeHref?: string;
  title?: string;
  description?: string;
  highlights?: string[];
  menuItems?: HeroMenuItem[];
  navActions?: ReactNode;
  formSlot?: ReactNode;
  lightImageUrl?: string;
  darkImageUrl?: string;
  imageAlt?: string;
  onEmailSubmit?: (email: string) => void;
  footerSlot?: ReactNode;
}

export function HeroSection({
  badgeTag = "Agencia en 4 sedes",
  badgeText = "Bogotá · Medellín · Cali · Cartagena",
  badgeHref,
  title = "Hacemos realidad tu próximo destino",
  description = "Propuestas asistidas, reservas activas y abonos conciliados en un mismo expediente.",
  highlights = [
    "Documentos protegidos",
    "Control en descuentos > 15%",
    "Saldos conciliados en COP",
  ],
  menuItems = defaultMenuItems,
  navActions,
  formSlot,
  lightImageUrl = DEFAULT_LIGHT_IMAGE,
  darkImageUrl = DEFAULT_DARK_IMAGE,
  imageAlt = "Destino de viaje",
  onEmailSubmit,
  footerSlot,
}: HeroSectionProps) {
  const [menuState, setMenuState] = useState(false);
  const [quickEmail, setQuickEmail] = useState("");
  const hasNavMenu = menuItems.length > 0 || navActions !== null;

  const handleDefaultSubmit = (e: FormEvent) => {
    e.preventDefault();
    onEmailSubmit?.(quickEmail);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header>
        <nav
          data-state={menuState ? "active" : undefined}
          className="group relative z-20 w-full border-b border-dashed border-border bg-card/85 backdrop-blur-md"
        >
          <div className="m-auto max-w-6xl px-6">
            <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
              <div className="flex w-full items-center justify-between lg:w-auto">
                <Link to="/" aria-label="TravelRequests inicio" className="flex items-center">
                  <TravelLogo />
                </Link>

                {hasNavMenu && menuItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMenuState(!menuState)}
                    aria-label={menuState ? "Cerrar menú" : "Abrir menú"}
                    aria-expanded={menuState}
                    className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
                  >
                    <Menu className="m-auto size-6 duration-200 group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0" />
                    <X className="absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200 group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100" />
                  </button>
                )}
              </div>

              {hasNavMenu && (
                <div className="hidden w-full flex-wrap items-center justify-end gap-6 rounded-2xl border border-border bg-card p-5 shadow-lg group-data-[state=active]:flex lg:flex lg:w-fit lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none">
                  {menuItems.length > 0 && (
                    <ul className="space-y-4 text-sm lg:flex lg:gap-7 lg:space-y-0">
                      {menuItems.map((item) => (
                        <li key={item.name}>
                          <a
                            href={item.href}
                            onClick={() => setMenuState(false)}
                            className="block font-medium text-muted-foreground duration-150 hover:text-foreground"
                          >
                            {item.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  {navActions !== null && (
                    <div
                      className={cn(
                        "flex items-center gap-3",
                        menuItems.length > 0 && "lg:border-l lg:border-dashed lg:border-border lg:pl-6"
                      )}
                    >
                      {navActions ?? (
                        <Button asChild size="sm">
                          <Link to="/login">Entrar</Link>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      <main>
        <section id="operacion" className="overflow-hidden">
          <div className="relative mx-auto max-w-6xl px-6 py-12 lg:py-16">
            <div className="relative z-10 lg:flex lg:items-center lg:gap-12">
              <div className="mx-auto max-w-xl lg:ml-0 lg:w-[54%]">
                {badgeHref ? (
                  <Link
                    to={badgeHref}
                    className="flex w-fit items-center gap-2 rounded-lg border border-border bg-card/90 p-1 pr-3 text-xs transition-colors hover:border-primary/50"
                  >
                    <span className="rounded-md bg-primary-soft px-2 py-0.5 font-semibold text-primary">
                      {badgeTag}
                    </span>
                    <span className="font-medium text-muted-foreground">{badgeText}</span>
                    <ArrowRight className="size-3.5 text-primary" />
                  </Link>
                ) : (
                  <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card/90 p-1 pr-3 text-xs">
                    <span className="rounded-md bg-primary-soft px-2 py-0.5 font-semibold text-primary">
                      {badgeTag}
                    </span>
                    <span className="font-medium text-muted-foreground">{badgeText}</span>
                  </div>
                )}

                <h1 className="mt-6 font-display text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                  {title}
                </h1>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {description}
                </p>

                <div className="mt-7">
                  {formSlot ?? (
                    <form onSubmit={handleDefaultSubmit} className="my-6 max-w-md">
                      <div className="relative grid grid-cols-[1fr_auto] items-center rounded-2xl border border-border bg-card pr-1.5 shadow-sm has-[input:focus]:border-primary has-[input:focus]:ring-2 has-[input:focus]:ring-primary/15">
                        <Mail className="pointer-events-none absolute inset-y-0 left-4 my-auto size-4 text-muted-foreground" />
                        <input
                          placeholder="Tu correo electrónico"
                          value={quickEmail}
                          onChange={(e) => setQuickEmail(e.target.value)}
                          className="h-12 w-full bg-transparent pl-11 pr-3 text-sm focus:outline-none"
                          type="email"
                        />
                        <Button type="submit" aria-label="Continuar">
                          <span className="hidden md:block">Continuar</span>
                          <SendHorizonal className="size-4 md:hidden" strokeWidth={2} />
                        </Button>
                      </div>
                    </form>
                  )}

                  {highlights.length > 0 && (
                    <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
                      {highlights.map((item) => (
                        <li key={item} className="inline-flex items-center gap-1.5">
                          <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {footerSlot}
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-0 -mx-4 overflow-hidden rounded-3xl p-3">
              <div
                aria-hidden
                className="absolute inset-0 z-[1] bg-gradient-to-r from-background via-background/94 to-background/35 lg:from-45% lg:via-background/82 lg:to-transparent"
              />
              <div className="relative h-full w-full">
                <img
                  className="hidden h-full w-full rounded-2xl object-cover object-center dark:block"
                  src={darkImageUrl}
                  alt={imageAlt}
                  width={2400}
                  height={1600}
                />
                <img
                  className="h-full w-full rounded-2xl object-cover object-center dark:hidden"
                  src={lightImageUrl}
                  alt={imageAlt}
                  width={2400}
                  height={1600}
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export const TravelLogo = ({ className }: { className?: string }) => {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Plane className="size-4" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        TravelRequests
      </span>
    </span>
  );
};
