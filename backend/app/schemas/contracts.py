from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Role = Literal["Administrador", "Asesor", "Contabilidad", "Cliente"]
RequestStatus = Literal["Abierta", "En cotización", "Cerrada"]
ClientType = Literal["Persona", "Empresa"]
ClientSegment = Literal["Estándar", "Corporativo", "VIP"]
DocType = Literal["CC", "NIT", "CE", "Pasaporte"]
ServiceCategory = Literal["Vuelos", "Alojamiento", "Traslados", "Actividades", "Asistencia"]
QuoteStatus = Literal["Borrador", "Enviada", "Aprobada", "Rechazada", "Expirada"]
BookingStatus = Literal["pendiente_pago", "confirmada", "en_modificacion", "cancelada"]
PaymentStatus = Literal["por_conciliar", "validado", "rechazado", "devuelto"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginInput(Contract):
    email: str
    password: str


class UserInput(Contract):
    name: str
    email: str
    role: Role
    branch: str
    password: str | None = None


class Companion(Contract):
    id: str
    fullName: str
    birthDate: str
    isMinor: bool
    docType: DocType
    docNumber: str
    passportExpiry: str | None = None


class ClientInput(Contract):
    name: str
    email: str
    phone: str
    type: ClientType
    segment: ClientSegment
    docType: DocType
    docNumber: str
    passportNumber: str | None = None
    passportExpiry: str | None = None
    billingAddress: str
    taxRegime: str
    companions: list[Companion] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class RequestInput(Contract):
    clientId: str
    destination: str
    startDate: str
    endDate: str
    budgetCOP: float
    travelersCount: int
    notes: str
    status: RequestStatus


class QuoteItem(Contract):
    id: str
    category: ServiceCategory
    description: str
    quantity: int
    unitPriceCOP: float
    isAiGenerated: bool
    editedByAdvisor: bool


class QuoteDraftInput(Contract):
    commercialDescription: str
    isDescriptionAiGenerated: bool
    items: list[QuoteItem]
    seasonSurchargePercent: float
    discountPercent: float
    validUntil: str
    decisionNote: str


class BookingOptions(Contract):
    travelers: list[dict] | None = None
    conditions: str | None = None
    paymentDueDate: str | None = None


class BookingChange(Contract):
    status: BookingStatus
    notes: str


class PaymentInput(Contract):
    bookingId: str
    amountCOP: float
    method: Literal["Transferencia", "Consignación", "Efectivo"]
    reference: str
    date: str
    notes: str
    receiptName: str | None = None
    receiptDataUrl: str | None = None


class PaymentReconciliation(Contract):
    status: PaymentStatus
    reason: str
