import { canAccess, type User } from "./auth";
import { getClientDirectorySnapshot, syncClientLinkedRequest } from "./clients";
import cartagena from "@/assets/cartagena.jpg";
import sanAndres from "@/assets/san-andres.jpg";

export type RequestStatus = "Abierta" | "En cotización" | "Cerrada";
export interface Client {
  id: string; name: string; email: string; phone: string; createdAt: string; createdBy: string;
}
export interface AuditEntry { id: string; action: string; user: string; timestamp: string }
export interface TravelRequest {
  id: string; code: string; clientId: string; clientName: string; clientEmail: string; clientPhone: string;
  destination: string; thumbnailUrl: string; startDate: string; endDate: string; budgetCOP: number;
  travelersCount: number; status: RequestStatus; notes: string; createdBy: string; createdAt: string;
  updatedBy: string; updatedAt: string; history: AuditEntry[];
}
export type RequestActor = Omit<User, "password">;
export interface RequestInput {
  clientId: string; destination: string; startDate: string; endDate: string;
  budgetCOP: number; travelersCount: number; notes: string; status: RequestStatus;
}
export const REQUEST_STATUSES: RequestStatus[] = ["Abierta", "En cotización", "Cerrada"];
export const REQUEST_LATENCY_MS = 500;
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, REQUEST_LATENCY_MS));
const createdAt = "2026-10-26T14:30:00.000Z";
const clients: Client[] = [
  { id: "u4", name: "Carlos Pérez", email: "cliente@travelrequests.co", phone: "+57 300 000 0001", createdAt, createdBy: "Laura Gómez" },
  { id: "c2", name: "Valentina Torres", email: "valentina@example.com", phone: "+57 300 000 0002", createdAt, createdBy: "Andrés Ruiz" },
  { id: "c3", name: "Diego Martínez", email: "diego@example.com", phone: "+57 300 000 0003", createdAt, createdBy: "Laura Gómez" },
];
const thumbnail = (destination: string) => /san andr|playa|isla/i.test(destination) ? sanAndres : cartagena;
const seed = (id: number, client: Client, destination: string, startDate: string, endDate: string, budgetCOP: number, travelersCount: number, status: RequestStatus, notes: string): TravelRequest => ({
  id: `r${id}`, code: `SOL-2026-${String(id).padStart(3, "0")}`, clientId: client.id, clientName: client.name,
  clientEmail: client.email, clientPhone: client.phone, destination, thumbnailUrl: thumbnail(destination),
  startDate, endDate, budgetCOP, travelersCount, status, notes, createdBy: "Andrés Ruiz", createdAt,
  updatedBy: "Andrés Ruiz", updatedAt: createdAt,
  history: [{ id: `a${id}`, action: "Solicitud creada", user: "Andrés Ruiz", timestamp: createdAt }],
});
const [carlos, valentina, diego] = clients;
let requests: TravelRequest[] = carlos && valentina && diego ? [
  seed(1, carlos, "Cartagena", "2026-11-12", "2026-11-17", 4500000, 2, "Abierta", "Viaje en pareja. Preferimos un hotel cerca del centro histórico y desayuno incluido."),
  seed(2, valentina, "San Andrés", "2026-12-05", "2026-12-10", 7200000, 4, "En cotización", "Vacaciones en familia. Dos adultos y dos niños; habitaciones comunicadas."),
  seed(3, diego, "Cartagena", "2026-12-18", "2026-12-22", 3200000, 1, "Abierta", "Viaje de descanso. Hotel con piscina y traslado desde el aeropuerto."),
  seed(4, carlos, "San Andrés", "2026-10-12", "2026-10-16", 5100000, 2, "Cerrada", "Solicitud finalizada. Viaje de aniversario."),
] : [];
let nextId = 5;
const clone = <T,>(value: T): T => structuredClone(value);
function authorize(actor: RequestActor) {
  if (!actor.active || !canAccess(actor.role, "/solicitudes")) throw new Error("No tienes permiso para acceder a las solicitudes.");
}
const owns = (actor: RequestActor, clientId: string) => actor.role !== "Cliente" || actor.id === clientId;
export async function listClients(actor: RequestActor): Promise<Client[]> {
  await delay(); authorize(actor);
  return clone(getClientDirectorySnapshot().filter((client) => owns(actor, client.id)));
}
export async function listRequests(actor: RequestActor): Promise<TravelRequest[]> {
  await delay(); authorize(actor);
  return clone(requests.filter((request) => owns(actor, request.clientId)));
}
export async function getRequest(actor: RequestActor, id: string): Promise<TravelRequest> {
  await delay(); authorize(actor);
  const request = requests.find((item) => item.id === id && owns(actor, item.clientId));
  if (!request) throw new Error("La solicitud no está disponible.");
  return clone(request);
}
export function syncRequestLifecycle(id: string, status: RequestStatus, actorName: string, note: string) {
  const previous = requests.find((item) => item.id === id);
  if (!previous || previous.status === status) return;
  const timestamp = new Date().toISOString();
  const updated: TravelRequest = {
    ...previous,
    status,
    updatedBy: actorName,
    updatedAt: timestamp,
    history: [...previous.history, { id: `a-${id}-${previous.history.length}`, action: note, user: actorName, timestamp }],
  };
  requests = requests.map((item) => (item.id === id ? updated : item));
  syncClientLinkedRequest(updated.clientId, {
    code: updated.code,
    destination: updated.destination,
    date: updated.startDate,
    status: updated.status,
  });
}
function validate(input: RequestInput, actor: RequestActor): Client {
  const client = getClientDirectorySnapshot().find((item) => item.id === input.clientId);
  if (!client || !owns(actor, client.id)) throw new Error("Selecciona un cliente válido.");
  if (!input.destination.trim()) throw new Error("Ingresa el destino.");
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  if (!validDate(input.startDate) || !validDate(input.startDate) || !validDate(input.endDate) || input.endDate < input.startDate) throw new Error("Revisa las fechas del viaje.");
  if (!Number.isFinite(input.budgetCOP) || input.budgetCOP <= 0) throw new Error("El presupuesto debe ser mayor a cero.");
  if (!Number.isInteger(input.travelersCount) || input.travelersCount < 1) throw new Error("Ingresa al menos un viajero.");
  if (!REQUEST_STATUSES.includes(input.status)) throw new Error("Selecciona un estado válido.");
  return client;
}
export async function createRequest(actor: RequestActor, input: RequestInput): Promise<TravelRequest> {
  await delay(); authorize(actor);
  const client = validate(input, actor);
  const number = nextId++;
  const timestamp = new Date().toISOString();
  const request: TravelRequest = {
    ...input, destination: input.destination.trim(), status: "Abierta", id: `r${number}`,
    code: `SOL-${new Date().getUTCFullYear()}-${String(number).padStart(3, "0")}`,
    clientName: client.name, clientEmail: client.email, clientPhone: client.phone,
    thumbnailUrl: thumbnail(input.destination), createdBy: actor.name, createdAt: timestamp,
    updatedBy: actor.name, updatedAt: timestamp,
    history: [{ id: `a-${number}-0`, action: "Solicitud creada", user: actor.name, timestamp }],
  };
  requests = [request, ...requests];
  syncClientLinkedRequest(request.clientId, {
    code: request.code,
    destination: request.destination,
    date: request.startDate,
    status: request.status,
  });
  return clone(request);
}
export async function updateRequest(actor: RequestActor, id: string, input: RequestInput): Promise<TravelRequest> {
  await delay(); authorize(actor);
  const previous = requests.find((item) => item.id === id && owns(actor, item.clientId));
  if (!previous) throw new Error("La solicitud no está disponible.");
  const client = validate(input, actor);
  const timestamp = new Date().toISOString();
  const status = actor.role === "Cliente" ? previous.status : input.status;
  const updated: TravelRequest = { ...previous, ...input, status, destination: input.destination.trim(),
    clientName: client.name, clientEmail: client.email, clientPhone: client.phone,
    thumbnailUrl: thumbnail(input.destination), updatedBy: actor.name, updatedAt: timestamp,
    history: [...previous.history, { id: `a-${id}-${previous.history.length}`, action: status !== previous.status ? `Estado cambiado a ${status}` : "Solicitud actualizada", user: actor.name, timestamp }],
  };
  requests = requests.map((item) => item.id === id ? updated : item);
  syncClientLinkedRequest(updated.clientId, {
    code: updated.code,
    destination: updated.destination,
    date: updated.startDate,
    status: updated.status,
  });
  return clone(updated);
}