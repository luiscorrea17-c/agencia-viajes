import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, EmptyState, ErrorState, LoadingState } from "./ui";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function TableWithPanel<T>({
  rows,
  columns,
  getId,
  selectedId,
  onSelect,
  renderPanel,
  loading,
  error,
  onRetry,
  emptyTitle = "Sin resultados",
  emptyDescription,
  collapseEmptyPanel = false,
  panelLabel = "Detalle del registro",
}: {
  rows: T[];
  columns: Column<T>[];
  getId: (r: T) => string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderPanel: (row: T) => ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  collapseEmptyPanel?: boolean;
  panelLabel?: string;
}) {
  const selected = rows.find((r) => getId(r) === selectedId) ?? null;
  return (
    <div className={cn("grid min-w-0 gap-5", (selected || !collapseEmptyPanel) && "lg:grid-cols-[minmax(0,1fr)_360px]")}>
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : rows.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/65 text-left text-xs font-semibold text-muted-foreground">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={cn("px-4 py-3 font-semibold", c.className)}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((r) => {
                  const id = getId(r);
                  const isSelected = id === selectedId;
                  return (
                    <tr
                      key={id}
                      onClick={() => onSelect(id)}
                      aria-selected={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(id);
                        }
                      }}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/70",
                        isSelected && "bg-primary-soft/55 shadow-[inset_3px_0_0_0_var(--primary)]"
                      )}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={cn("px-4 py-3.5", c.className)}>
                          {c.render(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(selected || !collapseEmptyPanel) && (
        <aside
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs lg:sticky lg:top-20 lg:self-start"
          aria-label={panelLabel}
        >
          {selected ? (
            <div>
              <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-5 py-3">
                <span className="text-xs font-semibold text-muted-foreground">{panelLabel}</span>
                <Button
                  variant="ghost"
                  onClick={() => onSelect(null)}
                  className="h-7 w-7 rounded-md p-0"
                  aria-label="Cerrar detalle"
                  title="Cerrar detalle"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-5">{renderPanel(selected)}</div>
            </div>
          ) : (
            <EmptyState title="Selecciona un registro" description="Haz clic en una fila para consultar su ficha completa." />
          )}
        </aside>
      )}
    </div>
  );
}
