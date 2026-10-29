import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, CalendarClock, Check, CreditCard, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DOC_TYPES, type DocType } from "@/api/clients";
import {
  BOOKING_STATUSES,
  DEFAULT_BOOKING_CONDITIONS,
  canManageBooking,
  changeBooking,
  createBooking,
  type Booking,
  type BookingSource,
  type BookingTraveler,
} from "@/api/bookings";
import type { PublicUser } from "@/api/auth";
import type { BookingStatus } from "@/api/types";
import { bookingsQuery } from "./operations-query";
import { cop, fmtDate } from "./quote-query";
import { TableWithPanel, type Column } from "./TableWithPanel";
import { Button, ConfirmDialog, KpiCard, MaskedField, PageHeader, STATUS_META, StatusChip } from "./ui";
import { AuditTrail, CollapsibleSection, Filters, Notice, OperationModal, fieldClass } from "./OperationUi";

export function BookingsScreen() {
  const { session } = useAuth();
  return session ? <Bookings key={`${session.user.id}-${session.user.role}`} actor={session.user} /> : null;
}

function Bookings({ actor }: { actor: PublicUser }) {
  const { data: { bookings, sources } } = useSuspenseQuery(bookingsQuery(actor));
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<{ booking: Booking; status: BookingStatus } | null>(null);
  const manage = canManageBooking(actor);
  const today = new Date().toISOString().slice(0, 10);

  const rows = bookings.filter(
    (b) =>
      (!filter || b.status === filter) &&
      `${b.code} ${b.clientName} ${b.destination}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))
  );

  async function run(action: () => Promise<Booking>) {
    setBusy(true);
    setMessage("");
    try {
      const b = await action();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bookings"] }),
        qc.invalidateQueries({ queryKey: ["requests"] }),
        qc.invalidateQueries({ queryKey: ["client-records"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setSelected(b.id);
      setNewOpen(false);
      setPending(null);
      setError(false);
      setMessage(`${b.code} actualizada correctamente.`);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "No pudimos guardar la reserva.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Booking>[] = [
    {
      key: "destination",
      header: "Reserva / destino",
      render: (b) => (
        <div className="flex min-w-44 items-center gap-3">
          <img src={b.thumbnailUrl} alt={b.destination} className="h-12 w-12 rounded-lg object-cover" />
          <div>
            <p className="font-semibold">{b.destination}</p>
            <p className="font-mono text-xs text-muted-foreground">{b.code}</p>
            <p className="text-xs text-muted-foreground">{b.clientName}</p>
          </div>
        </div>
      ),
    },
    { key: "date", header: "Salida", render: (b) => <span className="whitespace-nowrap">{fmtDate(b.startDate)}</span> },
    {
      key: "due",
      header: "Límite pago",
      render: (b) => {
        const overdue = b.status === "pendiente_pago" && b.paymentDueDate < today;
        return (
          <span className={overdue ? "whitespace-nowrap font-medium text-destructive" : "whitespace-nowrap text-xs text-muted-foreground"}>
            {fmtDate(b.paymentDueDate)}
          </span>
        );
      },
    },
    { key: "status", header: "Estado", render: (b) => <StatusChip status={b.status} /> },
    { key: "balance", header: "Saldo", render: (b) => <div className="whitespace-nowrap font-semibold">{cop(b.totalCOP - b.paidCOP)}</div> },
  ];

  return (
    <div>
      <PageHeader
        title={actor.role === "Cliente" ? "Mis reservas" : "Reservas"}
        subtitle={
          actor.role === "Cliente"
            ? "Viajeros registrados, servicios contratados, fecha límite y saldo pendiente."
            : "Emite reservas desde cotizaciones aprobadas con viajeros nominados, condiciones y fecha límite."
        }
        actions={
          manage && (
            <Button
              variant="primary"
              onClick={() => {
                setNewOpen(true);
                setMessage("");
                setError(false);
              }}
            >
              <Plus className="h-4 w-4" />
              Emitir reserva
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Reservas" value={bookings.length} />
        <KpiCard label="Pendientes de pago" value={bookings.filter((b) => b.status === "pendiente_pago").length} tone="alert" />
        <KpiCard label="Confirmadas" value={bookings.filter((b) => b.status === "confirmada").length} />
        <KpiCard label="En modificación" value={bookings.filter((b) => b.status === "en_modificacion").length} />
      </div>

      <Notice error={error} text={message} onDismiss={() => setMessage("")} />
      <Filters
        search={search}
        onSearch={setSearch}
        status={filter}
        onStatus={setFilter}
        label="reservas"
        options={BOOKING_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))}
      />

      <TableWithPanel
        rows={rows}
        columns={columns}
        getId={(b) => b.id}
        selectedId={selected}
        onSelect={setSelected}
        collapseEmptyPanel
        panelLabel="Detalle de reserva"
        emptyTitle="Sin reservas"
        renderPanel={(b) => {
          const overdue = b.status === "pendiente_pago" && b.paymentDueDate < today;
          const missingTravelers = Math.max(0, b.travelersCount - b.travelers.length);
          return (
            <div>
              <img src={b.thumbnailUrl} alt={b.destination} className="aspect-video w-full rounded-lg object-cover" />
              <p className="mt-4 font-mono text-xs text-muted-foreground">{b.code}</p>
              <h2 className="mb-2.5 font-display text-xl font-semibold">{b.destination}</h2>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusChip status={b.status} />
                {b.status !== "cancelada" && (
                  <Link
                    to="/pagos"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    {b.totalCOP - b.paidCOP > 0 ? "Registrar pago" : "Ver pagos"}
                  </Link>
                )}
              </div>

              <dl className="my-4 space-y-2.5 border-y border-border py-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Cliente</dt>
                  <dd>{b.clientName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Salida y regreso</dt>
                  <dd>
                    {fmtDate(b.startDate)} — {fmtDate(b.endDate)} · {b.travelersCount} viajeros
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Fecha límite de pago
                  </dt>
                  <dd className={overdue ? "font-semibold text-destructive" : "font-medium"}>
                    {fmtDate(b.paymentDueDate)} {overdue && "(Vencida)"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total acordado</dt>
                  <dd>{cop(b.totalCOP)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Pagos validados</dt>
                  <dd>{cop(b.paidCOP)}</dd>
                </div>
                <div className="flex justify-between font-semibold text-primary">
                  <dt>Saldo pendiente</dt>
                  <dd>{cop(b.totalCOP - b.paidCOP)}</dd>
                </div>
              </dl>

              {b.notes && <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{b.notes}</p>}

              <CollapsibleSection
                title="Viajeros asociados"
                count={b.travelers.length}
                defaultOpen={missingTravelers > 0}
              >
                <div className="space-y-3">
                  {missingTravelers > 0 && (
                    <p className="flex items-start gap-2 rounded-lg border border-peach/40 bg-peach-soft px-3 py-2 text-xs text-peach-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Faltan {missingTravelers} de {b.travelersCount} viajeros por nominar en el expediente.
                    </p>
                  )}
                  {b.travelers.map((t) => (
                    <div key={t.id} className="space-y-1 border-l-2 border-border pl-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{t.fullName}</p>
                        {t.isMinor && (
                          <span className="rounded-full bg-peach-soft px-2 py-0.5 text-[11px] font-medium text-peach-foreground">
                            Menor de edad
                          </span>
                        )}
                      </div>
                      <MaskedField label={t.docType} value={t.docNumber} canReveal />
                      {t.passportExpiry && (
                        <p className="text-xs text-muted-foreground">Pasaporte vence: {fmtDate(t.passportExpiry)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <div className="mt-3">
                <CollapsibleSection title="Servicios y condiciones" count={b.agreedItems.length}>
                  <div className="space-y-3 text-xs">
                    {b.agreedItems.length > 0 && (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {b.agreedItems.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="min-w-0 truncate text-foreground">
                              {item.category}: {item.description}
                            </span>
                            <span className="shrink-0 font-medium">{cop(item.quantity * item.unitPriceCOP)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div>
                      <p className="font-semibold text-foreground">Condiciones acordadas</p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">{b.conditions}</p>
                    </div>
                  </div>
                </CollapsibleSection>
              </div>

              {manage && b.status !== "cancelada" && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  {(b.status === "confirmada" || b.status === "en_modificacion") && (
                    <Button
                      onClick={() => {
                        setReason("");
                        setPending({ booking: b, status: b.status === "confirmada" ? "en_modificacion" : "confirmada" });
                      }}
                    >
                      {b.status === "confirmada" ? <Pencil className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      {b.status === "confirmada" ? "Modificar" : "Confirmar cambios"}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setReason("");
                      setPending({ booking: b, status: "cancelada" });
                    }}
                  >
                    <Ban className="h-4 w-4" />
                    Cancelar reserva
                  </Button>
                </div>
              )}

              <AuditTrail history={b.history} />
            </div>
          );
        }}
      />

      <p className="mt-3 text-xs text-muted-foreground">
        {rows.length} de {bookings.length} reservas
      </p>

      {newOpen && (
        <NewBookingModal
          sources={sources}
          busy={busy}
          error={error}
          message={message}
          onClose={() => !busy && setNewOpen(false)}
          onSubmit={(quoteId, options) => run(() => createBooking(actor, quoteId, options))}
        />
      )}

      <ConfirmDialog
        open={!!pending}
        title={pending?.status === "cancelada" ? "¿Cancelar reserva?" : "Actualizar reserva"}
        destructive={pending?.status === "cancelada"}
        confirmLabel={pending?.status === "cancelada" ? "Cancelar reserva" : "Guardar cambio"}
        description={
          <div>
            <p>
              {pending?.booking.code} · {pending ? STATUS_META[pending.status].label : ""}
            </p>
            <label className="mt-3 block">
              Motivo del cambio
              <textarea required value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} rows={3} />
            </label>
            <Notice error={error} text={error ? message : ""} />
          </div>
        }
        onCancel={() => !busy && setPending(null)}
        onConfirm={() => (pending ? run(() => changeBooking(actor, pending.booking.id, pending.status, reason)) : undefined)}
      />
    </div>
  );
}

function NewBookingModal({
  sources,
  busy,
  error,
  message,
  onClose,
  onSubmit,
}: {
  sources: BookingSource[];
  busy: boolean;
  error: boolean;
  message: string;
  onClose: () => void;
  onSubmit: (
    quoteId: string,
    options: { travelers: BookingTraveler[]; paymentDueDate: string; conditions: string }
  ) => Promise<void>;
}) {
  const first = sources[0];
  const [quoteId, setQuoteId] = useState(first?.id ?? "");
  const current = sources.find((s) => s.id === quoteId) ?? first;
  const [paymentDueDate, setPaymentDueDate] = useState(current?.defaultPaymentDueDate ?? "");
  const [conditions, setConditions] = useState(DEFAULT_BOOKING_CONDITIONS);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    (current?.candidateTravelers ?? []).slice(0, current?.travelersCount ?? 1).map((t) => t.id)
  );
  const [extraTravelers, setExtraTravelers] = useState<BookingTraveler[]>([]);

  const handleSelectSource = (nextId: string) => {
    setQuoteId(nextId);
    const next = sources.find((s) => s.id === nextId);
    if (next) {
      setPaymentDueDate(next.defaultPaymentDueDate);
      setSelectedIds(next.candidateTravelers.slice(0, next.travelersCount).map((t) => t.id));
      setExtraTravelers([]);
    }
  };

  const toggleCandidate = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!current) return;
    const fromDossier = current.candidateTravelers.filter((t) => selectedIds.includes(t.id));
    const validExtras = extraTravelers.filter((t) => t.fullName.trim() && t.docNumber.trim());
    void onSubmit(current.id, {
      travelers: [...fromDossier, ...validExtras],
      paymentDueDate,
      conditions,
    });
  };

  return (
    <OperationModal
      title="Emitir reserva"
      subtitle="Asocia los viajeros, fecha límite de pago y condiciones acordadas"
      maxWidthClass="max-w-xl"
      onClose={onClose}
    >
      <Notice error={error} text={message} />
      {sources.length && current ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            Cotización aprobada
            <select className={fieldClass} value={current.id} onChange={(e) => handleSelectSource(e.target.value)}>
              {sources.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.code} · {q.clientName} · {q.destination}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">
                Salida {fmtDate(current.startDate)} · {current.travelersCount} viajeros solicitados
              </p>
              <p className="font-display text-lg font-semibold text-primary">{cop(current.totalCOP)}</p>
            </div>
            <label className="text-xs font-medium text-foreground">
              Fecha límite de pago
              <input
                required
                type="date"
                max={current.startDate}
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
                className="mt-1 block rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                Viajeros asociados ({selectedIds.length + extraTravelers.length}/{current.travelersCount})
              </span>
              <Button
                type="button"
                variant="ghost"
                className="min-h-7 px-2 py-1 text-xs"
                onClick={() =>
                  setExtraTravelers((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), fullName: "", docType: "CC", docNumber: "", isMinor: false },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Otro viajero
              </Button>
            </div>

            <div className="space-y-1.5 rounded-xl border border-border p-3">
              {current.candidateTravelers.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center justify-between gap-2 py-1 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selectedIds.includes(t.id)}
                      onChange={() => toggleCandidate(t.id)}
                    />
                    <span className="font-medium">{t.fullName}</span>
                    {t.isMinor && (
                      <span className="rounded bg-peach-soft px-1.5 py-0.5 text-[11px] text-peach-foreground">Menor</span>
                    )}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.docType} · {t.docNumber}
                  </span>
                </label>
              ))}

              {extraTravelers.map((extra) => (
                <div key={extra.id} className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-[1fr_84px_120px_auto]">
                  <input
                    required
                    placeholder="Nombre completo"
                    value={extra.fullName}
                    onChange={(e) =>
                      setExtraTravelers((prev) =>
                        prev.map((x) => (x.id === extra.id ? { ...x, fullName: e.target.value } : x))
                      )
                    }
                    className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm"
                  />
                  <select
                    aria-label="Tipo documento"
                    value={extra.docType}
                    onChange={(e) =>
                      setExtraTravelers((prev) =>
                        prev.map((x) => (x.id === extra.id ? { ...x, docType: e.target.value as DocType } : x))
                      )
                    }
                    className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm"
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="Documento"
                    value={extra.docNumber}
                    onChange={(e) =>
                      setExtraTravelers((prev) =>
                        prev.map((x) => (x.id === extra.id ? { ...x, docNumber: e.target.value } : x))
                      )
                    }
                    className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive"
                    aria-label="Quitar viajero"
                    onClick={() => setExtraTravelers((prev) => prev.filter((x) => x.id !== extra.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium">
            Condiciones acordadas
            <textarea
              required
              rows={2}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              className={fieldClass}
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Emitiendo…" : "Crear reserva"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">No hay cotizaciones aprobadas pendientes de emitir.</p>
      )}
    </OperationModal>
  );
}