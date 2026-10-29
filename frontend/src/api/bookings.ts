import { canAccess } from "./auth";
import { apiRequest, isBackendEnabled } from "./client";
import { getClientDossierSnapshot, type DocType } from "./clients";
import { listQuotes, type Quote, type QuoteServiceItem } from "./quotes";
import { getRequest, syncRequestLifecycle, type RequestActor, type AuditEntry } from "./requests";
import type { BookingStatus, PaymentStatus } from "./types";
import cartagena from "@/assets/cartagena.jpg";
import sanAndres from "@/assets/san-andres.jpg";

export interface BookingTraveler {
  id: string;
  fullName: string;
  docType: DocType;
  docNumber: string;
  isMinor: boolean;
  passportExpiry?: string | undefined;
}
export interface Booking {
  id: string; code: string; quoteId: string; requestId: string; clientId: string; clientName: string;
  destination: string; thumbnailUrl: string; startDate: string; endDate: string; paymentDueDate: string;
  travelersCount: number; travelers: BookingTraveler[]; agreedItems: QuoteServiceItem[]; conditions: string;
  totalCOP: number; paidCOP: number; status: BookingStatus; notes: string; history: AuditEntry[];
}
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
  id: string; code: string; bookingId: string; bookingCode: string; clientId: string; clientName: string;
  amountCOP: number; method: "Transferencia" | "Consignación" | "Efectivo"; reference: string; date: string;
  receiptName?: string | undefined; receiptDataUrl?: string | undefined;
  status: PaymentStatus; notes: string; history: AuditEntry[];
}
export interface PaymentInput {
  bookingId: string; amountCOP: number; method: Payment["method"]; reference: string; date: string; notes: string;
  receiptName?: string | undefined; receiptDataUrl?: string | undefined;
}
export const BOOKING_STATUSES: BookingStatus[] = ["pendiente_pago", "confirmada", "en_modificacion", "cancelada"];
export const PAYMENT_STATUSES: PaymentStatus[] = ["por_conciliar", "validado", "rechazado", "devuelto"];
export const DEFAULT_BOOKING_CONDITIONS =
  "Tarifa sujeta a condiciones del proveedor aéreo y hotelero. Cambios de fecha o pasajero hasta 7 días antes de la salida.";
const delay = () => new Promise<void>((r) => setTimeout(r, 500));
const copy = <T,>(x: T): T => structuredClone(x);
const initialHistory = (action: string): AuditEntry[] => [{ id: "seed", action, user: "Andrés Ruiz", timestamp: "2026-10-27T15:00:00Z" }];

function buildCandidateTravelers(clientId: string): BookingTraveler[] {
  const dossier = getClientDossierSnapshot(clientId);
  if (!dossier) return [];
  const holder: BookingTraveler = {
    id: dossier.id,
    fullName: dossier.name,
    docType: dossier.docType,
    docNumber: dossier.docNumber,
    isMinor: false,
    ...(dossier.passportExpiry ? { passportExpiry: dossier.passportExpiry } : {}),
  };
  const companions: BookingTraveler[] = dossier.companions.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    docType: c.docType,
    docNumber: c.docNumber,
    isMinor: c.isMinor,
    ...(c.passportExpiry ? { passportExpiry: c.passportExpiry } : {}),
  }));
  return [holder, ...companions];
}

function computeDefaultDueDate(startDate: string): string {
  const todayMs = Date.now();
  const startMs = Date.parse(`${startDate}T12:00:00Z`);
  const sevenDaysBefore = startMs - 7 * 86400000;
  const fallback = todayMs + 5 * 86400000;
  const target = sevenDaysBefore > todayMs ? sevenDaysBefore : fallback;
  return new Date(target).toISOString().slice(0, 10);
}

