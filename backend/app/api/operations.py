from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError

from app.core.database import get_record, list_records, save_record
from app.core.security import current_user
from app.schemas.contracts import BookingChange, BookingOptions, PaymentInput, PaymentReconciliation
from app.services.common import audit_entry, next_code, now_iso, sync_request_status

router = APIRouter(tags=["Reservas y pagos"])
BOOKING_CONDITIONS = (
    "Tarifa sujeta a condiciones del proveedor aéreo y hotelero. "
    "Cambios de fecha o pasajero hasta 7 días antes de la salida."
)
BOOKING_TRANSITIONS = {
    "pendiente_pago": {"cancelada"},
    "confirmada": {"en_modificacion", "cancelada"},
    "en_modificacion": {"confirmada", "cancelada"},
    "cancelada": set(),
}


def _visible(actor: dict, record: dict) -> bool:
    return actor["role"] != "Cliente" or actor["id"] == record["clientId"]


def _authorize_bookings(actor: dict) -> None:
    if actor["role"] not in {"Administrador", "Asesor", "Cliente"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para este módulo.")


def _authorize_payments(actor: dict) -> None:
    if actor["role"] not in {"Administrador", "Contabilidad", "Cliente"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para este módulo.")


def _audit(actor: dict, previous: list[dict], action: str) -> list[dict]:
    return [*previous, audit_entry(actor["name"], action)]


def _client_travelers(client: dict) -> list[dict]:
    holder = {
        "id": client["id"],
        "fullName": client["name"],
        "docType": client["docType"],
        "docNumber": client["docNumber"],
        "isMinor": False,
    }
    if client.get("passportExpiry"):
        holder["passportExpiry"] = client["passportExpiry"]
    companions = [
        {
            key: value
            for key, value in {
                "id": item["id"],
                "fullName": item["fullName"],
                "docType": item["docType"],
                "docNumber": item["docNumber"],
                "isMinor": item["isMinor"],
                "passportExpiry": item.get("passportExpiry"),
            }.items()
            if value is not None
        }
        for item in client.get("companions", [])
    ]
    return [holder, *companions]


def _default_due_date(start_date: str) -> str:
    start = date.fromisoformat(start_date)
    target = start - timedelta(days=7)
    today = date.today()
    return (target if target > today else today + timedelta(days=5)).isoformat()


@router.get("/bookings")
def list_bookings(actor: dict = Depends(current_user)):
    _authorize_bookings(actor)
    return [booking for booking in list_records("bookings") if _visible(actor, booking)]


@router.get("/bookings/options")
def list_booking_options(actor: dict = Depends(current_user)):
    _authorize_payments(actor)
    return [
        booking
        for booking in list_records("bookings")
        if _visible(actor, booking) and booking["status"] != "cancelada"
    ]


@router.get("/bookings/sources")
def booking_sources(actor: dict = Depends(current_user)):
    _authorize_bookings(actor)
    if actor["role"] not in {"Administrador", "Asesor"}:
        return []
    booked_quote_ids = {booking["quoteId"] for booking in list_records("bookings")}
    sources = []
    for quote in list_records("quotes"):
        if quote["status"] != "Aprobada" or quote["id"] in booked_quote_ids:
            continue
        request = get_record("requests", quote["requestId"])
        if not request:
            continue
        client = get_record("clients", request["clientId"])
        sources.append(
            {
                **quote,
                "clientId": request["clientId"],
                "startDate": request["startDate"],
                "endDate": request["endDate"],
                "travelersCount": request["travelersCount"],
                "defaultPaymentDueDate": _default_due_date(request["startDate"]),
                "candidateTravelers": _client_travelers(client) if client else [],
            }
        )
    return sources


@router.post("/bookings")
def create_booking(
    payload: dict,
    actor: dict = Depends(current_user),
):
    _authorize_bookings(actor)
    if actor["role"] not in {"Administrador", "Asesor"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el equipo puede crear reservas.")
    quote_id = payload.get("quoteId")
    quote = get_record("quotes", str(quote_id)) if quote_id else None
    if not quote or quote["status"] != "Aprobada":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selecciona una cotización aprobada.")
    if any(booking["quoteId"] == quote_id for booking in list_records("bookings")):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta cotización ya tiene reserva.")
    request = get_record("requests", quote["requestId"])
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La solicitud asociada no está disponible.")
    raw_options = payload.get("options") or {}
    try:
        options = BookingOptions.model_validate(raw_options)
    except ValidationError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Revisa los datos de la reserva.") from error
    client = get_record("clients", request["clientId"])
    fallback = (_client_travelers(client) if client else [])[: request["travelersCount"]]
    travelers = options.travelers if options.travelers else fallback
    if len(travelers) != request["travelersCount"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Asocia la cantidad de viajeros indicada en la solicitud.")
    due_date = options.paymentDueDate or _default_due_date(request["startDate"])
    try:
        parsed_due = date.fromisoformat(due_date)
        departure = date.fromisoformat(request["startDate"])
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa la fecha límite de pago.") from error
    if parsed_due > departure:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La fecha límite de pago no puede ser posterior a la salida.")
    code, _ = next_code("bookings", "RES")
    created = {
        "id": str(uuid4()),
        "code": code,
        "quoteId": quote["id"],
        "requestId": request["id"],
        "clientId": request["clientId"],
        "clientName": request["clientName"],
        "destination": request["destination"],
        "thumbnailUrl": request.get("thumbnailUrl", ""),
        "startDate": request["startDate"],
        "endDate": request["endDate"],
        "paymentDueDate": due_date,
        "travelersCount": request["travelersCount"],
        "travelers": travelers,
        "agreedItems": quote["items"],
        "conditions": (options.conditions or "").strip() or BOOKING_CONDITIONS,
        "totalCOP": quote["totalCOP"],
        "paidCOP": 0,
        "status": "pendiente_pago",
        "notes": quote["commercialDescription"],
        "history": _audit(actor, [], f"Reserva creada desde {quote['code']} ({len(travelers)} viajero(s) asociado(s))"),
    }
    save_record("bookings", created)
    return created


@router.patch("/bookings/{booking_id}")
def change_booking(booking_id: str, data: BookingChange, actor: dict = Depends(current_user)):
    _authorize_bookings(actor)
    if actor["role"] not in {"Administrador", "Asesor"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el equipo puede modificar reservas.")
    booking = get_record("bookings", booking_id)
    if not booking or booking["status"] == "cancelada":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esta reserva no admite cambios.")
    if data.status not in BOOKING_TRANSITIONS.get(booking["status"], set()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cambio de estado no permitido.")
    if data.status == "confirmada" and booking["paidCOP"] < booking["totalCOP"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La reserva tiene saldo pendiente.")
    if not data.notes.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indica el motivo del cambio.")
    updated = {
        **booking,
        "status": data.status,
        "notes": data.notes.strip(),
        "history": _audit(actor, booking.get("history", []), f"Reserva: {data.status}. {data.notes.strip()}"),
    }
    save_record("bookings", updated)
    if data.status in {"cancelada", "confirmada"}:
        sync_request_status(
            updated["requestId"],
            "Cerrada",
            actor["name"],
            f"Solicitud cerrada ({updated['code']}: {data.status})",
        )
    return updated


@router.get("/payments")
def list_payments(actor: dict = Depends(current_user)):
    _authorize_payments(actor)
    return [payment for payment in list_records("payments") if _visible(actor, payment)]


@router.post("/payments")
def register_payment(data: PaymentInput, actor: dict = Depends(current_user)):
    _authorize_payments(actor)
    booking = get_record("bookings", data.bookingId)
    if not booking or not _visible(actor, booking) or booking["status"] == "cancelada":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selecciona una reserva disponible.")
    pending_total = sum(
        payment["amountCOP"]
        for payment in list_records("payments")
        if payment["bookingId"] == booking["id"] and payment["status"] in {"validado", "por_conciliar"}
    )
    if data.amountCOP <= 0 or data.amountCOP > booking["totalCOP"] - pending_total:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El importe debe ser positivo y no superar el saldo sin registrar.")
    try:
        paid_date = date.fromisoformat(data.date)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa medio, referencia y fecha del pago.") from error
    if not data.reference.strip() or paid_date > date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa medio, referencia y fecha del pago.")
    code, _ = next_code("payments", "PAG")
    receipt_note = f" · Comprobante: {data.receiptName.strip()}" if data.receiptName and data.receiptName.strip() else ""
    created = {
        **data.model_dump(exclude_none=True),
        "id": str(uuid4()),
        "code": code,
        "bookingCode": booking["code"],
        "clientId": booking["clientId"],
        "clientName": booking["clientName"],
        "status": "por_conciliar",
        "notes": data.notes,
        "history": _audit(actor, [], f"Pago registrado{receipt_note}"),
    }
    save_record("payments", created)
    return created


@router.patch("/payments/{payment_id}")
def reconcile_payment(
    payment_id: str,
    data: PaymentReconciliation,
    actor: dict = Depends(current_user),
):
    _authorize_payments(actor)
    if actor["role"] not in {"Administrador", "Contabilidad"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo Administrador y Contabilidad concilian pagos.")
    payment = get_record("payments", payment_id)
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El pago no está disponible.")
    allowed = (
        payment["status"] == "por_conciliar" and data.status in {"validado", "rechazado"}
    ) or (payment["status"] == "validado" and data.status == "devuelto")
    if not allowed or not data.reason.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cambio de estado no permitido o motivo requerido.")
    booking = get_record("bookings", payment["bookingId"])
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva no disponible.")
    if data.status == "validado" and booking["status"] == "cancelada":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes validar un pago de una reserva cancelada.")
    updated_payment = {
        **payment,
        "status": data.status,
        "notes": data.reason.strip(),
        "history": _audit(actor, payment.get("history", []), f"Pago {data.status}: {data.reason.strip()}"),
    }
    save_record("payments", updated_payment)
    validated = [
        entry
        for entry in list_records("payments")
        if entry["bookingId"] == booking["id"] and entry["status"] == "validado"
    ]
    paid = sum(entry["amountCOP"] for entry in validated)
    next_booking_status = (
        booking["status"]
        if booking["status"] in {"cancelada", "en_modificacion"}
        else "confirmada"
        if paid >= booking["totalCOP"]
        else "pendiente_pago"
    )
    save_record(
        "bookings",
        {
            **booking,
            "paidCOP": paid,
            "status": next_booking_status,
            "history": _audit(actor, booking.get("history", []), f"Saldo actualizado por {updated_payment['code']}"),
        },
    )
    if next_booking_status == "confirmada":
        sync_request_status(
            booking["requestId"],
            "Cerrada",
            actor["name"],
            f"Solicitud cerrada por confirmación de {booking['code']}",
        )
    return updated_payment
