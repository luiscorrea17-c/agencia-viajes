import { Suspense, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, CircleCheck, Clock3, FileText, Mail, MapPin, Pencil, Phone, Plus, Users, Wand2 } from "lucide-react";
import { REQUEST_STATUSES, type TravelRequest, type RequestActor, type RequestInput, type RequestStatus } from "@/api";
import { useAuth } from "@/lib/auth";
import { ModulePlaceholder } from "./ModulePlaceholder";
import { AuditTrail, Filters, Notice } from "./OperationUi";
import { TravelOffersBanner } from "./TravelOffersBanner";
import { Button, KpiCard, LoadingState, PageHeader, StatusChip } from "./ui";
import { TableWithPanel, type Column } from "./TableWithPanel";
import { RequestForm } from "./RequestForm";
import { requestQuery } from "./request-query";

const cop = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" }).format(new Date(`${value}T12:00:00Z`));

export function RequestsScreen({ portal = false }: { portal?: boolean }) {
  const { session } = useAuth();
  if (!session) return null;
  if (portal && session.user.role !== "Cliente") return <ModulePlaceholder title="Inicio" />;
  return <Suspense fallback={<LoadingState label="Cargando solicitudes…" />}><RequestList key={`${session.user.id}-${session.user.role}`} actor={session.user} /></Suspense>;
}

