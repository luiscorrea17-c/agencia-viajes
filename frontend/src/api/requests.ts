import { canAccess, type User } from "./auth";
import { apiRequest, jsonBody } from "./http";

export type RequestStatus = "Abierta" | "En cotización" | "Cerrada";

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  createdBy: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  user: string;
  timestamp: string;
}

export interface TravelRequest {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  destination: string;
  thumbnailUrl: string;
  startDate: string;
  endDate: string;
  budgetCOP: number;
  travelersCount: number;
  status: RequestStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  history: AuditEntry[];
}

export type RequestActor = Omit<User, "password">;

export interface RequestInput {
  clientId: string;
  destination: string;
  startDate: string;
  endDate: string;
  budgetCOP: number;
  travelersCount: number;
  notes: string;
  status: RequestStatus;
}

export const REQUEST_STATUSES: RequestStatus[] = ["Abierta", "En cotización", "Cerrada"];
export const REQUEST_LATENCY_MS = 0;

export async function listClients(_actor: RequestActor): Promise<Client[]> {
  return apiRequest<Client[]>("/api/requests/clients");
}

export async function listRequests(_actor: RequestActor): Promise<TravelRequest[]> {
  return apiRequest<TravelRequest[]>("/api/requests");
}

export async function getRequest(_actor: RequestActor, id: string): Promise<TravelRequest> {
  return apiRequest<TravelRequest>(`/api/requests/${encodeURIComponent(id)}`);
}

export async function createRequest(
  _actor: RequestActor,
  input: RequestInput,
): Promise<TravelRequest> {
  return apiRequest<TravelRequest>("/api/requests", {
    method: "POST",
    body: jsonBody(input),
  });
}

export async function updateRequest(
  _actor: RequestActor,
  id: string,
  input: RequestInput,
): Promise<TravelRequest> {
  return apiRequest<TravelRequest>(`/api/requests/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: jsonBody(input),
  });
}

export function canAccessRequests(actor: RequestActor): boolean {
  return actor.active && canAccess(actor.role, "/solicitudes");
}

export function canManageRequests(actor: RequestActor): boolean {
  return actor.active && (actor.role === "Asesor" || actor.role === "Cliente");
}
