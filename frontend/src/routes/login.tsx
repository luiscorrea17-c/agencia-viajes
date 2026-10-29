import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, Mail, SendHorizonal } from "lucide-react";
import { DEMO_ACCOUNTS } from "@/api/auth";
import { isBackendEnabled } from "@/api/client";
import { Button } from "@/components/ui/button";
import { HeroSection } from "@/components/ui/hero-section-6";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } =>
    typeof s["redirect"] === "string" && s["redirect"].startsWith("/")
      ? { redirect: s["redirect"] }
      : {},
  head: () => ({
    meta: [
      { title: "Entrar a tu cuenta · TravelRequests" },
      {
        name: "description",
        content:
          "Cotiza viajes con IA, aprueba propuestas, confirma reservas y concilia pagos en pesos colombianos.",
      },
      { property: "og:title", content: "Entrar a tu cuenta · TravelRequests" },
      {
        property: "og:description",
        content: "Mesa operativa para asesores de viaje y portal de clientes en Colombia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, session, ready } = useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  const go = () => navigate({ to: redirect ?? "/inicio", replace: true });
  useEffect(() => {
    if (ready && session) go();
  }, [ready, session]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) return setError("Ingresa tu correo y contraseña.");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible iniciar sesión.");
      setLoading(false);
    }
  }

  return (
    <HeroSection
      badgeTag="4 sedes"
      badgeText="Bogotá · Medellín · Cali · Cartagena"
      title="Hacemos realidad tu próximo destino"
      description="Ingresa con tu correo de agencia o de viajero para gestionar solicitudes, cotizaciones, reservas y pagos."
      menuItems={[]}
      navActions={null}
      lightImageUrl="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2400&q=85"
      darkImageUrl="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=2400&q=85"
      imageAlt="Costa Caribe colombiana"
      formSlot={
        <form
          onSubmit={submit}
          noValidate
          className="max-w-md rounded-2xl border border-border bg-card/95 p-5 shadow-md backdrop-blur-md"
        >
          <div className="space-y-2.5">
            <label className="block">
              <span className="sr-only">Correo electrónico</span>
              <div className="relative flex items-center rounded-xl border border-input bg-background transition-colors has-[input:focus]:border-primary has-[input:focus]:ring-2 has-[input:focus]:ring-primary/15">
                <Mail className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Correo electrónico"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full bg-transparent pl-10 pr-3 text-sm focus:outline-none"
                />
              </div>
            </label>

            <div className="relative grid grid-cols-[1fr_auto] items-center rounded-xl border border-input bg-background pr-1.5 transition-colors has-[input:focus]:border-primary has-[input:focus]:ring-2 has-[input:focus]:ring-primary/15">
              <KeyRound className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4 text-muted-foreground" />
              <div className="relative flex items-center">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Contraseña"
                  aria-label="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full bg-transparent pl-10 pr-9 text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              <Button type="submit" disabled={loading} className="h-8 rounded-lg px-3.5">
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <span>Entrar</span>
                    <SendHorizonal className="size-3.5" strokeWidth={2} />
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={() => setForgot((f) => !f)}
              className="text-xs text-muted-foreground hover:text-primary"
            >
              ¿Olvidaste tu clave?
            </button>
          </div>

          {forgot && (
            <p className="mt-2 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
              Solicita una nueva clave al administrador de tu sede.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-peach/50 bg-peach-soft p-2.5 text-xs font-medium text-peach-foreground"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          {!isBackendEnabled() && (
            <div className="mt-4 border-t border-border pt-3.5">
              <p className="text-xs font-medium text-muted-foreground">Acceso rápido de prueba</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {DEMO_ACCOUNTS.map((a) => {
                  const selected = email === a.email;
                  return (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => {
                        setEmail(a.email);
                        setPassword(a.password);
                        setError(null);
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
                      }`}
                    >
                      {a.role}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      }
    />
  );
}
