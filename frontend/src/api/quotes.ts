// Servicio mock del Cotizador IA. Reemplazar por FastAPI manteniendo firmas y reglas.
import { apiRequest, isBackendEnabled } from "./client";
import { canAccess } from "./auth";
import { getRequest, syncRequestLifecycle, type RequestActor } from "./requests";

export type QuoteStatus = "Borrador" | "Enviada" | "Aprobada" | "Rechazada" | "Expirada";
export type ServiceCategory = "Vuelos" | "Alojamiento" | "Traslados" | "Actividades" | "Asistencia";
export interface QuoteServiceItem {
  id: string; category: ServiceCategory; description: string; quantity: number;
  unitPriceCOP: number; isAiGenerated: boolean; editedByAdvisor: boolean;
}
export interface BudgetAllocation {
  category: ServiceCategory;
  quotedCOP: number;
  quotedPercent: number;
}
export interface Quote {
  id: string; code: string; requestId: string; requestBudgetCOP: number; version: number;
  clientName: string; clientEmail: string; destination: string;
  commercialDescription: string; isDescriptionAiGenerated: boolean; items: QuoteServiceItem[];
  basePriceCOP: number; seasonSurchargePercent: number; seasonSurchargeCOP: number;
  discountPercent: number; discountCOP: number; requiresAdminApproval: boolean; adminApprovedBy?: string | undefined;
  totalCOP: number; validUntil: string; status: QuoteStatus; advisorDecisionLog: string;
  updatedBy: string; updatedAt: string;
}
export interface QuoteDraftInput {
  commercialDescription: string; isDescriptionAiGenerated: boolean; items: QuoteServiceItem[];
  seasonSurchargePercent: number; discountPercent: number; validUntil: string; decisionNote: string;
}

export const QUOTE_STATUSES: QuoteStatus[] = ["Borrador", "Enviada", "Aprobada", "Rechazada", "Expirada"];
export const SERVICE_CATEGORIES: ServiceCategory[] = ["Vuelos", "Alojamiento", "Traslados", "Actividades", "Asistencia"];
export const QUOTE_LATENCY_MS = 800;
/** Descuentos por encima de este porcentaje requieren aprobación del Administrador antes de enviar. */
export const MAX_DISCOUNT_WITHOUT_APPROVAL = 10;

const delay = () => new Promise<void>((r) => setTimeout(r, QUOTE_LATENCY_MS));
const clone = <T,>(v: T): T => structuredClone(v);
const today = () => new Date().toISOString().slice(0, 10);

export function computeTotals(items: QuoteServiceItem[], seasonSurchargePercent: number, discountPercent: number) {
  const basePriceCOP = items.reduce((s, i) => s + i.quantity * i.unitPriceCOP, 0);
  const seasonSurchargeCOP = Math.round(basePriceCOP * seasonSurchargePercent / 100);
  const discountCOP = Math.round((basePriceCOP + seasonSurchargeCOP) * discountPercent / 100);
  return {
    basePriceCOP, seasonSurchargeCOP, discountCOP,
    totalCOP: basePriceCOP + seasonSurchargeCOP - discountCOP,
    requiresAdminApproval: discountPercent > MAX_DISCOUNT_WITHOUT_APPROVAL,
  };
}

export function computeBudgetDistribution(items: QuoteServiceItem[]): BudgetAllocation[] {
  const baseTotal = items.reduce((s, i) => s + i.quantity * i.unitPriceCOP, 0);
  return SERVICE_CATEGORIES.map((category) => {
    const quotedCOP = items
      .filter((i) => i.category === category)
      .reduce((s, i) => s + i.quantity * i.unitPriceCOP, 0);
    return {
      category,
      quotedCOP,
      quotedPercent: baseTotal > 0 ? Math.round((quotedCOP / baseTotal) * 100) : 0,
    };
  });
}

let itemSeq = 100;
const round5k = (value: number) => Math.max(25000, Math.round(value / 5000) * 5000);

