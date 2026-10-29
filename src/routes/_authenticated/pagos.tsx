import { createFileRoute } from "@tanstack/react-router";
import { PaymentsScreen } from "@/components/app/PaymentsScreen";
import { paymentsQuery } from "@/components/app/operations-query";
import { getStoredSession } from "@/api/auth";
import { LoadingState, ErrorState } from "@/components/app/ui";
import { requireAccess } from "@/lib/guards";

export const Route = createFileRoute("/_authenticated/pagos")({
  beforeLoad: requireAccess("/pagos"),
  loader: ({ context }) => { const s = getStoredSession(); return s ? context.queryClient.ensureQueryData(paymentsQuery(s.user)) : undefined; },
  pendingComponent: () => <LoadingState label="Cargando pagos…" />,
  errorComponent: ({ error, reset }) => <ErrorState message={error instanceof Error ? error.message : "No pudimos cargar los pagos."} onRetry={reset} />,
  head: () => ({ meta: [{ title: "Pagos · TravelRequests" }, { name: "description", content: "Pagos de TravelRequests." }, { property: "og:title", content: "Pagos · TravelRequests" }, { property: "og:description", content: "Consulta de pagos de viajes en TravelRequests." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: PaymentsScreen,
});
