import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MapPin, SendHorizonal } from "lucide-react";
import { TRAVEL_OFFERS, type TravelOffer } from "@/api/dashboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

export function TravelOffersBanner({
  offers = TRAVEL_OFFERS,
  onSelectOffer,
  className,
}: {
  offers?: TravelOffer[];
  onSelectOffer?: (offer: TravelOffer) => void;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || offers.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((curr) => (curr + 1) % offers.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [paused, offers.length]);

  const current = offers[index] ?? offers[0];
  if (!current) return null;

  const prev = () => setIndex((curr) => (curr - 1 + offers.length) % offers.length);
  const next = () => setIndex((curr) => (curr + 1) % offers.length);

  return (
    <section
      aria-label="Ofertas destacadas de viaje"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "mb-8 overflow-hidden rounded-3xl border border-border bg-white shadow-sm",
        className
      )}
    >
      <div className="relative overflow-hidden px-6 py-8 md:px-10 md:py-10">
        {/* Composición estilo hero-section-6: columna izquierda nítida + imagen derecha difuminada */}
        <div className="relative z-10 max-w-xl">
          {/* Pill de anuncio estilo hero-section-6 */}
          <div className="flex w-fit flex-wrap items-center gap-2 rounded-lg border border-border bg-white/95 p-1 pr-3 shadow-2xs">
            <span className="rounded-[calc(var(--radius)-0.25rem)] bg-cta px-2.5 py-0.5 text-xs font-semibold text-cta-foreground">
              {current.badge}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
              <MapPin className="size-3.5 text-primary" />
              {current.country}
            </span>
            <span className="block h-3.5 w-px bg-border" aria-hidden />
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
              <CalendarDays className="size-3.5 text-primary" />
              {current.duration}
            </span>
            <ArrowRight className="size-3.5 text-primary" />
          </div>

          <h2 className="mt-5 font-display text-balance text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
            {current.destination}
          </h2>
          <p className="mt-2 text-base font-medium text-slate-800">{current.title}</p>
          <p className="mt-1 text-sm text-slate-600">{current.includes}</p>

          {/* Cápsula de precio + acción estilo hero-section-6 */}
          <div className="mt-6 flex max-w-md flex-wrap items-center justify-between gap-4 rounded-[1rem] border border-border bg-white/95 px-4 py-3 shadow-md shadow-sky-950/5 backdrop-blur-xs">
            <div>
              <p className="text-xs text-slate-500 line-through">
                Antes {formatCOP(current.previousPriceCOP)}
              </p>
              <p className="font-display text-2xl font-bold text-slate-950">
                {formatCOP(current.priceCOP)}{" "}
                <span className="font-sans text-xs font-normal text-slate-500">COP / persona</span>
              </p>
            </div>

            {onSelectOffer && (
              <Button
                type="button"
                onClick={() => onSelectOffer(current)}
                className="rounded-xl bg-cta text-cta-foreground hover:bg-cta-hover"
              >
                <span>Cotizar este viaje</span>
                <SendHorizonal className="size-4" strokeWidth={2} />
              </Button>
            )}
          </div>
        </div>

        {/* Imagen de fondo con desvanecimiento lateral estilo hero-section-6 */}
        <div className="pointer-events-none absolute inset-0">
          <div
            aria-hidden
            className="absolute inset-0 z-[1] bg-gradient-to-r from-white from-38% via-white/85 to-white/15"
          />
          <img
            key={current.id}
            src={current.imageUrl}
            alt={current.destination}
            className="h-full w-full object-cover object-center transition-all duration-700"
          />
        </div>
      </div>

      {/* Barra inferior punteada estilo hero-section-6 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-border bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {offers.map((offer, i) => {
            const active = i === index;
            return (
              <button
                key={offer.id}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {offer.destination}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={prev}
            aria-label="Oferta anterior"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Siguiente oferta"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground transition-colors hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
