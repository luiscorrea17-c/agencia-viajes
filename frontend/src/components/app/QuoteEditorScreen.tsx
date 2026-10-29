import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, Plus, Save, Send, Sparkles, Trash2, Wand2, X } from "lucide-react";
import {
  approveDiscount,
  canApproveDiscount,
  canEditQuote,
  computeBudgetDistribution,
  computeTotals,
  createQuoteFromRequest,
  saveQuoteDraft,
  sendQuote,
  MAX_DISCOUNT_WITHOUT_APPROVAL,
  SERVICE_CATEGORIES,
  type Quote,
  type QuoteDraftInput,
  type QuoteServiceItem,
  type RequestActor,
  type ServiceCategory,
} from "@/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { CollapsibleSection, Notice, fieldClass } from "./OperationUi";
import { Button, ConfirmDialog, EmptyState, KpiCard, PageHeader, StatusChip } from "./ui";
import { cop, fmtDate, quoteQuery } from "./quote-query";
import { requestQuery } from "./request-query";

const cellInput =
  "w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:bg-muted disabled:text-muted-foreground";

export function AiBadge({ edited }: { edited?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-ai/25 bg-ai-soft px-2 py-0.5 text-xs font-medium text-ai">
      <Sparkles className="h-3 w-3" aria-hidden />
      {edited ? "IA · editado" : "Sugerido por IA"}
    </span>
  );
}

export function QuoteEditorScreen() {
  const { session } = useAuth();
  if (!session) return null;
  return <Editor actor={session.user} />;
}

