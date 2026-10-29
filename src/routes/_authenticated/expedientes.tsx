import { createFileRoute } from "@tanstack/react-router";
import { getStoredSession } from "@/api/auth";
import { ClientsScreen } from "@/components/app/ClientsScreen";
import { clientQuery } from "@/components/app/client-query";
import { ErrorState, LoadingState } from "@/components/app/ui";
import { requireAccess } from "@/lib/guards";

export const Route = createFileRoute("/_authenticated/expedientes")({
  beforeLoad: requireAccess("/expedientes"),
  loader: ({ context }) => { const session = getStoredSession(); return session ? context.queryClient.ensureQueryData(clientQuery(session.user)) : undefined; },
  pendingComponent: () => <LoadingState label="Cargando expedientes…" />,
  errorComponent: ({ error, reset }) => <ErrorState message={error instanceof Error ? error.message : "No pudimos cargar los expedientes."} onRetry={reset} />,
  head: () => ({ meta: [{ title: "Expedientes y viajeros · TravelRequests" }, { name: "description", content: "Consulta y actualiza expedientes de clientes, documentos, facturación y viajeros acompañantes." }, { property: "og:title", content: "Expedientes y viajeros · TravelRequests" }, { property: "og:description", content: "Expedientes y viajeros de la agencia con acceso según el rol activo." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: ClientsScreen,
});