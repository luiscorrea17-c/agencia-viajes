import { queryOptions } from "@tanstack/react-query";
import { listUsers, type PublicUser } from "@/api/auth";
import { listBookings, listPayments, listBookingOptions, bookingSources } from "@/api/bookings";
import { getDashboard } from "@/api/dashboard";
export const bookingsQuery = (a: PublicUser) => queryOptions({ queryKey: ["bookings", a.id, a.role], queryFn: async () => { const [bookings, sources] = await Promise.all([listBookings(a), bookingSources(a)]); return { bookings, sources }; }, staleTime: 0 });
export const paymentsQuery = (a: PublicUser) => queryOptions({ queryKey: ["payments", a.id, a.role], queryFn: async () => { const [payments, bookings] = await Promise.all([listPayments(a), listBookingOptions(a)]); return { payments, bookings }; }, staleTime: 0 });
export const usersQuery = (a: PublicUser) => queryOptions({ queryKey: ["users", a.id, a.role], queryFn: () => listUsers(a), staleTime: 0 });
export const dashboardQuery = (a: PublicUser) => queryOptions({ queryKey: ["dashboard", a.id, a.role], queryFn: () => getDashboard(a), staleTime: 0 });