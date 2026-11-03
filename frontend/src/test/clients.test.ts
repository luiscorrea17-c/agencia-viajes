import { describe, expect, it, vi } from "vitest";
import {
  canCreateClient,
  canEditClient,
  CLIENT_SEGMENTS,
  CLIENT_TYPES,
  DOC_TYPES,
  listClientRecords,
  updateClientRecord,
  type ClientInput,
} from "@/api/clients";
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

describe("Clientes: contratos HTTP", () => {
  it("conserva los catálogos del expediente", () => {
    expect(CLIENT_TYPES).toEqual(["Persona", "Empresa"]);
    expect(CLIENT_SEGMENTS).toEqual(["Estándar", "Corporativo", "VIP"]);
    expect(DOC_TYPES).toEqual(["CC", "NIT", "CE", "Pasaporte"]);
  });

  it("aplica permisos de creación y edición del expediente", () => {
    expect(canCreateClient(actor("Administrador"))).toBe(true);
    expect(canCreateClient(actor("Asesor"))).toBe(true);
    expect(canCreateClient(actor("Cliente"))).toBe(false);
    expect(canEditClient(actor("Contabilidad"), "client-1")).toBe(false);
    expect(canEditClient(actor("Cliente"), "client-1")).toBe(true);
  });

  it("consulta expedientes con bearer token", async () => {
    sessionToken("client-token");
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listClientRecords(actor("Administrador"))).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/api/clients", expect.any(Object));
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer client-token");
  });

  it("envía la actualización y su motivo al endpoint del expediente", async () => {
    sessionToken();
    const updated = { id: "client-1", name: "Cliente actualizado" };
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(updated));
    vi.stubGlobal("fetch", fetchMock);
    const input: ClientInput = {
      name: "Cliente",
      email: "client@example.com",
      phone: "3001234567",
      type: "Persona",
      segment: "Estándar",
      docType: "CC",
      docNumber: "123456",
      billingAddress: "Bogotá",
      taxRegime: "Persona natural",
      companions: [],
      notes: [],
    };

    await updateClientRecord(actor("Asesor"), "client/1", input, "  Datos corregidos  ");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clients/client%2F1?reason=Datos%20corregidos",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
