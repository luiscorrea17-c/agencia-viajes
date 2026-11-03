from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.common import audit, code, iso, new_id
from app.database import execute


DEFAULT_CONDITIONS = (
    "Tarifa sujeta a condiciones del proveedor aéreo y hotelero. "
    "Cambios de fecha o pasajero hasta 7 días antes de la salida."
)


def due_date(start_date: date) -> date:
    target = start_date - timedelta(days=7)
    if target > date.today():
        return target
    fallback = date.today() + timedelta(days=5)
    return min(fallback, start_date)


def candidate_travelers(db: Session, client_id: str) -> list[dict]:
    client = execute(
        db,
        """SELECT id, name, doc_type, doc_number, passport_expiry
           FROM client_records WHERE id = :id""",
        id=client_id,
    ).mappings().first()
    if not client:
        return []
    result = [
        {
            "id": str(client["id"]),
            "fullName": client["name"],
            "docType": client["doc_type"],
            "docNumber": client["doc_number"],
            "isMinor": False,
            "passportExpiry": iso(client["passport_expiry"]),
        }
    ]
    companions = execute(
        db,
        """SELECT id, full_name, doc_type, doc_number, is_minor, passport_expiry
           FROM client_companions WHERE client_id = :id ORDER BY full_name""",
        id=client_id,
    ).mappings()
    result.extend(
        {
            "id": str(item["id"]),
            "fullName": item["full_name"],
            "docType": item["doc_type"],
            "docNumber": item["doc_number"],
            "isMinor": item["is_minor"],
            "passportExpiry": iso(item["passport_expiry"]),
        }
        for item in companions
    )
    return result


def create_booking_from_quote(
    db: Session,
    quote: dict[str, Any],
    actor: dict,
    travelers: list[dict[str, Any]] | None = None,
    conditions: str = "",
    payment_due_date: date | None = None,
):
    if quote["total_cop"] <= 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede crear una reserva con una cotización de total cero.",
        )
    if execute(db, "SELECT 1 FROM bookings WHERE quote_id = :id", id=quote["id"]).first():
        raise HTTPException(status_code=409, detail="Esta cotización ya tiene reserva.")

    request = execute(
        db,
        """SELECT r.* FROM travel_requests r WHERE r.id = :id""",
        id=quote["request_id"],
    ).mappings().one()
    selected_travelers = travelers
    if not selected_travelers:
        selected_travelers = candidate_travelers(db, str(request["client_id"]))[
            : request["travelers_count"]
        ]
    if not selected_travelers:
        raise HTTPException(
            status_code=422,
            detail="Registra al menos un viajero en el expediente antes de aprobar la cotización.",
        )

    payment_due = payment_due_date or due_date(request["start_date"])
    if payment_due > request["start_date"]:
        raise HTTPException(
            status_code=422,
            detail="La fecha límite de pago no puede ser posterior a la salida.",
        )

    booking_id = new_id()
    row = execute(
        db,
        """INSERT INTO bookings
           (id, code, quote_id, request_id, client_id, destination, thumbnail_url,
            start_date, end_date, payment_due_date, travelers_count, conditions,
            total_cop, paid_cop, status, notes, created_by)
           VALUES (:id, :code, :quote, :request, :client, :destination, :thumbnail,
                   :start_date, :end_date, :due, :count, :conditions, :total, 0,
                   'pendiente_pago', :notes, :actor) RETURNING *""",
        id=booking_id,
        code=code(db, "RES"),
        quote=quote["id"],
        request=request["id"],
        client=request["client_id"],
        destination=request["destination"],
        thumbnail=request["thumbnail_url"],
        start_date=request["start_date"],
        end_date=request["end_date"],
        due=payment_due,
        count=request["travelers_count"],
        conditions=conditions.strip() or DEFAULT_CONDITIONS,
        total=quote["total_cop"],
        notes=quote["commercial_description"] or "",
        actor=actor["id"],
    ).mappings().one()

    for traveler in selected_travelers:
        execute(
            db,
            """INSERT INTO booking_travelers
               (id, booking_id, full_name, doc_type, doc_number, is_minor, passport_expiry)
               VALUES (:id, :booking, :name, :doc_type, :doc_number, :minor, :expiry)""",
            id=new_id(),
            booking=booking_id,
            name=traveler["fullName"].strip(),
            doc_type=traveler["docType"],
            doc_number=traveler["docNumber"].strip(),
            minor=traveler.get("isMinor", False),
            expiry=traveler.get("passportExpiry"),
        )

    quote_items = execute(
        db,
        "SELECT * FROM quote_items WHERE quote_id = :id ORDER BY sort_order, id",
        id=quote["id"],
    ).mappings()
    for item in quote_items:
        execute(
            db,
            """INSERT INTO booking_agreed_items
               (id, booking_id, category, description, quantity, unit_price_cop)
               VALUES (:id, :booking, :category, :description, :quantity, :price)""",
            id=new_id(),
            booking=booking_id,
            category=item["category"],
            description=item["description"],
            quantity=item["quantity"],
            price=item["unit_price_cop"],
        )
    audit(
        db,
        "booking",
        booking_id,
        f"Reserva creada desde {quote['code']} ({len(selected_travelers)} viajero(s) asociado(s))",
        actor,
    )
    return row
