import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, Plane } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canAccess, type PublicUser } from "@/api/auth";
import { dashboardQuery } from "./operations-query";
import { RequestsScreen } from "./RequestsScreen";
import { TravelRadarBanner } from "./TravelRadarBanner";
import { KpiCard, PageHeader, StatusChip, EmptyState } from "./ui";
import { cop, fmtDate } from "./quote-query";

export function HomeScreen() {
  const { session } = useAuth();
  if (!session) return null;
  return session.user.role === "Cliente" ? (
    <RequestsScreen portal />
  ) : (
    <Home key={`${session.user.id}-${session.user.role}`} actor={session.user} />
  );
}

function Home({ actor }: { actor: PublicUser }) {
  const { data } = useSuspenseQuery(dashboardQuery(actor));
  const pendingQuotes = data.quotes.filter(
    (q) => q.status === "Borrador" && q.requiresAdminApproval && !q.adminApprovedBy
  );
  const pendingPayments = data.payments.filter((p) => p.status === "por_conciliar");
  const upcoming = data.bookings
    .filter((b) => b.status !== "cancelada" && b.startDate >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const accounting = actor.role === "Contabilidad";
  const activity = [
    ...data.requests.flatMap((r) =>
      r.history.map((h) => ({ ...h, record: r.code, destination: r.destination }))
    ),
    ...data.bookings.flatMap((b) =>
      b.history.map((h) => ({ ...h, record: b.code, destination: b.destination }))
    ),
    ...data.payments.flatMap((p) =>
      p.history.map((h) => ({ ...h, record: p.code, destination: p.clientName }))
    ),
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title={`Hola, ${actor.name.split(" ")[0]}`}
        subtitle={`${actor.branch} · ${actor.role}`}
      />

      {accounting ? (
        <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <KpiCard label="Por conciliar" tone="alert" value={pendingPayments.length} />
          <KpiCard
            label="Cotizaciones enviadas"
            value={data.quotes.filter((q) => q.status === "Enviada").length}
          />
          <KpiCard
            label="Validados (COP)"
            value={
              <span className="text-xl">
                {cop(
                  data.payments
                    .filter((p) => p.status === "validado")
                    .reduce((s, p) => s + p.amountCOP, 0)
                )}
              </span>
            }
          />
          <KpiCard
            label="Cotizaciones aprobadas"
            value={data.quotes.filter((q) => q.status === "Aprobada").length}
          />
        </div>
      ) : (
        <TravelRadarBanner cities={data.radar.cities} pulse={data.radar.pulse} />
      )}

      {(pendingQuotes.length > 0 || pendingPayments.length > 0) && (
        <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-peach/50 bg-peach-soft px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-peach-foreground">
            <Clock3 className="h-4 w-4" />
            Pendientes por resolver
          </span>
          <div className="flex flex-wrap gap-5">
            {pendingQuotes.length > 0 && (
              <Link
                to="/cotizador-ia"
                className="text-sm font-medium text-peach-foreground underline underline-offset-4"
              >
                {pendingQuotes.length} descuento{pendingQuotes.length === 1 ? "" : "s"} por aprobar
              </Link>
            )}
            {pendingPayments.length > 0 && (
              <Link
                to="/pagos"
                className="text-sm font-medium text-peach-foreground underline underline-offset-4"
              >
                {pendingPayments.length} pago{pendingPayments.length === 1 ? "" : "s"} por conciliar
              </Link>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Plane className="h-4 w-4 text-primary" />
              {accounting ? "Últimos pagos" : "Próximas salidas"}
            </h2>
            {canAccess(actor.role, accounting ? "/pagos" : "/reservas") && (
              <Link
                to={accounting ? "/pagos" : "/reservas"}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Ver todo
              </Link>
            )}
          </div>

          {accounting ? (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {data.payments
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 4)
                .map((p) => (
                  <Link
                    key={p.id}
                    to="/pagos"
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{p.clientName}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {p.code} · {fmtDate(p.date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="mb-1 text-sm font-semibold text-foreground">{cop(p.amountCOP)}</p>
                      <StatusChip status={p.status} />
                    </div>
                  </Link>
                ))}
            </div>
          ) : upcoming.length ? (
            <div className="space-y-2.5">
              {upcoming.slice(0, 4).map((b) => (
                <Link
                  key={b.id}
                  to="/reservas"
                  className="flex items-center gap-3.5 overflow-hidden rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <img
                    src={b.thumbnailUrl}
                    alt={b.destination}
                    className="h-20 w-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs text-muted-foreground">{b.code}</p>
                      <StatusChip status={b.status} />
                    </div>
                    <h3 className="mt-0.5 font-display text-base font-semibold text-foreground">
                      {b.destination}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      {fmtDate(b.startDate)} · {b.travelersCount}{" "}
                      {b.travelersCount === 1 ? "viajero" : "viajeros"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <EmptyState title="Sin próximas salidas" description="Las reservas activas aparecerán aquí." />
            </div>
          )}
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 font-display text-lg font-semibold">Actividad reciente</h2>
          {activity.length ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <ol className="space-y-3.5 border-l-2 border-border pl-3.5">
                {activity.map((h, i) => (
                  <li key={`${h.record}-${h.id}-${i}`}>
                    <p className="font-mono text-xs font-semibold text-primary">
                      {h.record} · <span className="font-sans font-medium text-foreground">{h.destination}</span>
                    </p>
                    <p className="mt-0.5 break-words text-sm text-foreground">{h.action}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {h.user} · {new Date(h.timestamp).toLocaleString("es-CO")}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <EmptyState title="Sin actividad reciente" />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
