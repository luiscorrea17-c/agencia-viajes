import { useEffect, useState } from "react";
import { AlertTriangle, Clock3, CloudSun, PlaneLanding, PlaneTakeoff, Radio } from "lucide-react";
import { DEFAULT_RADAR_PULSE, RADAR_CITIES, type RadarCity, type RadarPulse } from "@/api/dashboard";
import { cn } from "@/lib/utils";

function formatCityTime(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone,
    }).format(date);
  } catch {
    return "--:--:--";
  }
}

export function TravelRadarBanner({
  cities = RADAR_CITIES,
  pulse = DEFAULT_RADAR_PULSE,
  className,
}: {
  cities?: RadarCity[];
  pulse?: RadarPulse;
  className?: string;
}) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      aria-label="Radar de pasajeros y clima en ruta"
      className={cn(
        "mb-6 overflow-hidden rounded-2xl border border-border bg-white text-foreground",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Radio className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold text-foreground">
            Radar de pasajeros y clima en ruta
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2" aria-label="Pulso en tiempo real">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900">
            <PlaneTakeoff className="h-3.5 w-3.5 text-sky-700" />
            {pulse.passengersInFlight} pasajeros en vuelo
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
            <PlaneLanding className="h-3.5 w-3.5 text-emerald-700" />
            {pulse.landingsToday} aterrizajes hoy
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
            {pulse.itineraryAlerts} alertas de itinerario
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 bg-white p-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {cities.map((item) => (
          <article
            key={item.code}
            className={cn(
              "group relative min-h-36 overflow-hidden rounded-xl border transition-colors",
              item.isHub ? "border-primary/40" : "border-border"
            )}
          >
            <img
              src={item.imageUrl}
              alt={item.city}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/75 to-white/40" />

            <div className="relative z-10 flex h-full flex-col justify-between p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold",
                      item.isHub
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-white/90 text-foreground"
                    )}
                  >
                    {item.code}
                  </span>
                  <p className="mt-1 text-xs font-medium text-slate-700">{item.country}</p>
                </div>

                <div className="flex items-center gap-1 rounded-md border border-border bg-white/90 px-2 py-0.5 font-mono text-xs font-medium text-slate-900">
                  <Clock3 className="h-3 w-3 text-primary" />
                  <span>{formatCityTime(now, item.timeZone)}</span>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold leading-tight text-slate-950">{item.city}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-700">
                    <CloudSun className="h-3.5 w-3.5 text-amber-600" />
                    <span>{item.condition}</span>
                  </p>
                </div>
                <p className="font-display text-2xl font-semibold tracking-tight text-slate-950">
                  {item.tempC}°C
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
