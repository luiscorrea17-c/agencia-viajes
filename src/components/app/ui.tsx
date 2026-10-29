import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Compass, Lock, Sparkles } from "lucide-react";
import type { BookingStatus, PaymentStatus, QuoteStatus, RequestStatus } from "@/api/types";
import { cn } from "@/lib/utils";

/* ---------- Botones ---------- */
type BtnVariant = "primary" | "cta" | "secondary" | "ghost" | "destructive";
const btn: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-2xs hover:bg-primary-hover",
  cta: "bg-cta text-cta-foreground shadow-2xs hover:bg-cta-hover",
  secondary: "bg-card text-foreground border border-border hover:bg-muted/80",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground shadow-2xs hover:bg-destructive/90",
};
export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        btn[variant], className,
      )}
    />
  );
}

/* ---------- Encabezado de página ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- KPI ---------- */
export function KpiCard({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "alert" }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3.5",
        tone === "alert" && "border-peach/60 bg-peach-soft/60"
      )}
    >
      <p className={cn("text-xs font-medium text-muted-foreground", tone === "alert" && "text-peach-foreground")}>
        {label}
      </p>
      <div className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      {hint && <p className={cn("mt-1 text-xs text-muted-foreground", tone === "alert" && "text-peach-foreground")}>{hint}</p>}
    </div>
  );
}

/* ---------- Chip de estado ---------- */
type Tone = "neutral" | "pending" | "info" | "success" | "danger";
const toneCls: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  pending: "bg-peach-soft text-peach-foreground border-peach/40",
  info: "bg-info-soft text-info border-info/20",
  success: "bg-success-soft text-success border-success/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
};
const toneDotCls: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  pending: "bg-peach-foreground",
  info: "bg-info",
  success: "bg-success",
  danger: "bg-destructive",
};
type AnyStatus = RequestStatus | QuoteStatus | BookingStatus | PaymentStatus;
export const STATUS_META: Record<AnyStatus, { label: string; tone: Tone }> = {
  Abierta: { label: "Abierta", tone: "pending" },
  "En cotización": { label: "En cotización", tone: "info" },
  Cerrada: { label: "Cerrada", tone: "neutral" },
  Borrador: { label: "Borrador", tone: "neutral" },
  Enviada: { label: "Enviada", tone: "pending" },
  Aprobada: { label: "Aprobada", tone: "success" },
  Rechazada: { label: "Rechazada", tone: "danger" },
  Expirada: { label: "Expirada", tone: "neutral" },
  pendiente_pago: { label: "Pendiente de pago", tone: "pending" },
  confirmada: { label: "Confirmada", tone: "success" },
  en_modificacion: { label: "En modificación", tone: "info" },
  cancelada: { label: "Cancelada", tone: "danger" },
  por_conciliar: { label: "Por conciliar", tone: "pending" },
  validado: { label: "Validado", tone: "success" },
  rechazado: { label: "Rechazado", tone: "danger" },
  devuelto: { label: "Devuelto", tone: "neutral" },
};
export function StatusChip({ status }: { status: AnyStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", toneCls[m.tone])}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", toneDotCls[m.tone])} />
      {m.label}
    </span>
  );
}

/* ---------- Campo enmascarado ---------- */
export function maskValue(v: string, visible = 3) {
  if (v.length <= visible) return "•".repeat(v.length);
  return "•".repeat(v.length - visible) + v.slice(-visible);
}
export function MaskedField({ label, value, canReveal = false }: { label: string; value: string; canReveal?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{show ? value : maskValue(value)}</span>
        {canReveal && (
          <button type="button" onClick={() => setShow((s) => !s)} className="text-xs font-medium text-primary hover:underline">
            {show ? "Ocultar" : "Mostrar"}
          </button>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Dato protegido">
          <Lock className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

/* ---------- Sugerencia IA ---------- */
export function AiSuggestion({ initial, onAccept }: { initial: string; onAccept?: (v: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="rounded-xl border border-ai/20 bg-ai-soft p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ai">
        <Sparkles className="h-3.5 w-3.5" /> Sugerencia de IA
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
        className="w-full resize-none rounded-lg border border-input bg-card p-2.5 text-sm" />
      {onAccept && <div className="mt-2 flex justify-end"><Button onClick={() => onAccept(text)}>Usar texto</Button></div>}
    </div>
  );
}

/* ---------- Estados ---------- */
export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="space-y-2.5 p-6" role="status" aria-label={label}>
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
      <p className="pt-1 text-center text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
export function EmptyState({ title, description, action }: { title: string; description?: string | undefined; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
        <Compass className="h-5 w-5" />
      </span>
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <div className="m-4 rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center">
      <p className="font-display text-base font-semibold text-destructive">No pudimos cargar la información</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {onRetry && <Button className="mt-3" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

/* ---------- Modal de confirmación ---------- */
export function ConfirmDialog({
  open, title, description, confirmLabel = "Confirmar", destructive = false, requireText, onConfirm, onCancel,
}: {
  open: boolean; title: string; description: ReactNode; confirmLabel?: string; destructive?: boolean;
  requireText?: string; onConfirm: () => void | Promise<void>; onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTyped(""); setBusy(false); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onCancel]);
  if (!open) return null;
  const blocked = !!requireText && typed !== requireText;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-2xs" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <div className="mt-2 text-sm text-muted-foreground">{description}</div>
        {requireText && (
          <label className="mt-4 block text-sm">
            Escribe <strong>{requireText}</strong> para continuar
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2" />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCancel}>Cancelar</Button>
          <Button variant={destructive ? "destructive" : "primary"} disabled={blocked || busy}
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>
            {busy ? "Procesando…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
