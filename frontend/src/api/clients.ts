import { canAccess, type User } from "./auth";

export type ClientType = "Persona" | "Empresa";
export type ClientSegment = "Estándar" | "Corporativo" | "VIP";
export type DocType = "CC" | "NIT" | "CE" | "Pasaporte";
export interface Companion {
  id: string; fullName: string; birthDate: string; isMinor: boolean;
  docType: DocType; docNumber: string; passportExpiry?: string | undefined;
}
export interface ClientAudit { id: string; action: string; reason?: string | undefined; user: string; timestamp: string }
export interface ClientRecord {
  id: string; code: string; name: string; email: string; phone: string;
  type: ClientType; segment: ClientSegment; docType: DocType; docNumber: string;
  passportNumber?: string | undefined; passportExpiry?: string | undefined; billingAddress: string; taxRegime: string;
  companions: Companion[]; notes: string[];
  linkedRequests: { code: string; destination: string; date: string; status: string }[];
  auditLog: ClientAudit[];
}
export type ClientActor = Omit<User, "password">;
export type ClientInput = Omit<ClientRecord, "id" | "code" | "linkedRequests" | "auditLog">;
export const CLIENT_LATENCY_MS = 500;
export const CLIENT_TYPES: ClientType[] = ["Persona", "Empresa"];
export const CLIENT_SEGMENTS: ClientSegment[] = ["Estándar", "Corporativo", "VIP"];
export const DOC_TYPES: DocType[] = ["CC", "NIT", "CE", "Pasaporte"];
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, CLIENT_LATENCY_MS));
const clone = <T,>(value: T): T => structuredClone(value);
const initial = (id: string, code: string, name: string, email: string, phone: string, segment: ClientSegment, docNumber: string): ClientRecord => ({
  id, code, name, email, phone, segment, type: "Persona", docType: "CC", docNumber,
  billingAddress: "", taxRegime: "", companions: [], notes: [], linkedRequests: [],
  auditLog: [{ id: `${id}-a0`, action: "Expediente creado", user: "Laura Gómez", timestamp: "2026-10-26T14:30:00.000Z" }],
});
let records: ClientRecord[] = [
  { ...initial("u4", "EXP-2026-001", "Carlos Pérez", "cliente@travelrequests.co", "+57 300 000 0001", "Estándar", "1030000001"),
    companions: [{ id: "v1", fullName: "Ana Pérez", birthDate: "1994-05-18", isMinor: false, docType: "CC", docNumber: "1030000004" }],
    notes: ["Prefiere alojamiento cerca del centro histórico."],
    linkedRequests: [{ code: "SOL-2026-001", destination: "Cartagena", date: "2026-11-12", status: "Abierta" }, { code: "SOL-2026-004", destination: "San Andrés", date: "2026-10-12", status: "Cerrada" }] },
  { ...initial("c2", "EXP-2026-002", "Valentina Torres", "valentina@example.com", "+57 300 000 0002", "VIP", "1030000002"),
    companions: [{ id: "v2", fullName: "Sofía Torres", birthDate: "2016-02-12", isMinor: true, docType: "Pasaporte", docNumber: "DEMO0002", passportExpiry: "2028-02-12" }],
    linkedRequests: [{ code: "SOL-2026-002", destination: "San Andrés", date: "2026-12-05", status: "En cotización" }] },
  { ...initial("c3", "EXP-2026-003", "Diego Martínez", "diego@example.com", "+57 300 000 0003", "Estándar", "1030000003"),
    linkedRequests: [{ code: "SOL-2026-003", destination: "Cartagena", date: "2026-12-18", status: "Abierta" }] },
];
function authorize(actor: ClientActor) {
  if (!actor.active || !canAccess(actor.role, "/expedientes")) throw new Error("No tienes permiso para acceder a los expedientes.");
}
const owns = (actor: ClientActor, id: string) => actor.role !== "Cliente" || actor.id === id;
let nextClientSeq = 4;

export function canCreateClient(actor: ClientActor) {
  return actor.active && canAccess(actor.role, "/expedientes") && (actor.role === "Administrador" || actor.role === "Asesor");
}
export function canEditClient(actor: ClientActor, id: string) {
  return actor.active && canAccess(actor.role, "/expedientes") && actor.role !== "Contabilidad" && owns(actor, id);
}

