import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientActor, ClientInput, ClientRecord } from "@/api/clients";
const admin: ClientActor = { id: "u1", name: "Laura Gómez", email: "admin@travelrequests.co", role: "Administrador", avatarUrl: "", branch: "Bogotá", active: true };
const client: ClientActor = { ...admin, id: "u4", name: "Carlos Pérez", role: "Cliente" };
const input = (record: ClientRecord): ClientInput => { const { id, code, linkedRequests, auditLog, ...value } = record; return value; };
async function finish<T>(promise: Promise<T>) { await vi.advanceTimersByTimeAsync(500); return promise; }
describe("Expedientes y viajeros", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());
  it("usa 500 ms de latencia", async () => {
    const api = await import("@/api/clients"); let done = false;
    const result = api.listClientRecords(admin).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(499); expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await result; expect(done).toBe(true); expect(api.CLIENT_LATENCY_MS).toBe(500);
  });
  it("mantiene los tipos exactos del documento", async () => {
    const api = await import("@/api/clients");
    expect(api.CLIENT_TYPES).toEqual(["Persona", "Empresa"]);
    expect(api.CLIENT_SEGMENTS).toEqual(["Estándar", "Corporativo", "VIP"]);
    expect(api.DOC_TYPES).toEqual(["CC", "NIT", "CE", "Pasaporte"]);
  });
  it.each(["Administrador", "Asesor"] as const)("%s consulta y edita todos los expedientes", async (role) => {
    const api = await import("@/api/clients"); const actor = { ...admin, role };
    expect((await finish(api.listClientRecords(actor))).map((record) => record.id)).toEqual(["u4", "c2", "c3"]);
    const record = await finish(api.getClientRecord(actor, "c2"));
    const updated = await finish(api.updateClientRecord(actor, "c2", { ...input(record), billingAddress: "Calle de prueba 10", companions: [...record.companions, { id: "test", fullName: "Viajero de prueba", birthDate: "2000-01-01", isMinor: false, docType: "CC", docNumber: "12345" }] }, "Actualización autorizada"));
    expect(updated.billingAddress).toBe("Calle de prueba 10"); expect(updated.companions).toHaveLength(2);
    expect(updated.auditLog.at(-1)).toMatchObject({ user: actor.name, reason: "Actualización autorizada" });
    expect(await finish(api.getClientRecord(actor, "c2"))).toEqual(updated);
  });
  it("Contabilidad consulta todo pero no edita", async () => {
    const api = await import("@/api/clients"); const actor = { ...admin, role: "Contabilidad" as const };
    expect(await finish(api.listClientRecords(actor))).toHaveLength(3);
    const record = await finish(api.getClientRecord(actor, "u4"));
    const blocked = expect(api.updateClientRecord(actor, "u4", input(record))).rejects.toThrow("solo permite consultar");
    await vi.advanceTimersByTimeAsync(500); await blocked;
  });
  it("Cliente consulta y edita solo su expediente", async () => {
    const api = await import("@/api/clients"); const records = await finish(api.listClientRecords(client)); expect(records.map((record) => record.id)).toEqual(["u4"]);
    const record = await finish(api.getClientRecord(client, "u4"));
    expect((await finish(api.updateClientRecord(client, "u4", { ...input(record), phone: "3001234567" }))).phone).toBe("3001234567");
    const read = expect(api.getClientRecord(client, "c2")).rejects.toThrow("no está disponible"); await vi.advanceTimersByTimeAsync(500); await read;
    const edit = expect(api.updateClientRecord(client, "c2", input(record))).rejects.toThrow("no está disponible"); await vi.advanceTimersByTimeAsync(500); await edit;
  });
  it("registra clientes nuevos y los expone en el directorio de solicitudes", async () => {
    const api = await import("@/api/clients");
    const reqApi = await import("@/api/requests");
    const created = await finish(api.createClientRecord(admin, {
      name: "Mariana Restrepo",
      email: "mariana@example.com",
      phone: "+57 311 000 9999",
      type: "Persona",
      segment: "VIP",
      docType: "CC",
      docNumber: "1040555666",
      billingAddress: "Cra 15 # 85-10",
      taxRegime: "Persona natural",
      companions: [],
      notes: ["Cliente nueva"],
    }));
    expect(created.code).toMatch(/^EXP-\d{4}-004$/);
    const availableClients = await finish(reqApi.listClients(admin));
    expect(availableClients.some((c) => c.id === created.id && c.name === "Mariana Restrepo")).toBe(true);
    const blocked = expect(api.createClientRecord(client, input(created))).rejects.toThrow("Solo Administrador o Asesor");
    await vi.advanceTimersByTimeAsync(500); await blocked;
  });
});