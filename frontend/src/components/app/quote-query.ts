import { queryOptions } from "@tanstack/react-query";
import { listQuotes, type RequestActor } from "@/api";

export const quoteQuery = (actor: RequestActor) => queryOptions({
  queryKey: ["quotes", actor.id, actor.role],
  queryFn: () => listQuotes(actor),
  staleTime: 0,
});

export const cop = (v: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);
export const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
