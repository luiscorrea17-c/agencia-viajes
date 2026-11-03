import base64
import binascii
import re
import uuid
from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.booking_service import (
    candidate_travelers,
    create_booking_from_quote,
    due_date,
)
from app.common import audit, audit_entries, code, ensure_client_access, iso, new_id
from app.config import RECEIPTS_DIR
from app.database import execute, get_db
from app.routers.quotes import quote_record
from app.schemas import BookingInput, BookingStatusInput, PaymentInput, ReconcileInput
from app.security import require_roles


router = APIRouter(prefix="/api")
DB = Annotated[Session, Depends(get_db)]
BOOKING_READ = ("Administrador", "Asesor", "Cliente")
PAYMENT_ROLES = ("Administrador", "Contabilidad", "Cliente")
MANAGERS = ("Asesor",)
PAYMENT_REGISTRARS = ("Cliente",)
RECONCILERS = ("Contabilidad",)
MAX_RECEIPT_BYTES = 2 * 1024 * 1024


def booking_record(db: Session, row) -> dict:
    client = execute(
        db, "SELECT name FROM client_records WHERE id = :id", id=row["client_id"]
    ).scalar_one()
    travelers = execute(
        db,
        """SELECT id, full_name, doc_type, doc_number, is_minor, passport_expiry
           FROM booking_travelers WHERE booking_id = :id ORDER BY id""",
        id=row["id"],
    ).mappings()
    items = execute(
        db,
        """SELECT id, category, description, quantity, unit_price_cop
           FROM booking_agreed_items WHERE booking_id = :id ORDER BY id""",
        id=row["id"],
    ).mappings()
    return {
        "id": str(row["id"]),
        "code": row["code"],
        "quoteId": str(row["quote_id"]),
        "requestId": str(row["request_id"]),
        "clientId": str(row["client_id"]),
        "clientName": client,
        "destination": row["destination"],
        "thumbnailUrl": row["thumbnail_url"] or "",
        "startDate": iso(row["start_date"]),
        "endDate": iso(row["end_date"]),
        "paymentDueDate": iso(row["payment_due_date"]),
        "travelersCount": row["travelers_count"],
        "travelers": [
            {
                "id": str(item["id"]),
                "fullName": item["full_name"],
                "docType": item["doc_type"],
                "docNumber": item["doc_number"],
                "isMinor": item["is_minor"],
                "passportExpiry": iso(item["passport_expiry"]),
            }
            for item in travelers
        ],
        "agreedItems": [
            {
                "id": str(item["id"]),
                "category": item["category"],
                "description": item["description"],
                "quantity": item["quantity"],
                "unitPriceCOP": item["unit_price_cop"],
                "isAiGenerated": False,
                "editedByAdvisor": False,
            }
            for item in items
        ],
        "conditions": row["conditions"] or "",
        "totalCOP": row["total_cop"],
        "paidCOP": row["paid_cop"],
        "status": row["status"],
        "notes": row["notes"] or "",
        "history": audit_entries(db, "booking", str(row["id"])),
    }


def payment_record(db: Session, row) -> dict:
    booking = execute(
        db,
        """SELECT b.code AS booking_code, c.name AS client_name
           FROM bookings b JOIN client_records c ON c.id = b.client_id
           WHERE b.id = :id""",
        id=row["booking_id"],
    ).mappings().one()
    return {
        "id": str(row["id"]),
        "code": row["code"],
        "bookingId": str(row["booking_id"]),
        "bookingCode": booking["booking_code"],
        "clientId": str(row["client_id"]),
        "clientName": booking["client_name"],
        "amountCOP": row["amount_cop"],
        "method": row["method"],
        "reference": row["reference"] or "",
        "date": iso(row["payment_date"]),
        "receiptName": row["receipt_name"],
        "receiptUrl": f"/api/payments/{row['id']}/receipt" if row["receipt_path"] else None,
        "status": row["status"],
        "notes": row["notes"] or "",
        "history": audit_entries(db, "payment", str(row["id"])),
    }


def client_visible(db: Session, actor: dict, client_id: str) -> bool:
    if actor["role"] != "Cliente":
        return True
    return execute(
        db,
        "SELECT 1 FROM client_records WHERE id = :client AND user_id = :user",
        client=client_id,
        user=actor["id"],
    ).first() is not None