const aiItems = (
  destination: string,
  travelers: number,
  nights: number,
  budgetCOP: number,
  notes = "",
): QuoteServiceItem[] => {
  const mk = (category: ServiceCategory, description: string, quantity: number, unitPriceCOP: number): QuoteServiceItem =>
    ({ id: `i${itemSeq++}`, category, description, quantity, unitPriceCOP, isAiGenerated: true, editedByAdvisor: false });
  const premiumStay = /boutique|5 estrellas|lujo|frente al mar|comunicad/i.test(notes);
  const weights = premiumStay
    ? { vuelos: 0.34, hotel: 0.42, traslados: 0.08, actividades: 0.10, asistencia: 0.06 }
    : { vuelos: 0.38, hotel: 0.36, traslados: 0.08, actividades: 0.12, asistencia: 0.06 };
  const hotelLabel = /comunicad/i.test(notes)
    ? `Hotel en ${destination} con habitaciones comunicadas y desayuno (${nights} noches)`
    : /centro hist/i.test(notes)
      ? `Hotel cerca del centro histórico en ${destination} con desayuno`
      : `Hotel seleccionado en ${destination} con desayuno incluido`;
  return [
    mk("Vuelos", `Tiquete ida y regreso Bogotá – ${destination}, tarifa con equipaje`, travelers, round5k((budgetCOP * weights.vuelos) / travelers)),
    mk("Alojamiento", hotelLabel, nights, round5k((budgetCOP * weights.hotel) / nights)),
    mk("Traslados", "Traslado privado aeropuerto – hotel – aeropuerto", 1, round5k(budgetCOP * weights.traslados)),
    mk("Actividades", `Recorrido guiado y experiencia local en ${destination}`, travelers, round5k((budgetCOP * weights.actividades) / travelers)),
    mk("Asistencia", "Asistencia médica integral durante el viaje", travelers, round5k((budgetCOP * weights.asistencia) / travelers)),
  ];
};
const aiDescription = (destination: string, travelers: number, nights: number, notes = "") => {
  const noteHint = notes.trim() ? ` Incluye preferencias solicitadas: ${notes.trim().replace(/\.$/, "")}.` : "";
  return `Propuesta de ${nights} ${nights === 1 ? "noche" : "noches"} en ${destination} para ${travelers} ${travelers === 1 ? "viajero" : "viajeros"}, con distribución equilibrada de vuelos, alojamiento con desayuno, traslados, actividad guiada y asistencia.${noteHint}`;
};

function build(base: Omit<Quote, keyof ReturnType<typeof computeTotals>>): Quote {
  return { ...base, ...computeTotals(base.items, base.seasonSurchargePercent, base.discountPercent) };
}
const seedAt = "2026-10-27T15:00:00.000Z";
let quotes: Quote[] = [
  build({ id: "q1", code: "COT-2026-001", requestId: "r1", requestBudgetCOP: 4500000, version: 1, clientName: "Carlos Pérez", clientEmail: "cliente@travelrequests.co", destination: "Cartagena",
    commercialDescription: aiDescription("Cartagena", 2, 5, "Preferimos un hotel cerca del centro histórico y desayuno incluido."), isDescriptionAiGenerated: true, items: aiItems("Cartagena", 2, 5, 4500000, "centro histórico"),
    seasonSurchargePercent: 8, discountPercent: 5, validUntil: "2026-11-30", status: "Enviada",
    advisorDecisionLog: "27/10/2026 · Andrés Ruiz: Se mantiene la distribución de presupuesto sugerida por IA; descuento de fidelidad del 5 %.", updatedBy: "Andrés Ruiz", updatedAt: seedAt }),
  build({ id: "q2", code: "COT-2026-002", requestId: "r2", requestBudgetCOP: 7200000, version: 1, clientName: "Valentina Torres", clientEmail: "valentina@example.com", destination: "San Andrés",
    commercialDescription: "Vacaciones familiares en San Andrés con habitaciones comunicadas y actividades para niños.", isDescriptionAiGenerated: false,
    items: aiItems("San Andrés", 4, 5, 7200000, "habitaciones comunicadas").map((i) => i.category === "Alojamiento" ? { ...i, unitPriceCOP: 640000, editedByAdvisor: true } : i),
    seasonSurchargePercent: 15, discountPercent: 12, validUntil: "2026-11-20", status: "Borrador",
    advisorDecisionLog: "27/10/2026 · Andrés Ruiz: Se ajusta el hotel por habitaciones comunicadas; descuento del 12 % pendiente de aprobación.", updatedBy: "Andrés Ruiz", updatedAt: seedAt }),
];
let nextQuote = 3;

