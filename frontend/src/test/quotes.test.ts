import { describe, expect, it, vi } from "vitest";
import {
  approveDiscount,
  canApproveDiscount,
  computeTotals,
  QUOTE_STATUSES,
  respondQuote,
  type Quote,
} from "@/api/quotes";
import type { RequestActor } from "@/api/requests";
import { mockJsonResponse, sessionToken } from "./api-helpers";

const quote = {
  id: "quote-1",
  code: "COT-001",
  requestId: "request-1",
  requestBudgetCOP: 3000000,
  version: 1,
  clientName: "Cliente",
  clientEmail: "client@example.com",
  destination: "Cartagena",
  commercialDescription: "",
  isDescriptionAiGenerated: true,
  items: [],
  basePriceCOP: 2000000,
  seasonSurchargePercent: 10,
  seasonSurchargeCOP: 200000,
  discountPercent: 15,
  discountCOP: 330000,
  requiresAdminApproval: true,
  totalCOP: 1870000,
  validUntil: "2026-12-01",
  status: "Borrador" as const,
  advisorDecisionLog: "",
  updatedBy: "Asesor",
  updatedAt: "2026-10-29T12:00:00Z",
} satisfies Quote;
const actor = (role: RequestActor["role"]): RequestActor => ({
  id: "user-1",
  name: "Prueba",
  email: "client@example.com",
  role,
  avatarUrl: "",
  branch: "Bogotá",
  active: true,
});

describe("Cotizaciones: contratos HTTP", () => {
  it("mantiene los estados de cotización y calcula totales", () => {
    expect(QUOTE_STATUSES).toEqual(["Borrador", "Enviada", "Aprobada", "Rechazada", "Expirada"]);
    expect(
      computeTotals(
        [
          {
            id: "item-1",
            category: "Vuelos",
            description: "Vuelo",
            quantity: 2,
            unitPriceCOP: 1000000,
            isAiGenerated: true,
            editedByAdvisor: false,
          },
        ],
        10,
        5,
      ),
    ).toMatchObject({
      basePriceCOP: 2000000,
      seasonSurchargeCOP: 200000,
      discountCOP: 110000,
      totalCOP: 2090000,
    });
  });

  it("limita la aprobación de descuentos al Administrador y cotizaciones borrador", () => {
    expect(canApproveDiscount(actor("Administrador"), quote)).toBe(true);
    expect(canApproveDiscount(actor("Asesor"), quote)).toBe(false);
    expect(canApproveDiscount(actor("Administrador"), { ...quote, status: "Enviada" })).toBe(false);
  });

  it("envía la aprobación del descuento al endpoint correspondiente", async () => {
    sessionToken();
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(quote));
    vi.stubGlobal("fetch", fetchMock);

    await approveDiscount(actor("Administrador"), "quote-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/quotes/quote-1/approve-discount",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("envía la decisión del cliente como JSON", async () => {
    sessionToken();
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ ...quote, status: "Aprobada" }));
    vi.stubGlobal("fetch", fetchMock);

    await respondQuote(actor("Cliente"), "quote-1", "Aprobada");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/quotes/quote-1/respond",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decision: "Aprobada" }),
      }),
    );
  });
});
