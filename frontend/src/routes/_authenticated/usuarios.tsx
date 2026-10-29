import { createFileRoute } from "@tanstack/react-router";
import { UsersScreen } from "@/components/app/UsersScreen";
import { usersQuery } from "@/components/app/operations-query";
import { getStoredSession } from "@/api/auth";
import { LoadingState, ErrorState } from "@/components/app/ui";
import { requireAccess } from "@/lib/guards";

export const Route = createFileRoute("/_authenticated/usuarios")({
  beforeLoad: requireAccess("/usuarios"),
  loader: ({ context }) => { const s = getStoredSession(); return s ? context.queryClient.ensureQueryData(usersQuery(s.user)) : undefined; },
  pendingComponent: () => <LoadingState label="Cargando usuarios…" />,
  errorComponent: ({ error, reset }) => <ErrorState message={error instanceof Error ? error.message : "No pudimos cargar los usuarios."} onRetry={reset} />,
  head: () => ({ meta: [{ title: "Usuarios · TravelRequests" }, { name: "description", content: "Usuarios de TravelRequests." }, { property: "og:title", content: "Usuarios · TravelRequests" }, { property: "og:description", content: "Administración de usuarios de TravelRequests." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: UsersScreen,
});
