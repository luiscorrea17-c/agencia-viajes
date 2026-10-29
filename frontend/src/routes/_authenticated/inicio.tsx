import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "@/components/app/HomeScreen";
import { dashboardQuery } from "@/components/app/operations-query";
import { requestQuery } from "@/components/app/request-query";
import { getStoredSession } from "@/api/auth";
import { ErrorState, LoadingState } from "@/components/app/ui";
import { requireAccess } from "@/lib/guards";

export const Route = createFileRoute("/_authenticated/inicio")({
  beforeLoad: requireAccess("/inicio"),
  loader: ({ context }) => { const session = getStoredSession(); if (!session) return; return session.user.role === "Cliente" ? context.queryClient.ensureQueryData(requestQuery(session.user)) : context.queryClient.ensureQueryData(dashboardQuery(session.user)); },
  pendingComponent: () => <LoadingState label="Cargando tus solicitudes…" />,
  errorComponent: ({ error, reset }) => <ErrorState message={error instanceof Error ? error.message : "No pudimos cargar tus solicitudes."} onRetry={reset} />,
  head: () => ({ meta: [{ title: "Inicio y mis viajes · TravelRequests" }, { name: "description", content: "Portal de TravelRequests y solicitudes de viaje del Cliente." }, { property: "og:title", content: "Inicio y mis viajes · TravelRequests" }, { property: "og:description", content: "Consulta tus próximas solicitudes de viaje." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: HomeScreen,
});
