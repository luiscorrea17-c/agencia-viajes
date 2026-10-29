import { createFileRoute, redirect } from "@tanstack/react-router";
import { getStoredSession } from "@/api/auth";
import { AppLayout } from "@/components/app/AppLayout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: ({ location }) => {
    if (!getStoredSession()) throw redirect({ to: "/login", search: { redirect: location.href } });
  },
  component: AppLayout,
});