@router.get("/bookings")
def list_bookings(
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*BOOKING_READ))],
):
    if actor["role"] == "Cliente":
        rows = execute(
            db,
            """SELECT b.* FROM bookings b JOIN client_records c ON c.id = b.client_id
               WHERE c.user_id = :user ORDER BY b.created_at DESC""",
            user=actor["id"],
        ).mappings()
    else:
        rows = execute(db, "SELECT * FROM bookings ORDER BY created_at DESC").mappings()
    return [booking_record(db, row) for row in rows]


@router.get("/bookings/options")
def booking_options(
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*PAYMENT_ROLES))],
):
    query = """SELECT b.*, c.name AS payment_client_name
               FROM bookings b JOIN client_records c ON c.id = b.client_id
               WHERE b.status <> 'cancelada'"""
    params = {}
    if actor["role"] == "Cliente":
        query += " AND c.user_id = :user"
        params["user"] = actor["id"]
    rows = execute(db, query, **params).mappings()
    return [
        {
            "id": str(row["id"]),
            "code": row["code"],
            "clientId": str(row["client_id"]),
            "clientName": row["payment_client_name"],
            "destination": row["destination"],
            "paymentDueDate": iso(row["payment_due_date"]),
            "totalCOP": row["total_cop"],
            "paidCOP": row["paid_cop"],
            "status": row["status"],
        }
        for row in rows
    ]


@router.get("/bookings/sources")
def booking_sources(
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Asesor"))],
):
    rows = execute(
        db,
        """SELECT q.* FROM quotes q
           LEFT JOIN bookings b ON b.quote_id = q.id
           WHERE q.status = 'Aprobada' AND b.id IS NULL
           ORDER BY q.created_at DESC""",
    ).mappings()
    sources = []
    for quote in rows:
        request = execute(
            db, "SELECT * FROM travel_requests WHERE id = :id", id=quote["request_id"]
        ).mappings().one()
        client_id = str(request["client_id"])
        sources.append(
            {
                **quote_record(db, quote),
                "clientId": client_id,
                "startDate": iso(request["start_date"]),
                "endDate": iso(request["end_date"]),
                "travelersCount": request["travelers_count"],
                "defaultPaymentDueDate": iso(due_date(request["start_date"])),
                "candidateTravelers": candidate_travelers(db, client_id),
            }
        )
    return sources


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
def create_booking(
    body: BookingInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*MANAGERS))],
):
    quote = execute(
        db,
        """SELECT q.* FROM quotes q WHERE q.id = :id AND q.status = 'Aprobada'
           FOR UPDATE""",
        id=body.quote_id,
    ).mappings().first()
    if not quote:
        raise HTTPException(status_code=404, detail="Selecciona una cotización aprobada.")
    if quote["total_cop"] <= 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede crear una reserva con una cotización de total cero.",
        )
    travelers = [item.model_dump(by_alias=True) for item in body.travelers]
    try:
        row = create_booking_from_quote(
            db,
            quote,
            actor,
            travelers=travelers,
            conditions=body.conditions,
            payment_due_date=body.payment_due_date,
        )
        db.commit()
        return booking_record(db, row)
    except Exception:
        db.rollback()
        raise


@router.patch("/bookings/{booking_id}/status")
def change_booking_status(
    booking_id: str,
    body: BookingStatusInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*MANAGERS))],
):
    row = execute(
        db, "SELECT * FROM bookings WHERE id = :id FOR UPDATE", id=booking_id
    ).mappings().first()
    if not row or row["status"] == "cancelada":
        raise HTTPException(status_code=404, detail="Esta reserva no admite cambios.")
    allowed = {
        "pendiente_pago": {"cancelada"},
        "confirmada": {"en_modificacion", "cancelada"},
        "en_modificacion": {"confirmada", "cancelada"},
        "cancelada": set(),
    }
    if body.status not in allowed[row["status"]]:
        raise HTTPException(status_code=409, detail="Cambio de estado no permitido.")
    if body.status == "confirmada" and row["paid_cop"] < row["total_cop"]:
        raise HTTPException(status_code=409, detail="La reserva tiene saldo pendiente.")
    if not body.notes.strip():
        raise HTTPException(status_code=422, detail="Indica el motivo del cambio.")
    updated = execute(
        db,
        """UPDATE bookings SET status = :status, notes = :notes WHERE id = :id
           RETURNING *""",
        id=booking_id,
        status=body.status,
        notes=body.notes.strip(),
    ).mappings().one()
    audit(db, "booking", booking_id, f"Reserva: {body.status}. {body.notes.strip()}", actor, body.notes.strip())
    if body.status in ("cancelada", "confirmada"):
        execute(
            db,
            "UPDATE travel_requests SET status = 'Cerrada', updated_by = :actor WHERE id = :id",
            actor=actor["id"],
            id=row["request_id"],
        )
        audit(db, "request", str(row["request_id"]), f"Solicitud cerrada ({row['code']}: {body.status})", actor)
    db.commit()
    return booking_record(db, updated)