/** Snapshot interno sin latencia para mantener sincronizados solicitudes y reservas en memoria. */
export function getClientDirectorySnapshot() {
  return records.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    createdAt: r.auditLog[0]?.timestamp ?? "2026-10-26T14:30:00.000Z",
    createdBy: r.auditLog[0]?.user ?? "Laura Gómez",
  }));
}
export function getClientDossierSnapshot(clientId: string): ClientRecord | undefined {
  const found = records.find((r) => r.id === clientId);
  return found ? clone(found) : undefined;
}
export function syncClientLinkedRequest(
  clientId: string,
  linked: { code: string; destination: string; date: string; status: string },
) {
  records = records.map((r) => {
    if (r.id !== clientId) return r;
    const exists = r.linkedRequests.some((x) => x.code === linked.code);
    const linkedRequests = exists
      ? r.linkedRequests.map((x) => (x.code === linked.code ? linked : x))
      : [linked, ...r.linkedRequests];
    return { ...r, linkedRequests };
  });
}
export async function listClientRecords(actor: ClientActor): Promise<ClientRecord[]> {
  await delay(); authorize(actor);
  return clone(records.filter((record) => owns(actor, record.id)));
}
export async function getClientRecord(actor: ClientActor, id: string): Promise<ClientRecord> {
  await delay(); authorize(actor);
  const record = records.find((item) => item.id === id && owns(actor, id));
  if (!record) throw new Error("El expediente no está disponible.");
  return clone(record);
}
function validate(input: ClientInput) {
  if (!input.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || !input.phone.trim() || !input.docNumber.trim()) throw new Error("Revisa el nombre, correo, teléfono y documento.");
  if (!CLIENT_TYPES.includes(input.type) || !CLIENT_SEGMENTS.includes(input.segment) || !DOC_TYPES.includes(input.docType)) throw new Error("Selecciona un tipo, segmento y documento válidos.");
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (input.passportExpiry && !validDate(input.passportExpiry)) throw new Error("Revisa el vencimiento del pasaporte.");
  const ids = new Set<string>();
  for (const companion of input.companions) {
    if (!companion.id || ids.has(companion.id) || !companion.fullName.trim() || !companion.docNumber.trim() || !DOC_TYPES.includes(companion.docType) || !validDate(companion.birthDate) || companion.birthDate > new Date().toISOString().slice(0, 10) || (companion.passportExpiry && !validDate(companion.passportExpiry))) throw new Error("Revisa los datos de los viajeros.");
    ids.add(companion.id);
  }
}
export async function createClientRecord(actor: ClientActor, input: ClientInput): Promise<ClientRecord> {
  await delay(); authorize(actor);
  if (!canCreateClient(actor)) throw new Error("Solo Administrador o Asesor pueden registrar nuevos clientes.");
  validate(input);
  const emailLower = input.email.trim().toLowerCase();
  if (records.some((r) => r.email.toLowerCase() === emailLower)) {
    throw new Error("Ya existe un expediente con ese correo electrónico.");
  }
  const n = nextClientSeq++;
  const id = `c${n}`;
  const code = `EXP-${new Date().getUTCFullYear()}-${String(n).padStart(3, "0")}`;
  const created: ClientRecord = {
    ...clone(input),
    id,
    code,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    linkedRequests: [],
    auditLog: [{ id: `${id}-a0`, action: "Expediente creado", user: actor.name, timestamp: new Date().toISOString() }],
  };
  records = [created, ...records];
  return clone(created);
}

export async function updateClientRecord(actor: ClientActor, id: string, input: ClientInput, reason?: string): Promise<ClientRecord> {
  await delay(); authorize(actor);
  const previous = records.find((record) => record.id === id && owns(actor, id));
  if (!previous) throw new Error("El expediente no está disponible.");
  if (!canEditClient(actor, id)) throw new Error("Tu rol solo permite consultar expedientes.");
  validate(input);
  const updated: ClientRecord = { ...clone(input), id: previous.id, code: previous.code,
    name: input.name.trim(), email: input.email.trim(), phone: input.phone.trim(),
    linkedRequests: clone(previous.linkedRequests),
    auditLog: [...previous.auditLog, { id: `${id}-a${previous.auditLog.length}`, action: "Expediente y viajeros actualizados", ...(reason?.trim() ? { reason: reason.trim() } : {}), user: actor.name, timestamp: new Date().toISOString() }],
  };
  records = records.map((record) => record.id === id ? updated : record);
  return clone(updated);
}