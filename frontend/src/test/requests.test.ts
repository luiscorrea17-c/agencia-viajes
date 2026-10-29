import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { RequestActor, RequestInput } from "@/api/requests";

const admin: RequestActor = { id: "u1", name: "Laura Gómez", email: "admin@travelrequests.co", role: "Administrador", avatarUrl: "", branch: "Bogotá", active: true };
const client: RequestActor = { ...admin, id: "u4", name: "Carlos Pérez", email: "cliente@travelrequests.co", role: "Cliente" };
const input: RequestInput = { clientId: "u4", destination: "Cartagena", startDate: "2026-11-10", endDate: "2026-11-15", budgetCOP: 4500000, travelersCount: 2, status: "Abierta", notes: "Hotel con desayuno" };
async function finish<T>(promise: Promise<T>) { await vi.advanceTimersByTimeAsync(500); return promise; }

describe("Servicios de solicitudes", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it("usa exactamente los tres estados definidos", async () => {
    const api = await import("@/api/requests");
    expect(api.REQUEST_STATUSES).toEqual(["Abierta", "En cotización", "Cerrada"]);
    const rows = await finish(api.listRequests(admin));
    expect(rows.length).toBe(4);
    expect(rows.every((row) => api.REQUEST_STATUSES.includes(row.status))).toBe(true);
  });
  it("simula una latencia de 500 ms", async () => {
    const api = await import("@/api/requests");
    let done = false;
    const result = api.listRequests(admin).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(499); expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await result; expect(done).toBe(true);
    expect(api.REQUEST_LATENCY_MS).toBe(500);
  });
  it("solo devuelve las solicitudes propias del Cliente", async () => {
    const api = await import("@/api/requests");
    const rows = await finish(api.listRequests(client));
    expect(rows.map((row) => row.id)).toEqual(["r1", "r4"]);
    const clients = await finish(api.listClients(client)); expect(clients.map((row) => row.id)).toEqual(["u4"]);
    const blocked = expect(api.getRequest(client, "r2")).rejects.toThrow("no está disponible");
    await vi.advanceTimersByTimeAsync(500); await blocked;
  });
  it("impide crear solicitudes para otro cliente", async () => {
    const api = await import("@/api/requests");
    const blocked = expect(api.createRequest(client, { ...input, clientId: "c2" })).rejects.toThrow("cliente válido");
    await vi.advanceTimersByTimeAsync(500); await blocked;
  });
  it("crea y permite releer todos los valores con auditoría", async () => {
    const api = await import("@/api/requests");
    const created = await finish(api.createRequest(client, input));
    expect(created).toMatchObject({ ...input, clientName: "Carlos Pérez", clientEmail: "cliente@travelrequests.co", createdBy: "Carlos Pérez", updatedBy: "Carlos Pérez" });
    expect(created.history).toHaveLength(1);
    expect(created.history[0]).toMatchObject({ action: "Solicitud creada", user: "Carlos Pérez" });
    expect(await finish(api.getRequest(client, created.id))).toEqual(created);
  });
  it("registra los cambios sin perder el historial anterior", async () => {
    const api = await import("@/api/requests");
    const updated = await finish(api.updateRequest(admin, "r1", { ...input, status: "En cotización", budgetCOP: 5500000 }));
    expect(updated.status).toBe("En cotización"); expect(updated.budgetCOP).toBe(5500000);
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1]).toMatchObject({ action: "Estado cambiado a En cotización", user: "Laura Gómez" });
  });
  it("rechaza el acceso de Contabilidad como el menú existente", async () => {
    const api = await import("@/api/requests");
    const blocked = expect(api.listRequests({ ...admin, role: "Contabilidad" })).rejects.toThrow("No tienes permiso");
    await vi.advanceTimersByTimeAsync(500); await blocked;
  });
  it("rechaza fechas invertidas", async () => {
    const api = await import("@/api/requests");
    const blocked = expect(api.createRequest(admin, { ...input, endDate: "2026-11-09" })).rejects.toThrow("fechas");
    await vi.advanceTimersByTimeAsync(500); await blocked;
  });
  it("rechaza presupuestos no positivos", async () => {
    const api = await import("@/api/requests");
    const blocked = expect(api.createRequest(admin, { ...input, budgetCOP: 0 })).rejects.toThrow("mayor a cero");
    await vi.advanceTimersByTimeAsync(500); await blocked;
  });
  it("requiere al menos un viajero", async () => {
    const api = await import("@/api/requests");
    const blocked = expect(api.createRequest(admin, { ...input, travelersCount: 0 })).rejects.toThrow("al menos un viajero");
    await vi.advanceTimersByTimeAsync(500); await blocked;
  });
});