@router.get("/payments")
def list_payments(
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*PAYMENT_ROLES))],
):
    if actor["role"] == "Cliente":
        rows = execute(
            db,
            """SELECT p.* FROM payments p JOIN client_records c ON c.id = p.client_id
               WHERE c.user_id = :user ORDER BY p.created_at DESC""",
            user=actor["id"],
        ).mappings()
    else:
        rows = execute(db, "SELECT * FROM payments ORDER BY created_at DESC").mappings()
    return [payment_record(db, row) for row in rows]


def decode_receipt(data_url: str, file_name: str | None) -> tuple[str, bytes]:
    match = re.fullmatch(r"data:(image/[a-zA-Z0-9.+-]+|application/pdf);base64,(.+)", data_url, re.DOTALL)
    if not match:
        raise HTTPException(status_code=422, detail="El comprobante debe ser una imagen o PDF válido.")
    try:
        content = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="El comprobante no tiene un formato Base64 válido.") from None
    if not content or len(content) > MAX_RECEIPT_BYTES:
        raise HTTPException(status_code=413, detail="El comprobante debe pesar como máximo 2 MB.")
    suffix = Path(file_name or "").suffix.lower()
    if not suffix:
        suffix = ".pdf" if match.group(1) == "application/pdf" else ".img"
    if suffix not in (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".img"):
        raise HTTPException(status_code=422, detail="Tipo de archivo de comprobante no permitido.")
    return suffix, content


@router.post("/payments", status_code=status.HTTP_201_CREATED)
def register_payment(
    body: PaymentInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*PAYMENT_REGISTRARS))],
):
    booking = execute(
        db, "SELECT * FROM bookings WHERE id = :id FOR UPDATE", id=body.booking_id
    ).mappings().first()
    if not booking or booking["status"] == "cancelada":
        raise HTTPException(status_code=404, detail="Selecciona una reserva disponible.")
    if not client_visible(db, actor, str(booking["client_id"])):
        raise HTTPException(status_code=404, detail="Selecciona una reserva disponible.")
    if body.amount_cop <= 0:
        raise HTTPException(status_code=422, detail="El importe debe ser positivo.")
    committed = execute(
        db,
        """SELECT COALESCE(SUM(amount_cop), 0) FROM payments
           WHERE booking_id = :id AND status IN ('validado', 'por_conciliar')""",
        id=body.booking_id,
    ).scalar_one()
    if body.amount_cop > booking["total_cop"] - committed:
        raise HTTPException(status_code=422, detail="El importe supera el saldo sin registrar.")
    if body.date > date.today() or not body.reference.strip():
        raise HTTPException(status_code=422, detail="Revisa medio, referencia y fecha del pago.")
    payment_id = new_id()
    receipt_suffix = None
    receipt_bytes = None
    if body.receipt_data_url:
        receipt_suffix, receipt_bytes = decode_receipt(body.receipt_data_url, body.receipt_name)
    stored_name = None
    stored_path = None
    if receipt_bytes is not None and receipt_suffix:
        clean_name = Path(body.receipt_name or "comprobante").name
        stored_name = clean_name[:180]
        stored_path = str(Path("receipts") / f"{payment_id}_{uuid.uuid4().hex}{receipt_suffix}")
    try:
        row = execute(
            db,
            """INSERT INTO payments
               (id, code, booking_id, client_id, amount_cop, method, reference,
                payment_date, receipt_name, receipt_path, status, notes, created_by)
               VALUES (:id, :code, :booking, :client, :amount, :method, :reference,
                       :payment_date, :receipt_name, :receipt_path, 'por_conciliar', :notes, :actor)
               RETURNING *""",
            id=payment_id,
            code=code(db, "PAG"),
            booking=booking["id"],
            client=booking["client_id"],
            amount=body.amount_cop,
            method=body.method,
            reference=body.reference.strip(),
            payment_date=body.date,
            receipt_name=stored_name,
            receipt_path=stored_path,
            notes=body.notes,
            actor=actor["id"],
        ).mappings().one()
        audit(
            db,
            "payment",
            payment_id,
            f"Pago registrado{f' · Comprobante: {stored_name}' if stored_name else ''}",
            actor,
        )
        if receipt_bytes is not None and stored_path:
            destination = (RECEIPTS_DIR.parent / stored_path).resolve()
            if RECEIPTS_DIR.parent not in destination.parents:
                raise HTTPException(status_code=422, detail="Ruta de comprobante inválida.")
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(receipt_bytes)
        db.commit()
        return payment_record(db, row)
    except Exception:
        db.rollback()
        if stored_path:
            (RECEIPTS_DIR.parent / stored_path).unlink(missing_ok=True)
        raise


