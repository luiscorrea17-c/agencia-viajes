import { useState, type ChangeEvent } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, Download, FileCheck2, Paperclip, Plus, Undo2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { PublicUser } from "@/api/auth";
import {
  PAYMENT_STATUSES,
  canReconcile,
  reconcilePayment,
  registerPayment,
  type Payment,
  type PaymentInput,
} from "@/api/bookings";
import type { PaymentStatus } from "@/api/types";
import { paymentsQuery } from "./operations-query";
import { cop, fmtDate } from "./quote-query";
import { TableWithPanel, type Column } from "./TableWithPanel";
import { Button, ConfirmDialog, KpiCard, PageHeader, STATUS_META, StatusChip } from "./ui";
import { AuditTrail, Filters, Notice, OperationModal, fieldClass } from "./OperationUi";

export function PaymentsScreen() {
  const { session } = useAuth();
  return session ? <Payments key={`${session.user.id}-${session.user.role}`} actor={session.user} /> : null;
}

function Payments({ actor }: { actor: PublicUser }) {
  const { data: { payments, bookings } } = useSuspenseQuery(paymentsQuery(actor));
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<PaymentInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<{ payment: Payment; status: PaymentStatus } | null>(null);
  const [reason, setReason] = useState("");

  const available = bookings
    .map((b) => ({
      ...b,
      unregistered:
        b.totalCOP -
        payments
          .filter((p) => p.bookingId === b.id && (p.status === "validado" || p.status === "por_conciliar"))
          .reduce((s, p) => s + p.amountCOP, 0),
    }))
    .filter((b) => b.unregistered > 0);

  const rows = payments.filter(
    (p) =>
      (!filter || p.status === filter) &&
      `${p.code} ${p.clientName} ${p.bookingCode} ${p.reference} ${p.receiptName ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  async function run(action: () => Promise<Payment>) {
    setBusy(true);
    setMessage("");
    try {
      const p = await action();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["payments"] }),
        qc.invalidateQueries({ queryKey: ["bookings"] }),
        qc.invalidateQueries({ queryKey: ["requests"] }),
        qc.invalidateQueries({ queryKey: ["client-records"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setSelected(p.id);
      setForm(null);
      setPending(null);
      setError(false);
      setMessage(`${p.code}: ${STATUS_META[p.status].label}.`);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "No pudimos guardar el pago.");
    } finally {
      setBusy(false);
    }
  }

  const handleReceiptChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    if (file.size > 2 * 1024 * 1024) {
      setError(true);
      setMessage("El comprobante no debe superar 2 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : undefined;
      setForm((prev) =>
        prev ? { ...prev, receiptName: file.name, ...(dataUrl ? { receiptDataUrl: dataUrl } : {}) } : prev
      );
      setError(false);
      setMessage("");
    };
    reader.readAsDataURL(file);
  };

  const cols: Column<Payment>[] = [
    {
      key: "code",
      header: "Pago / cliente",
      render: (p) => (
        <div className="min-w-40">
          <div className="flex items-center gap-1.5">
            <p className="font-mono text-sm font-semibold">{p.code}</p>
            {p.receiptName && (
              <span title={`Comprobante: ${p.receiptName}`} className="text-primary">
                <Paperclip className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{p.clientName}</p>
        </div>
      ),
    },
    { key: "booking", header: "Reserva", render: (p) => <span className="font-mono text-xs">{p.bookingCode}</span> },
    { key: "amount", header: "Importe", render: (p) => <span className="whitespace-nowrap font-semibold">{cop(p.amountCOP)}</span> },
    { key: "status", header: "Estado", render: (p) => <StatusChip status={p.status} /> },
  ];

  const selectedBookingForForm = form ? available.find((b) => b.id === form.bookingId) : undefined;

  return (
    <div>
      <PageHeader
        title={actor.role === "Cliente" ? "Mis pagos" : "Pagos"}
        subtitle={
          actor.role === "Cliente"
            ? "Registra abonos parciales o totales, adjunta tu comprobante y consulta su validación."
            : "Concilia abonos recibidos, verifica comprobantes y gestiona devoluciones."
        }
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setMessage("");
              setError(false);
              setForm({
                bookingId: available[0]?.id ?? "",
                amountCOP: 0,
                method: "Transferencia",
                reference: "",
                date: new Date().toISOString().slice(0, 10),
                notes: "",
              });
            }}
          >
            <Plus className="h-4 w-4" />
            Registrar abono
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Por conciliar" value={payments.filter((p) => p.status === "por_conciliar").length} tone="alert" />
        <KpiCard
          label="Validado"
          value={
            <span className="text-xl">
              {cop(payments.filter((p) => p.status === "validado").reduce((s, p) => s + p.amountCOP, 0))}
            </span>
          }
        />
        <KpiCard
          label="Devuelto"
          value={
            <span className="text-xl">
              {cop(payments.filter((p) => p.status === "devuelto").reduce((s, p) => s + p.amountCOP, 0))}
            </span>
          }
        />
      </div>

      <Notice error={error} text={message} onDismiss={() => setMessage("")} />
      <Filters
        search={search}
        onSearch={setSearch}
        status={filter}
        onStatus={setFilter}
        options={PAYMENT_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))}
        label="pagos"
        placeholder="Buscar pago, reserva, cliente o referencia…"
      />

      <TableWithPanel
        rows={rows}
        columns={cols}
        getId={(p) => p.id}
        selectedId={selected}
        onSelect={setSelected}
        collapseEmptyPanel
        panelLabel="Detalle del pago"
        emptyTitle="Sin pagos"
        renderPanel={(p) => {
          const linkedBooking = bookings.find((b) => b.id === p.bookingId);
          return (
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                {p.code} · {p.bookingCode}
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-semibold">{cop(p.amountCOP)}</h2>
              <div className="mt-2.5">
                <StatusChip status={p.status} />
              </div>

              <dl className="my-4 space-y-2.5 border-y border-border py-4 text-sm">
                {[
                  ["Cliente", p.clientName],
                  ["Medio de pago", p.method],
                  ["Referencia", p.reference],
                  ["Fecha de pago", fmtDate(p.date)],
                  ...(linkedBooking ? [["Límite de la reserva", fmtDate(linkedBooking.paymentDueDate)]] : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="break-words">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mb-4 rounded-xl border border-border bg-muted/35 p-3 text-xs">
                <p className="font-semibold text-foreground">Comprobante de pago</p>
                {p.receiptName ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-foreground">
                        <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{p.receiptName}</span>
                      </span>
                      {p.receiptDataUrl && (
                        <a
                          href={p.receiptDataUrl}
                          download={p.receiptName}
                          className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Descargar
                        </a>
                      )}
                    </div>
                    {p.receiptDataUrl?.startsWith("data:image/") && (
                      <img
                        src={p.receiptDataUrl}
                        alt={`Comprobante ${p.code}`}
                        className="max-h-44 w-full rounded-lg border border-border object-contain bg-card"
                      />
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">Sin soporte adjunto.</p>
                )}
              </div>

              {p.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}

              {canReconcile(actor) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(p.status === "por_conciliar"
                    ? (["validado", "rechazado"] as const)
                    : p.status === "validado"
                      ? (["devuelto"] as const)
                      : []
                  ).map((s) => (
                    <Button
                      key={s}
                      variant={s === "validado" ? "primary" : "destructive"}
                      onClick={() => {
                        setReason("");
                        setPending({ payment: p, status: s });
                      }}
                    >
                      {s === "validado" ? <Check className="h-4 w-4" /> : s === "devuelto" ? <Undo2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      {s === "validado" ? "Validar" : s === "devuelto" ? "Devolver" : "Rechazar"}
                    </Button>
                  ))}
                </div>
              )}

              <AuditTrail history={p.history} />
            </div>
          );
        }}
      />

      <p className="mt-3 text-xs text-muted-foreground">
        {rows.length} de {payments.length} pagos
      </p>

      {form && (
        <OperationModal
          title="Registrar pago"
          subtitle="Abono parcial o pago total con comprobante"
          onClose={() => !busy && setForm(null)}
        >
          <Notice error={error} text={message} />
          {available.length ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => registerPayment(actor, form));
              }}
            >
              <label className="block text-sm font-medium">
                Reserva
                <select
                  required
                  value={form.bookingId}
                  onChange={(e) => setForm({ ...form, bookingId: e.target.value })}
                  className={fieldClass}
                >
                  {available.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.clientName} · {b.destination}
                    </option>
                  ))}
                </select>
              </label>

              {selectedBookingForForm && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                  <span>
                    Saldo sin registrar: <strong className="text-foreground">{cop(selectedBookingForForm.unregistered)}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Fecha límite: <strong className="text-foreground">{fmtDate(selectedBookingForForm.paymentDueDate)}</strong>
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <label className="text-sm font-medium">
                  Importe (COP)
                  <input
                    required
                    type="number"
                    min="1"
                    max={selectedBookingForForm?.unregistered}
                    value={form.amountCOP || ""}
                    onChange={(e) => setForm({ ...form, amountCOP: Number(e.target.value) })}
                    className={fieldClass}
                  />
                </label>
                <label className="text-sm font-medium">
                  Fecha
                  <input
                    required
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className={fieldClass}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Medio
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value as Payment["method"] })}
                    className={fieldClass}
                  >
                    <option>Transferencia</option>
                    <option>Consignación</option>
                    <option>Efectivo</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Referencia
                  <input
                    required
                    placeholder="N.º de transacción"
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    className={fieldClass}
                  />
                </label>
              </div>

              <div className="text-sm font-medium">
                <span>Comprobante (imagen o PDF, opcional)</span>
                {form.receiptName ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{form.receiptName}</span>
                    </span>
                    <button
                      type="button"
                      className="text-destructive hover:underline"
                      onClick={() => {
                        const { receiptName: _rn, receiptDataUrl: _rd, ...rest } = form;
                        setForm(rest);
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    aria-label="Adjuntar comprobante"
                    onChange={handleReceiptChange}
                    className="mt-1.5 block w-full text-xs text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
                  />
                )}
              </div>

              <label className="block text-sm font-medium">
                Notas (opcional)
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={fieldClass}
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" disabled={busy} onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button variant="primary" type="submit" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar pago"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">No tienes reservas con saldo pendiente por registrar.</p>
          )}
        </OperationModal>
      )}

      <ConfirmDialog
        open={!!pending}
        title={
          pending?.status === "validado"
            ? "¿Validar pago?"
            : pending?.status === "devuelto"
              ? "¿Devolver pago?"
              : "¿Rechazar pago?"
        }
        confirmLabel={
          pending?.status === "validado"
            ? "Validar pago"
            : pending?.status === "devuelto"
              ? "Devolver pago"
              : "Rechazar pago"
        }
        destructive={pending?.status !== "validado"}
        description={
          <div>
            <p>
              {pending?.payment.code} · {cop(pending?.payment.amountCOP ?? 0)}
              {pending?.payment.receiptName ? ` · Soporte: ${pending.payment.receiptName}` : ""}
            </p>
            <label className="mt-3 block">
              Motivo
              <textarea className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </label>
            <Notice error={error} text={error ? message : ""} />
          </div>
        }
        onCancel={() => !busy && setPending(null)}
        onConfirm={() => (pending ? run(() => reconcilePayment(actor, pending.payment.id, pending.status, reason)) : undefined)}
      />
    </div>
  );
}