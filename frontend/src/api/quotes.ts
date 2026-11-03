import { apiRequest, jsonBody } from "./http";
import type { RequestActor } from "./requests";

export type QuoteStatus = "Borrador" | "Enviada" | "Aprobada" | "Rechazada" | "Expirada";
export type ServiceCategory = "Vuelos" | "Alojamiento" | "Traslados" | "Actividades" | "Asistencia";

export interface QuoteServiceItem {
  id: string;
  category: ServiceCategory;
  description: string;
  quantity: number;
  unitPriceCOP: number;
  isAiGenerated: boolean;
  editedByAdvisor: boolean;
}

export interface BudgetAllocation {
  category: ServiceCategory;
  quotedCOP: number;
  quotedPercent: number;
}

export interface Quote {
  id: string;
  code: string;
  requestId: string;
  requestBudgetCOP: number;
  version: number;
  clientName: string;
  clientEmail: string;
  destination: string;
  commercialDescription: string;
  isDescriptionAiGenerated: boolean;
  items: QuoteServiceItem[];
  basePriceCOP: number;
  seasonSurchargePercent: number;
  seasonSurchargeCOP: number;
  discountPercent: number;
  discountCOP: number;
  requiresAdminApproval: boolean;
  adminApprovedBy?: string | undefined;
  totalCOP: number;
  validUntil: string;
  status: QuoteStatus;
  advisorDecisionLog: string;
  updatedBy: string;
  updatedAt: string;
}

export interface QuoteDraftInput {
  commercialDescription: string;
  isDescriptionAiGenerated: boolean;
  items: QuoteServiceItem[];
  seasonSurchargePercent: number;
  discountPercent: number;
  validUntil: string;
  decisionNote: string;
}

export const QUOTE_STATUSES: QuoteStatus[] = ["Borrador", "Enviada", "Aprobada", "Rechazada", "Expirada"];
export const SERVICE_CATEGORIES: ServiceCategory[] = ["Vuelos", "Alojamiento", "Traslados", "Actividades", "Asistencia"];
export const QUOTE_LATENCY_MS = 0;
export const MAX_DISCOUNT_WITHOUT_APPROVAL = 10;

export function computeTotals(
  items: QuoteServiceItem[],
  seasonSurchargePercent: number,
  discountPercent: number,
) {
  const basePriceCOP = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCOP, 0);
  const seasonSurchargeCOP = Math.round(basePriceCOP * seasonSurchargePercent / 100);
  const discountCOP = Math.round((basePriceCOP + seasonSurchargeCOP) * discountPercent / 100);
  return {
    basePriceCOP,
    seasonSurchargeCOP,
    discountCOP,
    totalCOP: basePriceCOP + seasonSurchargeCOP - discountCOP,
    requiresAdminApproval: discountPercent > MAX_DISCOUNT_WITHOUT_APPROVAL,
  };
}

export function computeBudgetDistribution(items: QuoteServiceItem[]): BudgetAllocation[] {
  const baseTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCOP, 0);
  return SERVICE_CATEGORIES.map((category) => {
    const quotedCOP = items
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + item.quantity * item.unitPriceCOP, 0);
    return {
      category,
      quotedCOP,
      quotedPercent: baseTotal > 0 ? Math.round((quotedCOP / baseTotal) * 100) : 0,
    };
  });
}

export const canEditQuote = (actor: RequestActor, quote: Quote) =>
  actor.role === "Asesor" && quote.status === "Borrador";

export const canApproveDiscount = (actor: RequestActor, quote: Quote) =>
  actor.role === "Administrador" && quote.status === "Borrador" &&
  quote.requiresAdminApproval && !quote.adminApprovedBy;

export const canRespondQuote = (actor: RequestActor, quote: Quote) =>
  actor.role === "Cliente" && quote.status === "Enviada" && quote.clientEmail === actor.email;

export async function listQuotes(_actor: RequestActor): Promise<Quote[]> {
  return apiRequest<Quote[]>("/api/quotes");
}

export async function createQuoteFromRequest(
  _actor: RequestActor,
  requestId: string,
): Promise<Quote> {
  return apiRequest<Quote>(`/api/quotes/from-request/${encodeURIComponent(requestId)}`, {
    method: "POST",
  });
}

export async function saveQuoteDraft(
  _actor: RequestActor,
  id: string,
  input: QuoteDraftInput,
): Promise<Quote> {
  return apiRequest<Quote>(`/api/quotes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: jsonBody(input),
  });
}

export async function approveDiscount(_actor: RequestActor, id: string): Promise<Quote> {
  return apiRequest<Quote>(`/api/quotes/${encodeURIComponent(id)}/approve-discount`, {
    method: "POST",
  });
}

export async function sendQuote(_actor: RequestActor, id: string): Promise<Quote> {
  return apiRequest<Quote>(`/api/quotes/${encodeURIComponent(id)}/send`, {
    method: "POST",
  });
}

export async function respondQuote(
  _actor: RequestActor,
  id: string,
  decision: "Aprobada" | "Rechazada",
): Promise<Quote> {
  return apiRequest<Quote>(`/api/quotes/${encodeURIComponent(id)}/respond`, {
    method: "POST",
    body: jsonBody({ decision }),
  });
}
