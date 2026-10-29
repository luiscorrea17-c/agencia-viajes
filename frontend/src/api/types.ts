// Contratos tipados. El backend (FastAPI + Pydantic) debe exponer modelos equivalentes.

export type { RequestStatus, Client, AuditEntry, TravelRequest } from "./requests";
export type { QuoteStatus, ServiceCategory, QuoteServiceItem, BudgetAllocation, Quote } from "./quotes";
export type { BookingTraveler, Booking, BookingSource, CreateBookingOptions, Payment, PaymentInput } from "./bookings";
export type BookingStatus = "pendiente_pago" | "confirmada" | "en_modificacion" | "cancelada";
export type PaymentStatus = "por_conciliar" | "validado" | "rechazado" | "devuelto";
