import { createFileRoute } from "@tanstack/react-router";
import { RequestsScreen } from "@/components/app/RequestsScreen";
import { requestQuery } from "@/components/app/request-query";
import { ErrorState, LoadingState } from "@/components/app/ui";
import { getStoredSession } from "@/api/auth";
import { requireAccess } from "@/lib/guards";

export const Route = createFileRoute("/_authenticated/solicitudes")({
  beforeLoad: requireAccess("/solicitudes"),
  loader: ({ context }) => { const session = getStoredSession(); return session ? context.queryClient.ensureQueryData(requestQuery(session.user)) : undefined; },
  pendingComponent: () => <LoadingState label="Cargando solicitudes…" />,
  errorComponent: ({ error, reset }) => <ErrorState message={error instanceof Error ? error.message : "No pudimos cargar las solicitudes."} onRetry={reset} />,
  head: () => ({ meta: [{ title: "Solicitudes de viaje · TravelRequests" }, { name: "description", content: "Consulta y gestiona solicitudes de viaje, fechas, presupuestos y clientes en Colombia." }, { property: "og:title", content: "Solicitudes de viaje · TravelRequests" }, { property: "og:description", content: "Solicitudes de viaje y presupuestos en pesos colombianos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: RequestsScreen,
});
