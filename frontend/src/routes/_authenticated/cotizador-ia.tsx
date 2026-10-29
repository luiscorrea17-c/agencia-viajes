import { createFileRoute } from "@tanstack/react-router";
import { QuoteEditorScreen } from "@/components/app/QuoteEditorScreen";
import { quoteQuery } from "@/components/app/quote-query";
import { ErrorState, LoadingState } from "@/components/app/ui";
import { getStoredSession } from "@/api/auth";
import { requireAccess } from "@/lib/guards";

export const Route = createFileRoute("/_authenticated/cotizador-ia")({
  beforeLoad: requireAccess("/cotizador-ia"),
  loader: ({ context }) => { const s = getStoredSession(); return s ? context.queryClient.ensureQueryData(quoteQuery(s.user)) : undefined; },
  pendingComponent: () => <LoadingState label="Cargando cotizaciones…" />,
  errorComponent: ({ error, reset }) => <ErrorState message={error instanceof Error ? error.message : "No pudimos cargar las cotizaciones."} onRetry={reset} />,
  head: () => ({ meta: [{ title: "Cotizador IA · TravelRequests" }, { name: "description", content: "Arma cotizaciones de viaje con propuestas de IA revisadas por el asesor, recargos y descuentos en COP." }, { property: "og:title", content: "Cotizador IA · TravelRequests" }, { property: "og:description", content: "Cotizaciones asistidas por IA con aprobación de descuentos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: QuoteEditorScreen,
});