const isStaff = (a: RequestActor) => a.role === "Administrador" || a.role === "Asesor" || a.role === "Contabilidad";
function authorize(actor: RequestActor) {
  if (!actor.active) throw new Error("Tu usuario está inactivo.");
  const path = actor.role === "Cliente" ? "/mis-cotizaciones" : "/cotizador-ia";
  if (!canAccess(actor.role, path)) throw new Error("No tienes permiso para acceder a las cotizaciones.");
}
const CLIENT_VISIBLE: QuoteStatus[] = ["Enviada", "Aprobada", "Rechazada", "Expirada"];
const visible = (a: RequestActor, q: Quote) => isStaff(a) || (q.clientEmail === a.email && CLIENT_VISIBLE.includes(q.status));
function expire(q: Quote): Quote {
  return q.status === "Enviada" && q.validUntil < today() ? { ...q, status: "Expirada" } : q;
}
function find(actor: RequestActor, id: string) {
  quotes = quotes.map(expire);
  const q = quotes.find((x) => x.id === id && visible(actor, x));
  if (!q) throw new Error("La cotización no está disponible.");
  return q;
}
const stamp = (actor: RequestActor, note: string) =>
  `${new Date().toLocaleDateString("es-CO")} · ${actor.name}: ${note}`;
function commit(actor: RequestActor, q: Quote, note: string): Quote {
  const updated = { ...q, advisorDecisionLog: [q.advisorDecisionLog, stamp(actor, note)].filter(Boolean).join("\n"), updatedBy: actor.name, updatedAt: new Date().toISOString() };
  quotes = quotes.map((x) => x.id === q.id ? updated : x);
  return clone(updated);
}

export const canEditQuote = (a: RequestActor, q: Quote) => a.role === "Asesor" && q.status === "Borrador";
export const canApproveDiscount = (a: RequestActor, q: Quote) =>
  a.role === "Administrador" && q.status === "Borrador" && q.requiresAdminApproval && !q.adminApprovedBy;
export const canRespondQuote = (a: RequestActor, q: Quote) => a.role === "Cliente" && q.status === "Enviada" && q.clientEmail === a.email;

export async function listQuotes(actor: RequestActor): Promise<Quote[]> {
  if (isBackendEnabled()) return apiRequest<Quote[]>("/quotes");
  await delay(); authorize(actor);
  quotes = quotes.map(expire);
  return clone(quotes.filter((q) => visible(actor, q)));
}

/** Crea un borrador con propuesta generada por IA (distribución de presupuesto, servicios y descripción). */
export async function createQuoteFromRequest(actor: RequestActor, requestId: string): Promise<Quote> {
  if (isBackendEnabled()) {
    return apiRequest<Quote>(`/quotes/from-request/${encodeURIComponent(requestId)}`, {
      method: "POST",
    });
  }
  await delay(); authorize(actor);
  if (actor.role !== "Asesor") throw new Error("Solo un Asesor puede crear cotizaciones.");
  quotes = quotes.map(expire);
  const existingForRequest = quotes.filter((q) => q.requestId === requestId);
  if (existingForRequest.some((q) => q.status === "Borrador" || q.status === "Enviada" || q.status === "Aprobada")) {
    throw new Error("Esta solicitud ya tiene una cotización activa.");
  }
  const r = await getRequest(actor, requestId);
  if (r.status === "Cerrada") throw new Error("La solicitud está cerrada.");
  const nights = Math.max(1, Math.round((Date.parse(r.endDate) - Date.parse(r.startDate)) / 86400000));
  const n = nextQuote++;
  const version = existingForRequest.length + 1;
  const valid = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const q = build({ id: `q${n}`, code: `COT-${new Date().getUTCFullYear()}-${String(n).padStart(3, "0")}`, requestId, requestBudgetCOP: r.budgetCOP, version,
    clientName: r.clientName, clientEmail: r.clientEmail, destination: r.destination,
    commercialDescription: aiDescription(r.destination, r.travelersCount, nights, r.notes),
    isDescriptionAiGenerated: true, items: aiItems(r.destination, r.travelersCount, nights, r.budgetCOP, r.notes),
    seasonSurchargePercent: 0, discountPercent: 0,
    validUntil: valid, status: "Borrador", advisorDecisionLog: "", updatedBy: actor.name, updatedAt: new Date().toISOString() });
  quotes = [q, ...quotes];
  syncRequestLifecycle(requestId, "En cotización", actor.name, `En cotización (${q.code})`);
  return commit(actor, q, version > 1 ? `Nueva versión v${version} generada con distribución de presupuesto IA.` : "Borrador creado con distribución de presupuesto IA.");
}

