import { describe, expect, it, vi } from "vitest";
import { canAccess, listUsers, NAV_ITEMS, ROLES, saveUser, type PublicUser } from "@/api/auth";
import {
  BOOKING_STATUSES,
  canManageBooking,
  canReconcile,
  createBooking,
  getPaymentReceipt,
  PAYMENT_STATUSES,
  registerPayment,
} from "@/api/bookings";
import { mockJsonResponse, sessionToken } from "./api-helpers";

const actor = (role: PublicUser["role"]): PublicUser => ({
  id: "user-1",
  name: "Prueba",
  email: "test@example.com",
  role,
  avatarUrl: "",
  branch: "Bogotá",
  active: true,
});

describe("Reservas, pagos y usuarios: contratos HTTP", () => {
  it("mantiene los roles y estados definidos", () => {
    expect(ROLES).toEqual(["Administrador", "Asesor", "Contabilidad", "Cliente"]);
    expect(BOOKING_STATUSES).toEqual([
      "pendiente_pago",
      "confirmada",
      "en_modificacion",
      "cancelada",
    ]);
    expect(PAYMENT_STATUSES).toEqual(["por_conciliar", "validado", "rechazado", "devuelto"]);
  });

  it("limita cada módulo a los roles aprobados", () => {
    expect(NAV_ITEMS.find((item) => item.path === "/expedientes")?.allowedRoles).toEqual([
      "Administrador",
      "Asesor",
      "Cliente",
    ]);
    expect(NAV_ITEMS.find((item) => item.path === "/cotizador-ia")?.allowedRoles).toEqual([
      "Administrador",
      "Asesor",
    ]);
    expect(canAccess("Contabilidad", "/expedientes")).toBe(false);
    expect(canAccess("Contabilidad", "/cotizador-ia")).toBe(false);
    expect(canAccess("Asesor", "/pagos")).toBe(false);
    expect(canAccess("Cliente", "/mis-cotizaciones")).toBe(true);
  });

  it("conserva las reglas de acceso de reservas y conciliación", () => {
    expect(canManageBooking(actor("Administrador"))).toBe(false);
    expect(canManageBooking(actor("Asesor"))).toBe(true);
    expect(canManageBooking(actor("Cliente"))).toBe(false);
    expect(canReconcile(actor("Contabilidad"))).toBe(true);
    expect(canReconcile(actor("Administrador"))).toBe(false);
    expect(canReconcile(actor("Cliente"))).toBe(false);
  });

  it("solicita solo el listado de usuarios por HTTP autenticado", async () => {
    sessionToken();
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listUsers(actor("Administrador"))).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.any(Object));
  });

  it("crea una cuenta de cliente con los datos para su expediente vinculado", async () => {
    sessionToken();
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "client-user-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      name: "Cliente",
      email: "cliente@example.com",
      role: "Cliente" as const,
      branch: "",
      password: "password-seguro",
      clientPhone: "3001234567",
      clientDocType: "CC" as const,
      clientDocNumber: "123456789",
      clientType: "Persona" as const,
    };

    await saveUser(actor("Administrador"), null, input);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("crea reservas con quoteId y opciones en el cuerpo", async () => {
    sessionToken();
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "booking-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await createBooking(actor("Asesor"), "quote-1", {
      paymentDueDate: "2026-11-06",
      conditions: "Condiciones pactadas",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bookings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          quoteId: "quote-1",
          paymentDueDate: "2026-11-06",
          conditions: "Condiciones pactadas",
        }),
      }),
    );
  });

  it("registra pagos y comprobantes con el contrato frontend", async () => {
    sessionToken();
    const paymentInput = {
      bookingId: "booking-1",
      amountCOP: 1500000,
      method: "Transferencia" as const,
      reference: "TRX-001",
      date: "2026-10-29",
      notes: "",
      receiptName: "recibo.png",
      receiptDataUrl: "data:image/png;base64,aGVsbG8=",
    };
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "payment-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await registerPayment(actor("Cliente"), paymentInput);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/payments",
      expect.objectContaining({ method: "POST", body: JSON.stringify(paymentInput) }),
    );
  });

  it("descarga el comprobante en un blob sin JSON", async () => {
    sessionToken();
    const receipt = new Blob(["receipt"]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(receipt));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPaymentReceipt("payment-1")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledWith("/api/payments/payment-1/receipt", expect.any(Object));
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test.jwt.token");
  });
});
