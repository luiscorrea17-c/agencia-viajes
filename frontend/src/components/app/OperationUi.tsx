import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { AuditEntry } from "@/api/requests";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

export const fieldClass =
  "mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/15 disabled:bg-muted disabled:text-muted-foreground";

export function OperationModal({
  title,
  subtitle,
  maxWidthClass = "max-w-lg",
  onClose,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  maxWidthClass?: string | undefined;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-2xs" />
        <Dialog.Content
          aria-describedby={subtitle ? undefined : undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl",
            maxWidthClass
          )}
        >
          <div className="mb-5 flex items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <Dialog.Title className="font-display text-xl font-semibold text-foreground">
                {title}
              </Dialog.Title>
              {subtitle && (
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  {subtitle}
                </Dialog.Description>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              aria-label="Cerrar formulario"
              title="Cerrar"
              className="h-8 w-8 shrink-0 p-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Notice({
  error,
  text,
  onDismiss,
}: {
  error?: boolean | undefined;
  text: string;
  onDismiss?: (() => void) | undefined;
}) {
  if (!text) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
        error
          ? "border-destructive/25 bg-destructive/5 text-destructive"
          : "border-success/25 bg-success-soft text-success"
      )}
    >
      <span>{text}</span>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          aria-label="Cerrar aviso"
          className="h-6 w-6 shrink-0 p-0"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number | undefined;
  defaultOpen?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-border pt-3">
      <summary className="flex list-none items-center justify-between py-1 text-sm font-semibold text-foreground select-none [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {typeof count === "number" && (
            <span className="ml-1.5 font-normal text-muted-foreground">({count})</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

export function AuditTrail({ history }: { history: AuditEntry[] }) {
  if (!history.length) return null;
  return (
    <div className="mt-4">
      <CollapsibleSection title="Historial" count={history.length}>
        <ol className="space-y-3">
          {history
            .slice()
            .reverse()
            .map((h) => (
              <li key={h.id} className="border-l-2 border-border pl-3 text-xs">
                <p className="break-words font-medium text-foreground">{h.action}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {h.user} · {new Date(h.timestamp).toLocaleString("es-CO")}
                </p>
              </li>
            ))}
        </ol>
      </CollapsibleSection>
    </div>
  );
}

export function Filters({
  search,
  onSearch,
  status,
  onStatus,
  options,
  label,
  placeholder = "Buscar por código, cliente o destino…",
  extra,
  hasExtraActive = false,
  onClear,
}: {
  search: string;
  onSearch: (s: string) => void;
  status?: string | undefined;
  onStatus?: ((s: string) => void) | undefined;
  options?: { value: string; label: string }[] | undefined;
  label: string;
  placeholder?: string | undefined;
  extra?: ReactNode;
  hasExtraActive?: boolean | undefined;
  onClear?: (() => void) | undefined;
}) {
  const hasActive = Boolean(search || status || hasExtraActive);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-0 flex-1 basis-60">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label={`Buscar ${label}`}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </div>
      {options && onStatus && (
        <select
          aria-label={`Estado de ${label}`}
          value={status ?? ""}
          onChange={(e) => onStatus(e.target.value)}
          className="h-9 max-w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus:border-primary"
        >
          <option value="">Todos los estados</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {extra}
      {hasActive && (
        <Button
          type="button"
          variant="ghost"
          className="h-9 px-3 text-xs text-muted-foreground"
          onClick={
            onClear ??
            (() => {
              onSearch("");
              onStatus?.("");
            })
          }
        >
          Limpiar
        </Button>
      )}
    </div>
  );
}