export async function saveQuoteDraft(actor: RequestActor, id: string, input: QuoteDraftInput): Promise<Quote> {
  if (isBackendEnabled()) {
    return apiRequest<Quote>(`/quotes/${encodeURIComponent(id)}/draft`, {
      method: "PUT",
      body: input,
    });
  }
  await delay(); authorize(actor);
  const q = find(actor, id);
  if (!canEditQuote(actor, q)) throw new Error("Solo el Asesor puede editar cotizaciones en borrador.");
  if (!input.commercialDescription.trim()) throw new Error("Ingresa la descripción comercial.");
  if (input.items.length === 0) throw new Error("Agrega al menos un servicio.");
  for (const i of input.items) {
    if (!i.description.trim()) throw new Error("Cada servicio necesita una descripción.");
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new Error("La cantidad debe ser al menos 1.");
    if (!Number.isFinite(i.unitPriceCOP) || i.unitPriceCOP <= 0) throw new Error("El precio unitario debe ser mayor a cero.");
  }
  if (input.seasonSurchargePercent < 0 || input.seasonSurchargePercent > 100) throw new Error("El recargo debe estar entre 0 % y 100 %.");
  if (input.discountPercent < 0 || input.discountPercent > 100) throw new Error("El descuento debe estar entre 0 % y 100 %.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil) || input.validUntil < today()) throw new Error("La vigencia debe ser una fecha futura.");
  const totals = computeTotals(input.items, input.seasonSurchargePercent, input.discountPercent);
  const discountChanged = input.discountPercent !== q.discountPercent;
  const next: Quote = { ...q, commercialDescription: input.commercialDescription.trim(), isDescriptionAiGenerated: input.isDescriptionAiGenerated,
    items: input.items, seasonSurchargePercent: input.seasonSurchargePercent, discountPercent: input.discountPercent, validUntil: input.validUntil, ...totals };
  if (discountChanged || !totals.requiresAdminApproval) delete next.adminApprovedBy;
  return commit(actor, next, input.decisionNote.trim() || "Borrador actualizado.");
}

export async function approveDiscount(actor: RequestActor, id: string): Promise<Quote> {
  if (isBackendEnabled()) {
    return apiRequest<Quote>(`/quotes/${encodeURIComponent(id)}/approve-discount`, {
      method: "POST",
    });
  }
  await delay(); authorize(actor);
  const q = find(actor, id);
  if (!canApproveDiscount(actor, q)) throw new Error("Solo el Administrador puede aprobar este descuento.");
  return commit(actor, { ...q, adminApprovedBy: actor.name }, `Descuento del ${q.discountPercent} % aprobado.`);
}

export async function sendQuote(actor: RequestActor, id: string): Promise<Quote> {
  if (isBackendEnabled()) {
    return apiRequest<Quote>(`/quotes/${encodeURIComponent(id)}/send`, { method: "POST" });
  }
  await delay(); authorize(actor);
  const q = find(actor, id);
  if (!canEditQuote(actor, q)) throw new Error("Solo el Asesor puede enviar cotizaciones en borrador.");
  if (q.requiresAdminApproval && !q.adminApprovedBy) throw new Error(`Descuentos mayores al ${MAX_DISCOUNT_WITHOUT_APPROVAL} % requieren aprobación del Administrador.`);
  if (q.validUntil < today()) throw new Error("La vigencia ya venció. Actualízala antes de enviar.");
  return commit(actor, { ...q, status: "Enviada" }, "Cotización enviada al cliente.");
}

export async function respondQuote(actor: RequestActor, id: string, decision: "Aprobada" | "Rechazada"): Promise<Quote> {
  if (isBackendEnabled()) {
    return apiRequest<Quote>(`/quotes/${encodeURIComponent(id)}/respond`, {
      method: "POST",
      body: { decision },
    });
  }
  await delay(); authorize(actor);
  const q = find(actor, id);
  if (!canRespondQuote(actor, q)) throw new Error("Esta cotización ya no admite respuesta.");
  return commit(actor, { ...q, status: decision }, decision === "Aprobada" ? "Cliente aprobó la cotización." : "Cliente rechazó la cotización.");
}
