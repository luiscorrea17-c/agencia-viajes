import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, Check, X } from "lucide-react";
import { canRespondQuote, respondQuote, type Quote, type RequestActor } from "@/api";
import { useAuth } from "@/lib/auth";
import { Notice } from "./OperationUi";
import { Button, ConfirmDialog, EmptyState, KpiCard, PageHeader, StatusChip } from "./ui";
import { AiBadge, Totals } from "./QuoteEditorScreen";
import { cop, fmtDate, quoteQuery } from "./quote-query";

export function ClientQuotesScreen() {
  const { session } = useAuth();
  if (!session) return null;
  return <ClientQuotes actor={session.user} />;
}

function ClientQuotes({ actor }: { actor: RequestActor }) {
  const qc = useQueryClient();
  const { data: quotes } = useSuspenseQuery(quoteQuery(actor));
  const [pending, setPending] = useState<{ quote: Quote; decision: "Aprobada" | "Rechazada" } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const respond = useMutation({
    mutationFn: (p: { quote: Quote; decision: "Aprobada" | "Rechazada" }) => respondQuote(actor, p.quote.id, p.decision),
    onSuccess: (q) => {
      qc.setQueryData(quoteQuery(actor).queryKey, (old: Quote[] | undefined) => (old ?? []).map((x) => x.id === q.id ? q : x));
      void qc.invalidateQueries({ queryKey: ["bookings"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      setMsg({ ok: true, text: q.status === "Aprobada" ? `Aprobaste ${q.code}. Tu asesor continuará con la reserva.` : `Rechazaste ${q.code}.` });
    },
    onError: (e) => setMsg({ ok: false, text: e instanceof Error ? e.message : "No pudimos registrar tu respuesta." }),
    onSettled: () => setPending(null),
  });

  return (
    <div>
      <PageHeader title="Mis cotizaciones" subtitle="Revisa los servicios propuestos y responde antes de la fecha límite." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Por responder" value={quotes.filter((q) => q.status === "Enviada").length} tone={quotes.some((q) => q.status === "Enviada") ? "alert" : "default"} />
        <KpiCard label="Aprobadas" value={quotes.filter((q) => q.status === "Aprobada").length} />
        <KpiCard label="Total" value={quotes.length} />
      </div>
      {msg && <Notice error={!msg.ok} text={msg.text} onDismiss={() => setMsg(null)} />}
      {quotes.length === 0 ? <div className="rounded-xl border border-border bg-card"><EmptyState title="Aún no tienes cotizaciones" description="Cuando tu asesor envíe una propuesta, la verás aquí." /></div> : (
        <div className="space-y-5">
          {quotes.map((q) => (
            <article key={q.id} className="rounded-xl border border-border bg-card p-5 shadow-2xs">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono text-xs text-muted-foreground">{q.code}</p><h2 className="mt-0.5 font-display text-xl font-semibold">{q.destination}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />Vigente hasta {fmtDate(q.validUntil)}</p></div>
                <StatusChip status={q.status} />
              </div>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0 space-y-3">
                  <p className="text-sm leading-relaxed text-foreground/90">{q.commercialDescription}</p>
                  {q.isDescriptionAiGenerated && <div><AiBadge /></div>}
                  <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                    {q.items.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                        <div className="min-w-0"><p className="font-medium">{i.description}</p><p className="text-xs text-muted-foreground">{i.category} · {i.quantity} × {cop(i.unitPriceCOP)}</p></div>
                        <span className="font-medium">{cop(i.quantity * i.unitPriceCOP)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-3">
                  <Totals quote={q} />
                  {canRespondQuote(actor, q) && (
                    <div className="flex gap-2">
                      <Button variant="destructive" className="flex-1" onClick={() => setPending({ quote: q, decision: "Rechazada" })}><X className="h-4 w-4" />Rechazar</Button>
                      <Button variant="primary" className="flex-1" onClick={() => setPending({ quote: q, decision: "Aprobada" })}><Check className="h-4 w-4" />Aprobar</Button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!pending} destructive={pending?.decision === "Rechazada"}
        title={pending?.decision === "Aprobada" ? "¿Aprobar cotización?" : "¿Rechazar cotización?"}
        confirmLabel={pending?.decision === "Aprobada" ? "Aprobar" : "Rechazar"}
        description={pending ? <>{pending.quote.code} · {pending.quote.destination} por {cop(pending.quote.totalCOP)}. Esta decisión no se puede deshacer.</> : null}
        onConfirm={() => pending ? respond.mutateAsync(pending).then(() => undefined, () => undefined) : undefined} onCancel={() => setPending(null)} />
    </div>
  );
}
