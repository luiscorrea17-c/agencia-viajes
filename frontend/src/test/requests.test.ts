import { describe, expect, it, vi } from "vitest";
import { canAccessRequests, createRequest, listRequests, REQUEST_STATUSES } from "@/api/requests";
import { mockJsonResponse, sessionToken } from "./api-helpers";

const actor = (role: "Administrador" | "Asesor" | "Contabilidad" | "Cliente") => ({
  id: "user-1",
  name: "Prueba",
  email: "test@example.com",
  role,
  avatarUrl: "",
  branch: "Bogotá",
  active: true,
});

describe("Solicitudes: contratos HTTP", () => {
  it("mantiene los estados definidos y el control de acceso de la ruta", () => {
    expect(REQUEST_STATUSES).toEqual(["Abierta", "En cotización", "Cerrada"]);
    expect(canAccessRequests(actor("Administrador"))).toBe(true);
    expect(canAccessRequests(actor("Cliente"))).toBe(true);
    expect(canAccessRequests(actor("Contabilidad"))).toBe(false);
  });

  it("consulta las solicitudes por HTTP autenticado", async () => {
    sessionToken();
    const rows = [{ id: "request-1", status: "Abierta" }];
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(rows));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRequests(actor("Asesor"))).resolves.toEqual(rows);
    expect(fetchMock).toHaveBeenCalledWith("/api/requests", expect.any(Object));
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test.jwt.token");
  });

  it("envía la solicitud con los campos del contrato frontend", async () => {
    sessionToken();
    const input = {
      clientId: "client-1",
      destination: "Cartagena",
      startDate: "2026-11-10",
      endDate: "2026-11-15",
      budgetCOP: 4500000,
      travelersCount: 2,
      notes: "Hotel con desayuno",
      status: "Abierta" as const,
    };
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "request-1", ...input }));
    vi.stubGlobal("fetch", fetchMock);

    await createRequest(actor("Cliente"), input);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/requests",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });
});
