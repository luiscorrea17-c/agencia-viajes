import { apiBlob, apiRequest, jsonBody } from "./http";
import type { RequestActor, AuditEntry } from "./requests";
import type { Quote, QuoteServiceItem } from "./quotes";
import type { BookingStatus, PaymentStatus } from "./types";
import type { DocType } from "./clients";

export interface BookingTraveler {
  id: string;
  fullName: string;
  docType: DocType;
  docNumber: string;
  isMinor: boolean;
  passportExpiry?: string | undefined;
}

export interface Booking {
  id: string;
  code: string;
  quoteId: string;
  requestId: string;
  clientId: string;
  clientName: string;
  destination: string;
  thumbnailUrl: string;
  startDate: string;
  endDate: string;
  paymentDueDate: string;
  travelersCount: number;
  travelers: BookingTraveler[];
  agreedItems: QuoteServiceItem[];
  conditions: string;
  totalCOP: number;
  paidCOP: number;
  status: BookingStatus;
  notes: string;
  history: AuditEntry[];
}

export type BookingPaymentOption = Pick<
  Booking,
  "id" | "code" | "clientId" | "clientName" | "destination" | "paymentDueDate" | "totalCOP" | "paidCOP" | "status"
>;

export interface BookingSource extends Quote {
  clientId: string;
  startDate: string;
  endDate: string;
  travelersCount: number;
  defaultPaymentDueDate: string;
  candidateTravelers: BookingTraveler[];
}

export interface CreateBookingOptions {
  travelers?: BookingTraveler[] | undefined;
  conditions?: string | undefined;
  paymentDueDate?: string | undefined;
}

export interface Payment {
  id: string;
  code: string;
  bookingId: string;
  bookingCode: string;
  clientId: string;
  clientName: string;
  amountCOP: number;
  method: "Transferencia" | "Consignación" | "Efectivo";
  reference: string;
  date: string;
  receiptName?: string | undefined;
  receiptDataUrl?: string | undefined;
  receiptUrl?: string | undefined;
  status: PaymentStatus;
  notes: string;
  history: AuditEntry[];
}

export interface PaymentInput {
  bookingId: string;
  amountCOP: number;
  method: Payment["method"];
  reference: string;
  date: string;
  notes: string;
  receiptName?: string | undefined;
  receiptDataUrl?: string | undefined;
}

export const BOOKING_STATUSES: BookingStatus[] = ["pendiente_pago", "confirmada", "en_modificacion", "cancelada"];
export const PAYMENT_STATUSES: PaymentStatus[] = ["por_conciliar", "validado", "rechazado", "devuelto"];
export const DEFAULT_BOOKING_CONDITIONS =
  "Tarifa sujeta a condiciones del proveedor aéreo y hotelero. Cambios de fecha o pasajero hasta 7 días antes de la salida.";

export const canManageBooking = (actor: RequestActor) =>
  actor.active && actor.role === "Asesor";

export const canReconcile = (actor: RequestActor) =>
  actor.active && actor.role === "Contabilidad";

export async function listBookings(_actor: RequestActor): Promise<Booking[]> {
  return apiRequest<Booking[]>("/api/bookings");
}

export async function listBookingOptions(_actor: RequestActor): Promise<BookingPaymentOption[]> {
  return apiRequest<BookingPaymentOption[]>("/api/bookings/options");
}

export async function bookingSources(_actor: RequestActor): Promise<BookingSource[]> {
  return apiRequest<BookingSource[]>("/api/bookings/sources");
}

export async function createBooking(
  _actor: RequestActor,
  quoteId: string,
  options?: CreateBookingOptions,
): Promise<Booking> {
  return apiRequest<Booking>("/api/bookings", {
    method: "POST",
    body: jsonBody({ quoteId, ...options }),
  });
}

export async function changeBooking(
  _actor: RequestActor,
  id: string,
  nextStatus: BookingStatus,
  notes: string,
): Promise<Booking> {
  return apiRequest<Booking>(`/api/bookings/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: jsonBody({ status: nextStatus, notes }),
  });
}

export async function listPayments(_actor: RequestActor): Promise<Payment[]> {
  return apiRequest<Payment[]>("/api/payments");
}

export async function registerPayment(
  _actor: RequestActor,
  input: PaymentInput,
): Promise<Payment> {
  return apiRequest<Payment>("/api/payments", {
    method: "POST",
    body: jsonBody(input),
  });
}

export async function reconcilePayment(
  _actor: RequestActor,
  id: string,
  nextStatus: PaymentStatus,
  reason: string,
): Promise<Payment> {
  return apiRequest<Payment>(`/api/payments/${encodeURIComponent(id)}/reconcile`, {
    method: "PATCH",
    body: jsonBody({ status: nextStatus, reason }),
  });
}

export async function getPaymentReceipt(id: string): Promise<Blob> {
  return apiBlob(`/api/payments/${encodeURIComponent(id)}/receipt`);
}