function RequestList({ actor }: { actor: RequestActor }) {
  const queryClient = useQueryClient();
  const { data: { requests, clients } } = useSuspenseQuery(requestQuery(actor));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ request: TravelRequest | null; prefill?: Partial<RequestInput> | undefined } | null>(null);
  const [notice, setNotice] = useState("");
  const customer = actor.role === "Cliente";
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rows = requests.filter((request) => (!status || request.status === status) && normalize(`${request.destination} ${request.clientName} ${request.code}`).includes(normalize(search)));
  const columns: Column<TravelRequest>[] = [
    { key: "name", header: "Solicitud / destino", render: (request) => <div className="flex min-w-48 items-center gap-3">
      <img src={request.thumbnailUrl} alt={request.destination} width={1024} height={768} loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      <div><p className="font-semibold text-foreground">{request.destination}</p><p className="mt-0.5 font-mono text-xs text-muted-foreground">{request.code}</p>{!customer && <p className="mt-0.5 text-xs text-muted-foreground">{request.clientName}</p>}</div>
    </div> },
    { key: "status", header: "Estado", render: (request) => <StatusChip status={request.status} /> },
    { key: "dates", header: "Fechas", render: (request) => <div className="min-w-32 whitespace-nowrap text-xs"><p>{date(request.startDate)}</p><p className="mt-0.5 text-muted-foreground">al {date(request.endDate)}</p></div> },
    { key: "budget", header: "Presupuesto", render: (request) => <div className="whitespace-nowrap"><p className="font-semibold">{cop(request.budgetCOP)}</p><p className="mt-0.5 text-xs text-muted-foreground">{request.travelersCount} {request.travelersCount === 1 ? "viajero" : "viajeros"}</p></div> },
  ];
  return <div>
    <PageHeader title={customer ? "Mis solicitudes" : "Solicitudes"} subtitle={customer ? "Indica destino, fechas y presupuesto para que tu asesor arme una propuesta." : "Gestiona solicitudes de viaje y abre cotizaciones."}
      actions={<Button variant="primary" onClick={() => setForm({ request: null })}><Plus className="h-4 w-4" />{customer ? "Pedir viaje" : "Registrar solicitud"}</Button>} />
    {customer ? (
      <TravelOffersBanner
        onSelectOffer={(offer) => {
          const start = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
          const nightsMatch = /(\d+)\s*noches/i.exec(offer.duration);
          const nights = nightsMatch ? Number(nightsMatch[1]) : 4;
          const end = new Date(Date.now() + (21 + nights) * 86400000).toISOString().slice(0, 10);
          setForm({
            request: null,
            prefill: {
              destination: offer.destination,
              startDate: start,
              endDate: end,
              budgetCOP: offer.priceCOP * 2,
              travelersCount: 2,
              notes: `${offer.title}. ${offer.includes}.`,
            },
          });
        }}
      />
    ) : (
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total" value={<span className="flex items-center justify-between">{requests.length}<FileText className="h-4 w-4 text-muted-foreground" /></span>} />
        <KpiCard label="Abiertas" tone="alert" value={<span className="flex items-center justify-between">{requests.filter((r) => r.status === "Abierta").length}<Clock3 className="h-4 w-4" /></span>} />
        <KpiCard label="En cotización" value={<span className="flex items-center justify-between">{requests.filter((r) => r.status === "En cotización").length}<FileText className="h-4 w-4 text-info" /></span>} />
        <KpiCard label="Cerradas" value={<span className="flex items-center justify-between">{requests.filter((r) => r.status === "Cerrada").length}<CircleCheck className="h-4 w-4 text-muted-foreground" /></span>} />
      </div>
    )}
    <Notice text={notice} onDismiss={() => setNotice("")} />
    <Filters
      search={search}
      onSearch={setSearch}
      status={status}
      onStatus={(s) => setStatus(s as RequestStatus | "")}
      options={REQUEST_STATUSES.map((s) => ({ value: s, label: s }))}
      label="solicitudes"
      placeholder="Buscar destino, cliente o código…"
    />
    <TableWithPanel rows={rows} columns={columns} getId={(r) => r.id} selectedId={selectedId} onSelect={setSelectedId} collapseEmptyPanel
      panelLabel="Detalle de solicitud"
      emptyTitle={search || status ? "Sin coincidencias" : "Sin solicitudes registradas"}
      emptyDescription={search || status ? "Limpia la búsqueda o cambia el estado seleccionado." : "Registra destino, fechas tentativas y número de viajeros."}
      renderPanel={(request) => <RequestDetail request={request} actor={actor} onEdit={() => setForm({ request })} />} />
    <p className="mt-3 text-xs text-muted-foreground">{rows.length} de {requests.length} solicitudes</p>
    {form && <RequestForm actor={actor} clients={clients} request={form.request} prefill={form.prefill} onClose={() => setForm(null)} onSaved={async (request) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requests"] }),
        queryClient.invalidateQueries({ queryKey: ["client-records"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setSearch(""); setStatus(""); setSelectedId(request.id); setForm(null);
      setNotice(form.request ? "Solicitud actualizada correctamente." : `Solicitud ${request.code} creada correctamente.`);
    }} />}
  </div>;
}

function RequestDetail({ request, actor, onEdit }: { request: TravelRequest; actor: RequestActor; onEdit: () => void }) {
  return <div>
    <img src={request.thumbnailUrl} alt={request.destination} width={1024} height={768} loading="lazy" className="aspect-[16/9] w-full rounded-lg object-cover" />
    <div className="mt-4 flex items-start justify-between gap-2"><div><p className="font-mono text-xs text-muted-foreground">{request.code}</p><h2 className="mt-1 flex items-center gap-1.5 break-words font-display text-xl font-semibold"><MapPin className="h-4 w-4 shrink-0 text-primary" />{request.destination}</h2></div><Button variant="ghost" onClick={onEdit} title="Editar solicitud" aria-label="Editar solicitud" className="h-8 w-8 shrink-0 p-0"><Pencil className="h-4 w-4" /></Button></div>
    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
      <StatusChip status={request.status} />
      {actor.role === "Asesor" && request.status !== "Cerrada" && (
        <Link
          to="/cotizador-ia"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Cotizar con IA
        </Link>
      )}
      {actor.role === "Cliente" && request.status === "En cotización" && (
        <Link
          to="/mis-cotizaciones"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Ver cotizaciones
        </Link>
      )}
    </div>
    <dl className="mt-4 space-y-3 border-y border-border py-4 text-sm">
      <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><dt className="text-xs text-muted-foreground">Fechas</dt><dd className="mt-0.5">{date(request.startDate)} — {date(request.endDate)}</dd></div></div>
      <div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><dt className="text-xs text-muted-foreground">Viajeros</dt><dd className="mt-0.5">{request.travelersCount} {request.travelersCount === 1 ? "persona" : "personas"}</dd></div></div>
      <div><dt className="text-xs text-muted-foreground">Presupuesto</dt><dd className="mt-0.5 text-lg font-semibold text-primary">{cop(request.budgetCOP)}</dd></div>
    </dl>
    <section className="mt-4"><h3 className="text-sm font-semibold">Cliente</h3><p className="mt-1.5 text-sm">{request.clientName}</p><p className="mt-1.5 flex items-start gap-2 break-all text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" />{request.clientEmail}</p><p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" />{request.clientPhone}</p></section>
    {request.notes && <section className="mt-4 border-t border-border pt-3"><h3 className="text-sm font-semibold">Notas</h3><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{request.notes}</p></section>}
    <AuditTrail history={request.history} />
  </div>;
}