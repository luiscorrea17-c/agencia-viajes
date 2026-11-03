import { canAccess, type User } from "./auth";
import { apiRequest, jsonBody } from "./http";

export type ClientType = "Persona" | "Empresa";
export type ClientSegment = "Estándar" | "Corporativo" | "VIP";
export type DocType = "CC" | "NIT" | "CE" | "Pasaporte";

export interface Companion {
  id: string;
  fullName: string;
  birthDate: string;
  isMinor: boolean;
  docType: DocType;
  docNumber: string;
  passportExpiry?: string | undefined;
}

export interface ClientAudit {
  id: string;
  action: string;
  reason?: string | undefined;
  user: string;
  timestamp: string;
}

export interface ClientRecord {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  type: ClientType;
  segment: ClientSegment;
  docType: DocType;
  docNumber: string;
  passportNumber?: string | undefined;
  passportExpiry?: string | undefined;
  billingAddress: string;
  taxRegime: string;
  companions: Companion[];
  notes: string[];
  linkedRequests: { code: string; destination: string; date: string; status: string }[];
  auditLog: ClientAudit[];
}

export type ClientActor = Omit<User, "password">;
export type ClientInput = Omit<ClientRecord, "id" | "code" | "linkedRequests" | "auditLog">;
export const CLIENT_LATENCY_MS = 0;
export const CLIENT_TYPES: ClientType[] = ["Persona", "Empresa"];
export const CLIENT_SEGMENTS: ClientSegment[] = ["Estándar", "Corporativo", "VIP"];
export const DOC_TYPES: DocType[] = ["CC", "NIT", "CE", "Pasaporte"];

export class ClientApiError extends Error {}

export function canCreateClient(actor: ClientActor) {
  return actor.active && canAccess(actor.role, "/expedientes") &&
    (actor.role === "Administrador" || actor.role === "Asesor");
}

export function canEditClient(actor: ClientActor, _id: string) {
  return actor.active && canAccess(actor.role, "/expedientes") &&
    actor.role !== "Contabilidad";
}

export async function listClientRecords(_actor: ClientActor): Promise<ClientRecord[]> {
  return apiRequest<ClientRecord[]>("/api/clients");
}

export async function getClientRecord(_actor: ClientActor, id: string): Promise<ClientRecord> {
  return apiRequest<ClientRecord>(`/api/clients/${encodeURIComponent(id)}`);
}

export async function createClientRecord(
  _actor: ClientActor,
  input: ClientInput,
): Promise<ClientRecord> {
  return apiRequest<ClientRecord>("/api/clients", {
    method: "POST",
    body: jsonBody(input),
  });
}

export async function updateClientRecord(
  _actor: ClientActor,
  id: string,
  input: ClientInput,
  reason?: string,
): Promise<ClientRecord> {
  const query = reason?.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : "";
  return apiRequest<ClientRecord>(`/api/clients/${encodeURIComponent(id)}${query}`, {
    method: "PUT",
    body: jsonBody(input),
  });
}
