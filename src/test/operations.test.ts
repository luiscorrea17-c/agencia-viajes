import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/api/auth";
const actor = (id: string, role: Role) => ({ id, role, name: role, email: `${id}@example.com`, active: true, avatarUrl: "", branch: "Bogotá" });
const admin = actor("u1", "Administrador"), advisor = actor("u2", "Asesor"), accounting = actor("u3", "Contabilidad"), client = { ...actor("u4", "Cliente"), email: "cliente@travelrequests.co" };
async function finish<T>(p: Promise<T>) { await vi.runAllTimersAsync(); return p; }
async function fails(p: Promise<unknown>, message?: RegExp) { const assertion = expect(p).rejects.toThrow(message); await vi.runAllTimersAsync(); await assertion; }
describe("Reservas, pagos y usuarios", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("keeps the required reservation lifecycle states", async () => { const api = await import("@/api/bookings"); expect(api.BOOKING_STATUSES).toEqual(["pendiente_pago", "confirmada", "en_modificacion", "cancelada"]); });
  it("keeps the required payment lifecycle states", async () => { const api = await import("@/api/bookings"); expect(api.PAYMENT_STATUSES).toEqual(["por_conciliar", "validado", "rechazado", "devuelto"]); });
  it("scopes Client reservations by owner", async () => { const api = await import("@/api/bookings"); expect((await finish(api.listBookings(client))).map((b) => b.id)).toEqual(["b1"]); });
  it("scopes Client payments by owner", async () => { const api = await import("@/api/bookings"); expect((await finish(api.listPayments(client))).map((p) => p.id)).toEqual(["p1", "p2"]); });
  it("blocks accounting from the reservations module", async () => { const api = await import("@/api/bookings"); await fails(api.listBookings(accounting), /permiso/); });
  it("allows Client booking consultation but not modification", async () => { const api = await import("@/api/bookings"); await fails(api.changeBooking(client, "b1", "cancelada", "Cambio"), /equipo/); });
  it("creates reservations only from approved quotes and rejects duplicates", async () => { const api = await import("@/api/bookings"); const quotes = await import("@/api/quotes"); await fails(api.createBooking(advisor, "q1"), /aprobada/); await finish(quotes.respondQuote(client, "q1", "Aprobada")); const b = await finish(api.createBooking(advisor, "q1")); expect(b.clientId).toBe("u4"); expect(b.status).toBe("pendiente_pago"); expect(b.totalCOP).toBe((await finish(quotes.listQuotes(advisor))).find((q) => q.id === "q1")?.totalCOP); await fails(api.createBooking(advisor, "q1"), /ya tiene/); });
  it("cancellation is terminal and audited", async () => { const api = await import("@/api/bookings"); const b = await finish(api.changeBooking(admin, "b1", "cancelada", "Cliente solicita cancelación")); expect(b.status).toBe("cancelada"); expect(b.history).toHaveLength(2); await fails(api.changeBooking(admin, "b1", "confirmada", "Restaurar"), /no admite/); });
  it("allows confirmed reservation modification and completion", async () => { const api = await import("@/api/bookings"); expect((await finish(api.changeBooking(advisor, "b2", "en_modificacion", "Nuevo hotel"))).status).toBe("en_modificacion"); expect((await finish(api.changeBooking(advisor, "b2", "confirmada", "Hotel confirmado"))).status).toBe("confirmada"); });
  it("prevents Client payment validation", async () => { const api = await import("@/api/bookings"); await fails(api.reconcilePayment(client, "p2", "validado", "Pago"), /Contabilidad/); });
  it("updates validated totals, confirms paid bookings and handles refunds", async () => { const api = await import("@/api/bookings"); await finish(api.reconcilePayment(accounting, "p2", "validado", "Referencia verificada")); expect((await finish(api.listBookings(admin))).find((b) => b.id === "b1")).toMatchObject({ paidCOP: 4500000, status: "confirmada" }); await finish(api.reconcilePayment(accounting, "p2", "devuelto", "Devolución solicitada")); expect((await finish(api.listBookings(admin))).find((b) => b.id === "b1")).toMatchObject({ paidCOP: 1500000, status: "pendiente_pago" }); await fails(api.reconcilePayment(accounting, "p2", "validado", "Revalidar"), /no permitido/); });
  it("rejects nonpositive payment amounts", async () => { const api = await import("@/api/bookings"); await finish(api.reconcilePayment(admin, "p2", "rechazado", "Referencia incorrecta")); await fails(api.registerPayment(client, { bookingId: "b1", amountCOP: 0, method: "Transferencia", reference: "TEST", date: "2026-10-29", notes: "" }), /positivo/); });
  it("registers Client payments for own bookings only", async () => { const api = await import("@/api/bookings"); await finish(api.reconcilePayment(admin, "p2", "rechazado", "Referencia incorrecta")); const p = await finish(api.registerPayment(client, { bookingId: "b1", amountCOP: 3000000, method: "Transferencia", reference: "TEST", date: "2026-10-29", notes: "" })); expect(p.status).toBe("por_conciliar"); expect(p.clientId).toBe("u4"); await fails(api.registerPayment(client, { bookingId: "b2", amountCOP: 100, method: "Transferencia", reference: "TEST", date: "2026-10-29", notes: "" }), /disponible/); });
  it("only Admin manages users without exposing passwords", async () => { const auth = await import("@/api/auth"); await fails(auth.listUsers(advisor), /Administrador/); const users = await finish(auth.listUsers(admin)); expect(users).toHaveLength(5); expect(users.every((u) => !("password" in u))).toBe(true); });
  it("protects the current administrator from self deactivation", async () => { const auth = await import("@/api/auth"); await fails(auth.setUserActive(admin, "u1", false), /propia cuenta/); });
  it("creates, edits and deactivates mock accounts", async () => { const auth = await import("@/api/auth"); const input = { name: "Prueba Usuario", email: "prueba@example.com", branch: "Cali", role: "Asesor" as const, password: "password123" }; const user = await finish(auth.saveUser(admin, null, input)); expect(user.active).toBe(true); await finish(auth.saveUser(admin, user.id, { ...input, name: "Usuario Editado" })); expect((await finish(auth.listUsers(admin))).find((u) => u.id === user.id)?.name).toBe("Usuario Editado"); await finish(auth.setUserActive(admin, user.id, false)); await fails(auth.login(input.email, input.password), /inactivo/); });
  it("associates travelers, agreed items, payment due date and payment receipts across the full lifecycle", async () => {
    const api = await import("@/api/bookings");
    const quotes = await import("@/api/quotes");
    const requests = await import("@/api/requests");
    await finish(quotes.respondQuote(client, "q1", "Aprobada"));
    const sources = await finish(api.bookingSources(advisor));
    expect(sources[0]?.candidateTravelers).toHaveLength(2);
    const b = await finish(api.createBooking(advisor, "q1", { paymentDueDate: "2026-11-06", conditions: "Condición especial pactada." }));
    expect(b.travelers).toHaveLength(2);
    expect(b.agreedItems.length).toBeGreaterThan(0);
    expect(b.paymentDueDate).toBe("2026-11-06");
    expect(b.conditions).toBe("Condición especial pactada.");

    const p = await finish(api.registerPayment(client, {
      bookingId: b.id,
      amountCOP: b.totalCOP,
      method: "Transferencia",
      reference: "TRX-9988",
      date: "2026-10-29",
      notes: "Pago total con soporte",
      receiptName: "comprobante-total.png",
      receiptDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    }));
    expect(p.receiptName).toBe("comprobante-total.png");
    await finish(api.reconcilePayment(accounting, p.id, "validado", "Soporte verificado"));
    expect((await finish(requests.getRequest(advisor, "r1"))).status).toBe("Cerrada");
  });
});