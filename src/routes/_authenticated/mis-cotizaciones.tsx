import { createFileRoute } from "@tanstack/react-router";
import { ClientQuotesScreen } from "@/components/app/ClientQuotesScreen";
import { quoteQuery } from "@/components/app/quote-query";
import { ErrorState, LoadingState } from "@/components/app/ui";
import { getStoredSession } from "@/api/auth";
import { requireAccess } from "@/lib/guards";

export const Route = createFileRoute("/_authenticated/mis-cotizaciones")({
  beforeLoad: requireAccess("/mis-cotizaciones"),
  loader: ({ context }) => { const s = getStoredSession(); return s ? context.queryClient.ensureQueryData(quoteQuery(s.user)) : undefined; },
  pendingComponent: () => <LoadingState label="Cargando tus cotizaciones…" />,
  errorComponent: ({ error, reset }) => <ErrorState message={error instanceof Error ? error.message : "No pudimos cargar tus cotizaciones."} onRetry={reset} />,
  head: () => ({ meta: [{ title: "Mis cotizaciones · TravelRequests" }, { name: "description", content: "Revisa, aprueba o rechaza las cotizaciones de viaje que te envió tu asesor." }, { property: "og:title", content: "Mis cotizaciones · TravelRequests" }, { property: "og:description", content: "Tus propuestas de viaje con precios en pesos colombianos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: ClientQuotesScreen,
});