let bookings: Booking[] = [
  {
    id: "b1", code: "RES-2026-001", quoteId: "demo-q1", requestId: "r1", clientId: "u4", clientName: "Carlos Pérez",
    destination: "Cartagena", thumbnailUrl: cartagena, startDate: "2026-11-12", endDate: "2026-11-17", paymentDueDate: "2026-11-05",
    travelersCount: 2,
    travelers: [
      { id: "u4", fullName: "Carlos Pérez", docType: "CC", docNumber: "1030000001", isMinor: false },
      { id: "v1", fullName: "Ana Pérez", docType: "CC", docNumber: "1030000004", isMinor: false },
    ],
    agreedItems: [
      { id: "bi1", category: "Vuelos", description: "Tiquete ida y regreso Bogotá – Cartagena con equipaje", quantity: 2, unitPriceCOP: 855000, isAiGenerated: true, editedByAdvisor: false },
      { id: "bi2", category: "Alojamiento", description: "Hotel centro histórico con desayuno (5 noches)", quantity: 5, unitPriceCOP: 460000, isAiGenerated: true, editedByAdvisor: false },
      { id: "bi3", category: "Traslados", description: "Traslado privado aeropuerto – hotel – aeropuerto", quantity: 1, unitPriceCOP: 490000, isAiGenerated: true, editedByAdvisor: false },
    ],
    conditions: DEFAULT_BOOKING_CONDITIONS,
    totalCOP: 4500000, paidCOP: 1500000, status: "pendiente_pago", notes: "Habitación doble con desayuno. Traslados incluidos.", history: initialHistory("Reserva creada"),
  },
  {
    id: "b2", code: "RES-2026-002", quoteId: "demo-q2", requestId: "r2", clientId: "c2", clientName: "Valentina Torres",
    destination: "San Andrés", thumbnailUrl: sanAndres, startDate: "2026-12-05", endDate: "2026-12-10", paymentDueDate: "2026-11-28",
    travelersCount: 4,
    travelers: [
      { id: "c2", fullName: "Valentina Torres", docType: "CC", docNumber: "1030000002", isMinor: false },
      { id: "v2", fullName: "Sofía Torres", docType: "Pasaporte", docNumber: "DEMO0002", isMinor: true, passportExpiry: "2028-02-12" },
    ],
    agreedItems: [
      { id: "bi4", category: "Vuelos", description: "Tiquete ida y regreso Bogotá – San Andrés (4 viajeros)", quantity: 4, unitPriceCOP: 850000, isAiGenerated: true, editedByAdvisor: false },
      { id: "bi5", category: "Alojamiento", description: "Hotel con habitaciones comunicadas y desayuno (5 noches)", quantity: 5, unitPriceCOP: 640000, isAiGenerated: true, editedByAdvisor: true },
      { id: "bi6", category: "Traslados", description: "Traslado aeropuerto – hotel – aeropuerto y asistencia", quantity: 1, unitPriceCOP: 600000, isAiGenerated: true, editedByAdvisor: false },
    ],
    conditions: DEFAULT_BOOKING_CONDITIONS,
    totalCOP: 7200000, paidCOP: 7200000, status: "confirmada", notes: "Habitaciones comunicadas para viaje familiar.", history: initialHistory("Reserva confirmada"),
  },
];
let payments: Payment[] = [
  { id: "p1", code: "PAG-2026-001", bookingId: "b1", bookingCode: "RES-2026-001", clientId: "u4", clientName: "Carlos Pérez", amountCOP: 1500000, method: "Transferencia", reference: "DEMO-TR-001", date: "2026-10-27", receiptName: "comprobante-bancolombia-001.pdf", status: "validado", notes: "Abono inicial.", history: initialHistory("Pago validado") },
  { id: "p2", code: "PAG-2026-002", bookingId: "b1", bookingCode: "RES-2026-001", clientId: "u4", clientName: "Carlos Pérez", amountCOP: 3000000, method: "Transferencia", reference: "DEMO-TR-002", date: "2026-10-28", receiptName: "soporte-pse-002.pdf", status: "por_conciliar", notes: "Saldo pendiente de verificación.", history: initialHistory("Pago registrado") },
  { id: "p3", code: "PAG-2026-003", bookingId: "b2", bookingCode: "RES-2026-002", clientId: "c2", clientName: "Valentina Torres", amountCOP: 7200000, method: "Consignación", reference: "DEMO-CONS-003", date: "2026-10-26", receiptName: "consignacion-davivienda-003.pdf", status: "validado", notes: "Pago completo.", history: initialHistory("Pago validado") },
];
function authorize(a: RequestActor, path: string) { if (!a.active || !canAccess(a.role, path)) throw new Error("No tienes permiso para este módulo."); }
const visible = (a: RequestActor, x: { clientId: string }) => a.role !== "Cliente" || a.id === x.clientId;
export const canManageBooking = (a: RequestActor) => a.active && (a.role === "Administrador" || a.role === "Asesor");
export const canReconcile = (a: RequestActor) => a.active && (a.role === "Administrador" || a.role === "Contabilidad");
function audit(a: RequestActor, history: AuditEntry[], action: string) { return [...history, { id: crypto.randomUUID(), action, user: a.name, timestamp: new Date().toISOString() }]; }
export async function listBookings(a: RequestActor): Promise<Booking[]> {
  if (isBackendEnabled()) return apiRequest<Booking[]>("/bookings");
  await delay(); authorize(a, "/reservas"); return copy(bookings.filter((b) => visible(a, b)));
}
export async function listBookingOptions(a: RequestActor): Promise<Booking[]> {
  if (isBackendEnabled()) return apiRequest<Booking[]>("/bookings/options");
  await delay(); authorize(a, "/pagos"); return copy(bookings.filter((b) => visible(a, b) && b.status !== "cancelada"));
}
export async function bookingSources(a: RequestActor): Promise<BookingSource[]> {
  if (isBackendEnabled()) return apiRequest<BookingSource[]>("/bookings/sources");
  authorize(a, "/reservas"); if (!canManageBooking(a)) return [];
  const approved = (await listQuotes(a)).filter((q) => q.status === "Aprobada" && !bookings.some((b) => b.quoteId === q.id));
  const sources: BookingSource[] = [];
  for (const q of approved) {
    const r = await getRequest(a, q.requestId);
    sources.push({
      ...q,
      clientId: r.clientId,
      startDate: r.startDate,
      endDate: r.endDate,
      travelersCount: r.travelersCount,
      defaultPaymentDueDate: computeDefaultDueDate(r.startDate),
      candidateTravelers: buildCandidateTravelers(r.clientId),
    });
  }
  return sources;
}
export async function createBooking(a: RequestActor, quoteId: string, options?: CreateBookingOptions): Promise<Booking> {
  if (isBackendEnabled()) {
    return apiRequest<Booking>("/bookings", {
      method: "POST",
      body: { quoteId, options },
    });
  }
  await delay(); authorize(a, "/reservas"); if (!canManageBooking(a)) throw new Error("Solo el equipo puede crear reservas.");
  const q = (await listQuotes(a)).find((q) => q.id === quoteId && q.status === "Aprobada");
  if (!q) throw new Error("Selecciona una cotización aprobada.");
  const r = await getRequest(a, q.requestId);
  if (bookings.some((b) => b.quoteId === quoteId)) throw new Error("Esta cotización ya tiene reserva.");
  const fallbackTravelers = buildCandidateTravelers(r.clientId).slice(0, r.travelersCount);
  const travelers = options?.travelers && options.travelers.length > 0 ? copy(options.travelers) : fallbackTravelers;
  const paymentDueDate =
    options?.paymentDueDate && /^\d{4}-\d{2}-\d{2}$/.test(options.paymentDueDate)
      ? options.paymentDueDate
      : computeDefaultDueDate(r.startDate);
  if (paymentDueDate > r.startDate) throw new Error("La fecha límite de pago no puede ser posterior a la salida.");
  const conditions = options?.conditions?.trim() || DEFAULT_BOOKING_CONDITIONS;
  const b: Booking = {
    id: crypto.randomUUID(), code: `RES-2026-${String(bookings.length + 1).padStart(3, "0")}`, quoteId, requestId: r.id,
    clientId: r.clientId, clientName: r.clientName, destination: r.destination, thumbnailUrl: r.thumbnailUrl,
    startDate: r.startDate, endDate: r.endDate, paymentDueDate, travelersCount: r.travelersCount,
    travelers, agreedItems: copy(q.items), conditions,
    totalCOP: q.totalCOP, paidCOP: 0, status: "pendiente_pago", notes: q.commercialDescription,
    history: audit(a, [], `Reserva creada desde ${q.code} (${travelers.length} viajero(s) asociado(s))`),
  };
  bookings = [b, ...bookings]; return copy(b);
}
export async function changeBooking(a: RequestActor, id: string, status: BookingStatus, notes: string): Promise<Booking> {
  if (isBackendEnabled()) {
    return apiRequest<Booking>(`/bookings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { status, notes },
    });
  }
  await delay(); authorize(a, "/reservas"); if (!canManageBooking(a)) throw new Error("Solo el equipo puede modificar reservas.");
  const b = bookings.find((b) => b.id === id); if (!b || b.status === "cancelada") throw new Error("Esta reserva no admite cambios.");
  const allowed: Record<BookingStatus, BookingStatus[]> = { pendiente_pago: ["cancelada"], confirmada: ["en_modificacion", "cancelada"], en_modificacion: ["confirmada", "cancelada"], cancelada: [] };
  if (!allowed[b.status].includes(status)) throw new Error("Cambio de estado no permitido.");
  if (status === "confirmada" && b.paidCOP < b.totalCOP) throw new Error("La reserva tiene saldo pendiente.");
  if (!notes.trim()) throw new Error("Indica el motivo del cambio.");
  const updated = { ...b, status, notes: notes.trim(), history: audit(a, b.history, `Reserva: ${status}. ${notes.trim()}`) };
  bookings = bookings.map((b) => b.id === id ? updated : b);
  if (status === "cancelada" || status === "confirmada") {
    syncRequestLifecycle(updated.requestId, "Cerrada", a.name, `Solicitud cerrada (${updated.code}: ${status})`);
  }
  return copy(updated);
}
export async function listPayments(a: RequestActor): Promise<Payment[]> {
  if (isBackendEnabled()) return apiRequest<Payment[]>("/payments");
  await delay(); authorize(a, "/pagos"); return copy(payments.filter((p) => visible(a, p)));
}
export async function registerPayment(a: RequestActor, input: PaymentInput): Promise<Payment> {
  if (isBackendEnabled()) {
    return apiRequest<Payment>("/payments", { method: "POST", body: input });
  }
  await delay(); authorize(a, "/pagos"); const b = bookings.find((b) => b.id === input.bookingId && visible(a, b) && b.status !== "cancelada");
  if (!b) throw new Error("Selecciona una reserva disponible.");
  const committed = payments.filter((p) => p.bookingId === b.id && (p.status === "validado" || p.status === "por_conciliar")).reduce((s, p) => s + p.amountCOP, 0);
  if (!Number.isFinite(input.amountCOP) || input.amountCOP <= 0 || input.amountCOP > b.totalCOP - committed) throw new Error("El importe debe ser positivo y no superar el saldo sin registrar.");
  if (!["Transferencia", "Consignación", "Efectivo"].includes(input.method) || !input.reference.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || input.date > new Date().toISOString().slice(0, 10)) throw new Error("Revisa medio, referencia y fecha del pago.");
  const receiptNote = input.receiptName?.trim() ? ` · Comprobante: ${input.receiptName.trim()}` : "";
  const p: Payment = {
    ...input,
    ...(input.receiptName?.trim() ? { receiptName: input.receiptName.trim() } : {}),
    ...(input.receiptDataUrl ? { receiptDataUrl: input.receiptDataUrl } : {}),
    id: crypto.randomUUID(), code: `PAG-2026-${String(payments.length + 1).padStart(3, "0")}`,
    bookingCode: b.code, clientId: b.clientId, clientName: b.clientName, status: "por_conciliar",
    history: audit(a, [], `Pago registrado${receiptNote}`),
  };
  payments = [p, ...payments]; return copy(p);
}
export async function reconcilePayment(a: RequestActor, id: string, status: PaymentStatus, reason: string): Promise<Payment> {
  if (isBackendEnabled()) {
    return apiRequest<Payment>(`/payments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { status, reason },
    });
  }
  await delay(); authorize(a, "/pagos"); if (!canReconcile(a)) throw new Error("Solo Administrador y Contabilidad concilian pagos.");
  const p = payments.find((p) => p.id === id); if (!p) throw new Error("El pago no está disponible.");
  if (!(p.status === "por_conciliar" && (status === "validado" || status === "rechazado") || p.status === "validado" && status === "devuelto")) throw new Error("Cambio de estado no permitido.");
  if (!reason.trim()) throw new Error("Indica el motivo de la decisión.");
  const b = bookings.find((b) => b.id === p.bookingId); if (!b) throw new Error("Reserva no disponible.");
  if (status === "validado" && b.status === "cancelada") throw new Error("No puedes validar un pago de una reserva cancelada.");
  const updated = { ...p, status, notes: reason.trim(), history: audit(a, p.history, `Pago ${status}: ${reason.trim()}`) };
  payments = payments.map((p) => p.id === id ? updated : p);
  const paidCOP = payments.filter((p) => p.bookingId === b.id && p.status === "validado").reduce((s, p) => s + p.amountCOP, 0);
  const nextBookingStatus: BookingStatus =
    b.status === "cancelada" || b.status === "en_modificacion"
      ? b.status
      : paidCOP >= b.totalCOP
        ? "confirmada"
        : "pendiente_pago";
  bookings = bookings.map((x) => x.id === b.id ? { ...x, paidCOP, status: nextBookingStatus, history: audit(a, x.history, `Saldo actualizado por ${updated.code}`) } : x);
  if (nextBookingStatus === "confirmada") {
    syncRequestLifecycle(b.requestId, "Cerrada", a.name, `Solicitud cerrada por confirmación de ${b.code}`);
  }
  return copy(updated);
}