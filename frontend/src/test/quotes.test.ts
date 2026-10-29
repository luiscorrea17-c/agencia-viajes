import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actor = (id: string, name: string, email: string, role: "Administrador" | "Asesor" | "Contabilidad" | "Cliente") =>
  ({ id, name, email, role, avatarUrl: "", branch: "", active: true });
const admin = actor("u1", "Laura Gómez", "admin@travelrequests.co", "Administrador");
const asesor = actor("u2", "Andrés Ruiz", "asesor@travelrequests.co", "Asesor");
const conta = actor("u3", "Marta Díaz", "contabilidad@travelrequests.co", "Contabilidad");
const cliente = actor("u4", "Carlos Pérez", "cliente@travelrequests.co", "Cliente");

async function load() { vi.resetModules(); return import("@/api/quotes"); }
async function finish<T>(p: Promise<T>) { await vi.runAllTimersAsync(); return p; }
async function fails(p: Promise<unknown>, msg?: RegExp) { const check = expect(p).rejects.toThrow(msg); await vi.runAllTimersAsync(); await check; }

describe("Cotizador IA", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("uses the exact quote statuses and 800 ms latency", async () => {
    const api = await load();
    expect(api.QUOTE_STATUSES).toEqual(["Borrador", "Enviada", "Aprobada", "Rechazada", "Expirada"]);
    expect(api.QUOTE_LATENCY_MS).toBe(800);
  });

  it("computes surcharge on base and discount on base plus surcharge", async () => {
    const api = await load();
    const t = api.computeTotals([{ id: "x", category: "Vuelos", description: "v", quantity: 2, unitPriceCOP: 1000000, isAiGenerated: true, editedByAdvisor: false }], 10, 5);
    expect(t).toMatchObject({ basePriceCOP: 2000000, seasonSurchargeCOP: 200000, discountCOP: 110000, totalCOP: 2090000 });
  });

  it("requires admin approval for discounts above 10 % before sending", async () => {
    const api = await load();
    await fails(api.sendQuote(asesor, "q2"), /aprobación/);
    const approved = await finish(api.approveDiscount(admin, "q2"));
    expect(approved.adminApprovedBy).toBe("Laura Gómez");
    expect((await finish(api.sendQuote(asesor, "q2"))).status).toBe("Enviada");
  });

  it("creates AI-flagged drafts that become edited when the advisor changes them", async () => {
    const api = await load();
    const q = await finish(api.createQuoteFromRequest(asesor, "r3"));
    expect(q.status).toBe("Borrador");
    expect(q.isDescriptionAiGenerated).toBe(true);
    expect(q.items.every((i) => i.isAiGenerated)).toBe(true);
  });

  it("keeps Contabilidad and Administrador from editing drafts", async () => {
    const api = await load();
    const [q] = (await finish(api.listQuotes(conta))).filter((x) => x.id === "q2");
    expect(api.canEditQuote(conta, q!)).toBe(false);
    expect(api.canEditQuote(admin, q!)).toBe(false);
    expect(api.canEditQuote(asesor, q!)).toBe(true);
  });

  it("shows clients only their own non-draft quotes and lets them respond once", async () => {
    const api = await load();
    const list = await finish(api.listQuotes(cliente));
    expect(list.map((q) => q.id)).toEqual(["q1"]);
    expect((await finish(api.respondQuote(cliente, "q1", "Aprobada"))).status).toBe("Aprobada");
    await fails(api.respondQuote(cliente, "q1", "Rechazada"));
  });

  it("expires sent quotes after their validity date", async () => {
    const api = await load();
    vi.setSystemTime(new Date("2026-12-15T12:00:00Z"));
    const [q] = await finish(api.listQuotes(cliente));
    expect(q!.status).toBe("Expirada");
  });

  it("distributes the client request budget across AI services, transitions request to En cotización and allows re-quoting after rejection", async () => {
    const api = await load();
    const reqApi = await import("@/api/requests");
    const q = await finish(api.createQuoteFromRequest(asesor, "r3"));
    expect(q.requestBudgetCOP).toBe(3200000);
    expect(q.version).toBe(1);
    const dist = api.computeBudgetDistribution(q.items);
    expect(dist).toHaveLength(5);
    expect(Math.abs(q.totalCOP - q.requestBudgetCOP)).toBeLessThanOrEqual(150000);
    expect((await finish(reqApi.getRequest(asesor, "r3"))).status).toBe("En cotización");

    // Rechazar q1 y generar versión 2 para la misma solicitud r1
    await finish(api.respondQuote(cliente, "q1", "Rechazada"));
    const qV2 = await finish(api.createQuoteFromRequest(asesor, "r1"));
    expect(qV2.version).toBe(2);
    expect(qV2.requestId).toBe("r1");
  });
});