function Editor({ actor }: { actor: RequestActor }) {
  const qc = useQueryClient();
  const { data: quotes } = useSuspenseQuery(quoteQuery(actor));
  const [selectedId, setSelectedId] = useState<string | null>(quotes[0]?.id ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdvisor = actor.role === "Asesor";
  const requests = useQuery({ ...requestQuery(actor), enabled: isAdvisor });
  const [requestId, setRequestId] = useState("");
  const available = (requests.data?.requests ?? []).filter(
    (r) =>
      r.status !== "Cerrada" &&
      !quotes.some(
        (q) =>
          q.requestId === r.id &&
          (q.status === "Borrador" || q.status === "Enviada" || q.status === "Aprobada")
      )
  );

  const refresh = (q: Quote, msg: string) => {
    qc.setQueryData(quoteQuery(actor).queryKey, (old: Quote[] | undefined) => {
      const list = old ?? [];
      return list.some((x) => x.id === q.id) ? list.map((x) => (x.id === q.id ? q : x)) : [q, ...list];
    });
    void qc.invalidateQueries({ queryKey: ["quotes"] });
    void qc.invalidateQueries({ queryKey: ["requests"] });
    void qc.invalidateQueries({ queryKey: ["client-records"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    setSelectedId(q.id);
    setNotice(msg);
    setError(null);
  };

  const onFail = (e: unknown) => {
    setError(e instanceof Error ? e.message : "Ocurrió un error.");
    setNotice(null);
  };

  const create = useMutation({
    mutationFn: () => createQuoteFromRequest(actor, requestId),
    onSuccess: (q) => {
      setRequestId("");
      refresh(q, `Borrador ${q.code} creado con propuesta de IA.`);
    },
    onError: onFail,
  });

  const selected = quotes.find((q) => q.id === selectedId) ?? null;
  const pendingApproval = quotes.filter(
    (q) => q.status === "Borrador" && q.requiresAdminApproval && !q.adminApprovedBy
  ).length;

  return (
    <div>
      <PageHeader
        title="Cotizador IA"
        subtitle={
          isAdvisor
            ? "Distribución preliminar del presupuesto, servicios y vigencia con apoyo de IA."
            : actor.role === "Administrador"
              ? `Revisa cotizaciones y aprueba descuentos mayores al ${MAX_DISCOUNT_WITHOUT_APPROVAL}%.`
              : "Consulta tarifas e impuestos aprobados."
        }
        actions={
          isAdvisor && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Solicitud a cotizar"
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">
                  {requests.isLoading
                    ? "Cargando solicitudes…"
                    : available.length
                      ? "Seleccionar solicitud…"
                      : "Sin solicitudes disponibles"}
                </option>
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.clientName} · {r.destination}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={!requestId || create.isPending}
                onClick={() => create.mutate()}
              >
                <Wand2 className="h-4 w-4" />
                {create.isPending ? "Generando…" : "Generar con IA"}
              </Button>
            </div>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard label="Total" value={quotes.length} />
        <KpiCard label="Borradores" value={quotes.filter((q) => q.status === "Borrador").length} />
        <KpiCard label="Enviadas" value={quotes.filter((q) => q.status === "Enviada").length} />
        <KpiCard
          label="Por aprobar descuento"
          value={pendingApproval}
          tone={pendingApproval ? "alert" : "default"}
        />
      </div>

      <Notice text={notice ?? ""} onDismiss={() => setNotice(null)} />
      <Notice error text={error ?? ""} onDismiss={() => setError(null)} />

      {/* Lista de cotizaciones sin panel lateral redundante */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {quotes.length === 0 ? (
          <EmptyState
            title="Aún no hay cotizaciones"
            description={
              isAdvisor
                ? "Elige una solicitud arriba y pulsa Generar con IA."
                : "Las cotizaciones aparecerán en esta tabla."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/65 text-left text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Cotización</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="hidden px-4 py-3 md:table-cell">Vigencia</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {quotes.map((q) => {
                  const isSelected = q.id === selectedId;
                  return (
                    <tr
                      key={q.id}
                      tabIndex={0}
                      aria-selected={isSelected}
                      onClick={() => setSelectedId(isSelected ? null : q.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(isSelected ? null : q.id);
                        }
                      }}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        isSelected && "bg-primary-soft/55 shadow-[inset_3px_0_0_0_var(--primary)]"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className="font-mono text-xs font-semibold text-foreground">{q.code}</p>
                          {q.version > 1 && (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                              v{q.version}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground">{q.destination}</p>
                      </td>
                      <td className="px-4 py-3">{q.clientName}</td>
                      <td className="px-4 py-3 font-semibold">{cop(q.totalCOP)}</td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {fmtDate(q.validUntil)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={q.status} />
                          {q.status === "Borrador" &&
                            q.requiresAdminApproval &&
                            !q.adminApprovedBy && (
                              <span className="text-xs font-medium text-peach-foreground">
                                Requiere aprobación
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <QuoteDetail
          key={`${selected.id}-${selected.updatedAt}`}
          quote={selected}
          actor={actor}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
          onFail={onFail}
        />
      )}
    </div>
  );
}

export function Totals({
  quote,
}: {
  quote: Pick<
    Quote,
    | "basePriceCOP"
    | "seasonSurchargePercent"
    | "seasonSurchargeCOP"
    | "discountPercent"
    | "discountCOP"
    | "totalCOP"
  >;
}) {
  const row = (l: string, v: string) => (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{l}</dt>
      <dd className="font-medium text-foreground">{v}</dd>
    </div>
  );
  return (
    <dl className="space-y-1.5 rounded-xl border border-border bg-muted/35 p-4 text-sm">
      {row("Subtotal servicios", cop(quote.basePriceCOP))}
      {row(`Temporada (${quote.seasonSurchargePercent}%)`, `+ ${cop(quote.seasonSurchargeCOP)}`)}
      {row(`Descuento (${quote.discountPercent}%)`, `− ${cop(quote.discountCOP)}`)}
      <div className="flex justify-between border-t border-border pt-2.5 text-base font-semibold">
        <dt>Total</dt>
        <dd className="text-primary">{cop(quote.totalCOP)}</dd>
      </div>
    </dl>
  );
}

function QuoteDetail({
  quote,
  actor,
  onClose,
  onSaved,
  onFail,
}: {
  quote: Quote;
  actor: RequestActor;
  onClose: () => void;
  onSaved: (q: Quote, m: string) => void;
  onFail: (e: unknown) => void;
}) {
  const editable = canEditQuote(actor, quote);
  const [draft, setDraft] = useState<QuoteDraftInput>({
    commercialDescription: quote.commercialDescription,
    isDescriptionAiGenerated: quote.isDescriptionAiGenerated,
    items: quote.items,
    seasonSurchargePercent: quote.seasonSurchargePercent,
    discountPercent: quote.discountPercent,
    validUntil: quote.validUntil,
    decisionNote: "",
  });
  const [confirm, setConfirm] = useState<"send" | "approve" | null>(null);
  const totals = computeTotals(draft.items, draft.seasonSurchargePercent, draft.discountPercent);
  const dirty =
    JSON.stringify({ ...draft, decisionNote: "" }) !==
    JSON.stringify({
      commercialDescription: quote.commercialDescription,
      isDescriptionAiGenerated: quote.isDescriptionAiGenerated,
      items: quote.items,
      seasonSurchargePercent: quote.seasonSurchargePercent,
      discountPercent: quote.discountPercent,
      validUntil: quote.validUntil,
      decisionNote: "",
    });
  const needsApproval =
    totals.requiresAdminApproval &&
    !(quote.adminApprovedBy && draft.discountPercent === quote.discountPercent);

  const save = useMutation({
    mutationFn: () => saveQuoteDraft(actor, quote.id, draft),
    onSuccess: (q) => onSaved(q, "Borrador guardado."),
    onError: onFail,
  });
  const send = useMutation({
    mutationFn: () => sendQuote(actor, quote.id),
    onSuccess: (q) => onSaved(q, `${q.code} enviada a ${q.clientName}.`),
    onError: onFail,
    onSettled: () => setConfirm(null),
  });
  const approve = useMutation({
    mutationFn: () => approveDiscount(actor, quote.id),
    onSuccess: (q) => onSaved(q, `Descuento de ${q.code} aprobado.`),
    onError: onFail,
    onSettled: () => setConfirm(null),
  });

  const setItem = (id: string, patch: Partial<QuoteServiceItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((i) =>
        i.id === id
          ? { ...i, ...patch, editedByAdvisor: i.isAiGenerated ? true : i.editedByAdvisor }
          : i
      ),
    }));

  const addItem = () =>
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          id: `n${Date.now()}`,
          category: "Actividades",
          description: "",
          quantity: 1,
          unitPriceCOP: 0,
          isAiGenerated: false,
          editedByAdvisor: false,
        },
      ],
    }));

  const logs = quote.advisorDecisionLog ? quote.advisorDecisionLog.split("\n").filter(Boolean) : [];
  const distribution = computeBudgetDistribution(draft.items).filter((b) => b.quotedCOP > 0);
  const diffCOP = totals.totalCOP - quote.requestBudgetCOP;
  const diffPct = quote.requestBudgetCOP > 0 ? Math.round((diffCOP / quote.requestBudgetCOP) * 100) : 0;

  return (
    <section className="mt-5 rounded-xl border border-border bg-card p-5" aria-label="Editor de cotización">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-semibold">
              {quote.code} · {quote.destination}
            </h2>
            {quote.version > 1 && (
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                Versión {quote.version}
              </span>
            )}
            <StatusChip status={quote.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {quote.clientName} ({quote.clientEmail}) · Presupuesto solicitado: {cop(quote.requestBudgetCOP)} · Actualizada por {quote.updatedBy}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {quote.status === "Aprobada" && (actor.role === "Asesor" || actor.role === "Administrador") && (
            <Link
              to="/reservas"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Emitir reserva
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {canApproveDiscount(actor, quote) && (
            <Button variant="primary" onClick={() => setConfirm("approve")}>
              <BadgeCheck className="h-4 w-4" />
              Aprobar descuento
            </Button>
          )}
          {editable && (
            <>
              <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                <Save className="h-4 w-4" />
                {save.isPending ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                variant="primary"
                disabled={dirty || needsApproval || send.isPending}
                onClick={() => setConfirm("send")}
                title={dirty ? "Guarda los cambios antes de enviar" : undefined}
              >
                <Send className="h-4 w-4" />
                Enviar al cliente
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label="Cerrar editor"
            title="Cerrar editor"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {needsApproval && quote.status === "Borrador" && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-peach/50 bg-peach-soft px-3.5 py-2.5 text-sm text-peach-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          El descuento supera el {MAX_DISCOUNT_WITHOUT_APPROVAL}%: requiere autorización de Administración antes de enviar
          {dirty ? " (guarda primero)" : ""}.
        </p>
      )}
      {quote.adminApprovedBy && (
        <p className="mb-4 flex items-center gap-1.5 text-xs font-medium text-success">
          <CheckCircle2 className="h-4 w-4" />
          Descuento autorizado por {quote.adminApprovedBy}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          <label className="block text-sm font-medium">
            <span className="mb-1.5 flex items-center gap-2">
              Descripción comercial {draft.isDescriptionAiGenerated && <AiBadge />}
            </span>
            <textarea
              rows={2}
              disabled={!editable}
              value={draft.commercialDescription}
              className={fieldClass}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  commercialDescription: e.target.value,
                  isDescriptionAiGenerated: false,
                }))
              }
            />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Servicios cotizados</h3>
              {editable && (
                <Button variant="ghost" className="min-h-8 px-2.5 py-1 text-xs" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5" />
                  Agregar servicio
                </Button>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-b border-border bg-muted/65 text-left text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Categoría</th>
                    <th className="px-3 py-2.5">Descripción</th>
                    <th className="w-20 px-3 py-2.5">Cant.</th>
                    <th className="w-36 px-3 py-2.5">Valor unitario</th>
                    <th className="px-3 py-2.5">Subtotal</th>
                    <th className="w-10 px-2 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {draft.items.map((i) => (
                    <tr key={i.id} className="align-top">
                      <td className="px-3 py-2">
                        <select
                          aria-label="Categoría"
                          disabled={!editable}
                          value={i.category}
                          onChange={(e) => setItem(i.id, { category: e.target.value as ServiceCategory })}
                          className={cellInput}
                        >
                          {SERVICE_CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          aria-label="Descripción del servicio"
                          disabled={!editable}
                          value={i.description}
                          onChange={(e) => setItem(i.id, { description: e.target.value })}
                          className={cellInput}
                        />
                        {i.isAiGenerated && (
                          <div className="mt-1">
                            <AiBadge edited={i.editedByAdvisor} />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          aria-label="Cantidad"
                          type="number"
                          min={1}
                          disabled={!editable}
                          value={i.quantity}
                          onChange={(e) => setItem(i.id, { quantity: Number(e.target.value) })}
                          className={cellInput}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          aria-label="Valor unitario"
                          type="number"
                          min={0}
                          step={1000}
                          disabled={!editable}
                          value={i.unitPriceCOP}
                          onChange={(e) => setItem(i.id, { unitPriceCOP: Number(e.target.value) })}
                          className={cellInput}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 pt-3.5 font-medium">
                        {cop(i.quantity * i.unitPriceCOP)}
                      </td>
                      <td className="px-2 py-2">
                        {editable && (
                          <Button
                            variant="ghost"
                            aria-label="Quitar servicio"
                            className="h-8 w-8 p-0 text-destructive"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                items: d.items.filter((x) => x.id !== i.id),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium">
              Recargo temporada (%)
              <input
                type="number"
                min={0}
                max={100}
                disabled={!editable}
                value={draft.seasonSurchargePercent}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, seasonSurchargePercent: Number(e.target.value) }))
                }
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium">
              Descuento (%)
              <input
                type="number"
                min={0}
                max={100}
                disabled={!editable}
                value={draft.discountPercent}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, discountPercent: Number(e.target.value) }))
                }
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium">
              Vigente hasta
              <input
                type="date"
                disabled={!editable}
                value={draft.validUntil}
                onChange={(e) => setDraft((d) => ({ ...d, validUntil: e.target.value }))}
                className={fieldClass}
              />
            </label>
          </div>

          {editable && (
            <label className="block text-sm font-medium">
              Nota de cambio (opcional)
              <input
                placeholder="Ej.: Cambio de hotel solicitado por el cliente"
                value={draft.decisionNote}
                onChange={(e) => setDraft((d) => ({ ...d, decisionNote: e.target.value }))}
                className={fieldClass}
              />
            </label>
          )}
        </div>

        <aside className="space-y-4">
          <Totals quote={{ ...draft, ...totals }} />

          <div className="rounded-xl border border-border bg-card p-4 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">Distribución del presupuesto</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium",
                  diffCOP <= 0
                    ? "bg-success-soft text-success"
                    : "bg-peach-soft text-peach-foreground"
                )}
              >
                {diffCOP <= 0 ? "En presupuesto" : `+${diffPct}% vs meta`}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              Meta solicitud: <strong className="text-foreground">{cop(quote.requestBudgetCOP)}</strong>
            </p>
            <ul className="mt-3 space-y-2">
              {distribution.map((b) => (
                <li key={b.category}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{b.category}</span>
                    <span className="font-medium text-foreground">
                      {b.quotedPercent}% · {cop(b.quotedCOP)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, b.quotedPercent)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {logs.length > 0 && (
            <CollapsibleSection title="Bitácora" count={logs.length}>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {logs.map((l, i) => (
                  <li key={i} className="border-l-2 border-border pl-2.5">
                    {l}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirm === "send"}
        title="¿Enviar cotización al cliente?"
        confirmLabel="Enviar"
        description={
          <>
            Se enviará {quote.code} a {quote.clientName} por {cop(quote.totalCOP)}. Ya no podrás editarla.
          </>
        }
        onConfirm={() => send.mutateAsync().then(() => undefined, () => undefined)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "approve"}
        title="¿Aprobar descuento?"
        confirmLabel="Aprobar"
        description={
          <>
            Autorizas un descuento del {quote.discountPercent}% ({cop(quote.discountCOP)}) en {quote.code}.
          </>
        }
        onConfirm={() => approve.mutateAsync().then(() => undefined, () => undefined)}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
