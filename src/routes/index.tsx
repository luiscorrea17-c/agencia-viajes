import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "TravelRequests · Agencia de viajes" },
      { name: "description", content: "Gestión de solicitudes, cotizaciones, reservas y pagos para agencias de viajes en Colombia." },
      { property: "og:title", content: "TravelRequests · Agencia de viajes" },
      { property: "og:description", content: "Gestión transaccional para agencias de viajes en Colombia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/inicio" });
  },
});
