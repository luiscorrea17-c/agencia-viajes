import { createFileRoute } from "@tanstack/react-router";
import { BookingsScreen } from "@/components/app/BookingsScreen";
import { bookingsQuery } from "@/components/app/operations-query";
import { getStoredSession } from "@/api/auth";
import { LoadingState, ErrorState } from "@/components/app/ui";
import { requireAccess } from "@/lib/guards";

export const Route = createFileRoute("/_authenticated/reservas")({
  beforeLoad: requireAccess("/reservas"),
  loader: ({ context }) => { const s = getStoredSession(); return s ? context.queryClient.ensureQueryData(bookingsQuery(s.user)) : undefined; },
  pendingComponent: () => <LoadingState label="Cargando reservas…" />,
  errorComponent: ({ error, reset }) => <ErrorState message={error instanceof Error ? error.message : "No pudimos cargar las reservas."} onRetry={reset} />,
  head: () => ({ meta: [{ title: "Reservas · TravelRequests" }, { name: "description", content: "Reservas de TravelRequests." }, { property: "og:title", content: "Reservas · TravelRequests" }, { property: "og:description", content: "Reservas de viajes en TravelRequests." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: BookingsScreen,
});
