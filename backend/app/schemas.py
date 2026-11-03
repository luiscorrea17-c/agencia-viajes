from datetime import date
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class APIModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


Role = Literal["Administrador", "Asesor", "Contabilidad", "Cliente"]
DocType = Literal["CC", "NIT", "CE", "Pasaporte"]
ClientType = Literal["Persona", "Empresa"]
ClientSegment = Literal["Estándar", "Corporativo", "VIP"]
RequestStatus = Literal["Abierta", "En cotización", "Cerrada"]
ServiceCategory = Literal["Vuelos", "Alojamiento", "Traslados", "Actividades", "Asistencia"]
BookingStatus = Literal["pendiente_pago", "confirmada", "en_modificacion", "cancelada"]
PaymentStatus = Literal["por_conciliar", "validado", "rechazado", "devuelto"]
PaymentMethod = Literal["Transferencia", "Consignación", "Efectivo"]


class LoginInput(APIModel):
    email: str
    password: str


class UserInput(APIModel):
    name: str
    email: str
    role: Role
    branch: str
    password: str | None = None
    client_phone: str | None = None
    client_doc_type: DocType | None = None
    client_doc_number: str | None = None
    client_type: ClientType = "Persona"
    client_segment: ClientSegment = "Estándar"


class ActiveInput(APIModel):
    active: bool


class CompanionInput(APIModel):
    id: str | None = None
    full_name: str
    birth_date: date
    is_minor: bool = False
    doc_type: DocType
    doc_number: str
    passport_expiry: date | None = None


class ClientInput(APIModel):
    name: str
    email: str
    phone: str
    type: ClientType
    segment: ClientSegment
    doc_type: DocType
    doc_number: str
    passport_number: str | None = None
    passport_expiry: date | None = None
    billing_address: str = ""
    tax_regime: str = ""
    companions: list[CompanionInput] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class RequestInput(APIModel):
    client_id: str
    destination: str
    start_date: date
    end_date: date
    budget_cop: int = Field(
        validation_alias=AliasChoices("budgetCOP", "budgetCop", "budget_cop")
    )
    travelers_count: int
    notes: str = ""
    status: RequestStatus = "Abierta"


class QuoteItemInput(APIModel):
    id: str | None = None
    category: ServiceCategory
    description: str
    quantity: int = Field(gt=0)
    unit_price_cop: int = Field(
        gt=0,
        validation_alias=AliasChoices("unitPriceCOP", "unitPriceCop", "unit_price_cop")
    )
    is_ai_generated: bool = False
    edited_by_advisor: bool = False


class QuoteDraftInput(APIModel):
    commercial_description: str
    is_description_ai_generated: bool = False
    items: list[QuoteItemInput] = Field(min_length=1)
    season_surcharge_percent: float
    discount_percent: float
    valid_until: date
    decision_note: str = ""


class QuoteResponseInput(APIModel):
    decision: Literal["Aprobada", "Rechazada"]


class BookingTravelerInput(APIModel):
    id: str | None = None
    full_name: str
    doc_type: DocType
    doc_number: str
    is_minor: bool = False
    passport_expiry: date | None = None


class BookingInput(APIModel):
    quote_id: str
    travelers: list[BookingTravelerInput] = Field(default_factory=list)
    conditions: str = ""
    payment_due_date: date | None = None


class BookingStatusInput(APIModel):
    status: BookingStatus
    notes: str


class PaymentInput(APIModel):
    booking_id: str
    amount_cop: int = Field(
        validation_alias=AliasChoices("amountCOP", "amountCop", "amount_cop")
    )
    method: PaymentMethod
    reference: str
    date: date
    notes: str = ""
    receipt_name: str | None = None
    receipt_data_url: str | None = None


class ReconcileInput(APIModel):
    status: PaymentStatus
    reason: str
