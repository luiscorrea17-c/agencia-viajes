import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TravelLogo } from "@/components/ui/hero-section-6";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/sin-permiso")({
  head: () => ({
    meta: [
      { title: "Sin permiso · TravelRequests" },
      { name: "description", content: "No tienes permiso para acceder a esta sección." },
      { property: "og:title", content: "Sin permiso · TravelRequests" },
      { property: "og:description", content: "Acceso restringido según tu rol." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SinPermiso,
});

function SinPermiso() {
  const { session } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-dashed border-border bg-card/85 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto max-w-5xl">
          <Link to="/">
            <TravelLogo />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border border-dashed border-border bg-card p-8 text-center shadow-lg shadow-sky-950/5">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-peach-soft text-peach-foreground">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session ? (
              <>
                Tu perfil activo (<strong>{session.user.role}</strong>) no cuenta con permisos para este módulo.
              </>
            ) : (
              "Debes iniciar sesión para continuar."
            )}
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link to={session ? "/inicio" : "/login"}>
                <span>{session ? "Volver al inicio" : "Iniciar sesión"}</span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