@router.get("/payments/{payment_id}/receipt")
def get_receipt(
    payment_id: str,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*PAYMENT_ROLES))],
):
    row = execute(
        db, "SELECT * FROM payments WHERE id = :id", id=payment_id
    ).mappings().first()
    if not row or not row["receipt_path"] or not client_visible(db, actor, str(row["client_id"])):
        raise HTTPException(status_code=404, detail="El comprobante no está disponible.")
    target = (RECEIPTS_DIR.parent / row["receipt_path"]).resolve()
    if RECEIPTS_DIR.parent not in target.parents or not target.is_file():
        raise HTTPException(status_code=404, detail="El comprobante no está disponible.")
    return FileResponse(
        target,
        filename=Path(row["receipt_name"] or target.name).name,
        media_type="application/octet-stream",
    )


@router.patch("/payments/{payment_id}/reconcile")
def reconcile_payment(
    payment_id: str,
    body: ReconcileInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*RECONCILERS))],
):
    initial = execute(
        db, "SELECT booking_id FROM payments WHERE id = :id", id=payment_id
    ).first()
    if not initial:
        raise HTTPException(status_code=404, detail="El pago no está disponible.")
    booking = execute(
        db, "SELECT * FROM bookings WHERE id = :id FOR UPDATE", id=initial[0]
    ).mappings().first()
    payment = execute(
        db, "SELECT * FROM payments WHERE id = :id FOR UPDATE", id=payment_id
    ).mappings().first()
    if not payment:
        raise HTTPException(status_code=404, detail="El pago no está disponible.")
    allowed = (
        payment["status"] == "por_conciliar" and body.status in ("validado", "rechazado")
    ) or (payment["status"] == "validado" and body.status == "devuelto")
    if not allowed:
        raise HTTPException(status_code=409, detail="Cambio de estado no permitido.")
    if not body.reason.strip():
        raise HTTPException(status_code=422, detail="Indica el motivo de la decisión.")
    if body.status == "validado" and booking["status"] == "cancelada":
        raise HTTPException(status_code=409, detail="No puedes validar un pago de una reserva cancelada.")
    updated_payment = execute(
        db,
        """UPDATE payments SET status = :status, notes = :reason WHERE id = :id
           RETURNING *""",
        id=payment_id,
        status=body.status,
        reason=body.reason.strip(),
    ).mappings().one()
    audit(db, "payment", payment_id, f"Pago {body.status}: {body.reason.strip()}", actor, body.reason.strip())
    paid = execute(
        db,
        """SELECT COALESCE(SUM(amount_cop), 0) FROM payments
           WHERE booking_id = :id AND status = 'validado'""",
        id=booking["id"],
    ).scalar_one()
    next_status = booking["status"]
    if booking["status"] not in ("cancelada", "en_modificacion"):
        next_status = "confirmada" if paid >= booking["total_cop"] else "pendiente_pago"
    execute(
        db,
        "UPDATE bookings SET paid_cop = :paid, status = :status WHERE id = :id",
        id=booking["id"],
        paid=paid,
        status=next_status,
    )
    audit(db, "booking", str(booking["id"]), f"Saldo actualizado por {payment['code']}", actor)
    if next_status == "confirmada":
        execute(
            db,
            "UPDATE travel_requests SET status = 'Cerrada', updated_by = :actor WHERE id = :id",
            actor=actor["id"],
            id=booking["request_id"],
        )
        audit(db, "request", str(booking["request_id"]), f"Solicitud cerrada por confirmación de {booking['code']}", actor)
    db.commit()
    return payment_record(db, updated_payment)
