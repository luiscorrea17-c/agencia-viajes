from collections.abc import Mapping
from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai import AIProviderError, TripBrief, generate_quote_suggestion
from app.booking_service import create_booking_from_quote
from app.common import audit, code, fail_integrity, iso, new_id
from app.database import execute, get_db
from app.schemas import QuoteDraftInput, QuoteResponseInput
from app.security import require_roles


router = APIRouter(prefix="/api/quotes")
DB = Annotated[Session, Depends(get_db)]
STAFF = ("Administrador", "Asesor")


def quote_record(db: Session, row) -> dict:
    request = execute(
        db,
        """SELECT r.*, c.name AS client_name, c.email AS client_email
           FROM travel_requests r JOIN client_records c ON c.id = r.client_id
           WHERE r.id = :id""",
        id=row["request_id"],
    ).mappings().one()
    items = execute(
        db,
        """SELECT id, category, description, quantity, unit_price_cop,
                  is_ai_generated, edited_by_advisor
           FROM quote_items WHERE quote_id = :id ORDER BY sort_order, id""",
        id=row["id"],
    ).mappings()
    approved_by = None
    if row["admin_approved_by"]:
        approved_by = execute(
            db, "SELECT name FROM users WHERE id = :id", id=row["admin_approved_by"]
        ).scalar()
    return {
        "id": str(row["id"]),
        "code": row["code"],
        "requestId": str(row["request_id"]),
        "requestBudgetCOP": row["request_budget_cop"],
        "version": row["version"],
        "clientName": request["client_name"],
        "clientEmail": request["client_email"],
        "destination": request["destination"],
        "commercialDescription": row["commercial_description"] or "",
        "isDescriptionAiGenerated": row["is_description_ai_generated"],
        "items": [
            {
                "id": str(item["id"]),
                "category": item["category"],
                "description": item["description"],
                "quantity": item["quantity"],
                "unitPriceCOP": item["unit_price_cop"],
                "isAiGenerated": item["is_ai_generated"],
                "editedByAdvisor": item["edited_by_advisor"],
            }
            for item in items
        ],
        "basePriceCOP": row["base_price_cop"],
        "seasonSurchargePercent": float(row["season_surcharge_percent"]),
        "seasonSurchargeCOP": row["season_surcharge_cop"],
        "discountPercent": float(row["discount_percent"]),
        "discountCOP": row["discount_cop"],
        "requiresAdminApproval": row["requires_admin_approval"],
        "adminApprovedBy": approved_by,
        "totalCOP": row["total_cop"],
        "validUntil": iso(row["valid_until"]),
        "status": row["status"],
        "advisorDecisionLog": row["advisor_decision_log"] or "",
        "updatedBy": execute(
            db, "SELECT name FROM users WHERE id = :id", id=row["updated_by"]
        ).scalar() or "",
        "updatedAt": iso(row["updated_at"]),
    }


def visible_quote(db: Session, actor: dict, quote_id: str, lock: bool = False):
    row = execute(
        db,
        f"""SELECT q.* FROM quotes q
            JOIN travel_requests r ON r.id = q.request_id
            JOIN client_records c ON c.id = r.client_id
            WHERE q.id = :id
              AND (:is_staff OR (c.user_id = :user_id AND q.status <> 'Borrador'))
            {"FOR UPDATE OF q" if lock else ""}""",
        id=quote_id,
        is_staff=actor["role"] in STAFF,
        user_id=actor["id"],
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="La cotización no está disponible.")
    if row["status"] == "Enviada" and row["valid_until"] < date.today():
        execute(db, "UPDATE quotes SET status = 'Expirada' WHERE id = :id", id=quote_id)
        db.commit()
        row = dict(row)
        row["status"] = "Expirada"
    return row


def append_decision(previous: str | None, actor_name: str, note: str) -> str:
    entry = f"{date.today().strftime('%d/%m/%Y')} · {actor_name}: {note}"
    return "\n".join(part for part in (previous or "", entry) if part)


def set_request_status(db: Session, request_id: str, actor: dict, note: str):
    execute(
        db,
        "UPDATE travel_requests SET status = 'En cotización', updated_by = :actor WHERE id = :id",
        actor=actor["id"],
        id=request_id,
    )
    audit(db, "request", request_id, note, actor)


def quote_brief(request: Mapping[str, Any]) -> TripBrief:
    return {
        "destination": request["destination"],
        "start_date": request["start_date"].isoformat(),
        "end_date": request["end_date"].isoformat(),
        "travelers_count": request["travelers_count"],
        "budget_cop": request["budget_cop"],
        "notes": request["notes"] or "",
    }


def require_positive_quote_total(quote: Mapping[str, Any]) -> None:
    if quote["total_cop"] <= 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede aprobar, enviar o reservar una cotización con total de cero.",
        )


@router.get("")
def list_quotes(db: DB, actor: Annotated[dict, Depends(require_roles(*STAFF, "Cliente"))]):
    if actor["role"] == "Cliente":
        rows = execute(
            db,
            """SELECT q.* FROM quotes q
               JOIN travel_requests r ON r.id = q.request_id
               JOIN client_records c ON c.id = r.client_id
               WHERE c.user_id = :user_id AND q.status <> 'Borrador'
               ORDER BY q.created_at DESC""",
            user_id=actor["id"],
        ).mappings()
    else:
        rows = execute(db, "SELECT * FROM quotes ORDER BY created_at DESC").mappings()
    today = date.today()
    result = []
    for row in rows:
        if row["status"] == "Enviada" and row["valid_until"] < today:
            row = dict(row)
            row["status"] = "Expirada"
        record = quote_record(db, row)
        if actor["role"] == "Cliente":
            booking = execute(
                db,
                "SELECT code FROM bookings WHERE quote_id = :quote_id",
                quote_id=row["id"],
            ).mappings().first()
            record["bookingCode"] = booking["code"] if booking else None
        result.append(record)
    return result


@router.post("/from-request/{request_id}", status_code=status.HTTP_201_CREATED)
def create_from_request(
    request_id: str,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Asesor"))],
):
    request = execute(
        db,
        """SELECT r.*, c.name AS client_name, c.email AS client_email
           FROM travel_requests r JOIN client_records c ON c.id = r.client_id
           WHERE r.id = :id""",
        id=request_id,
    ).mappings().first()
    if not request:
        raise HTTPException(status_code=404, detail="La solicitud no está disponible.")
    if request["status"] == "Cerrada":
        raise HTTPException(status_code=409, detail="La solicitud está cerrada.")

    db.rollback()  # Release the read-only transaction before waiting on Gemini.
    try:
        brief = quote_brief(request)
        suggestion = generate_quote_suggestion(brief)
    except AIProviderError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    request = execute(
        db,
        """SELECT r.*, c.name AS client_name, c.email AS client_email
           FROM travel_requests r JOIN client_records c ON c.id = r.client_id
           WHERE r.id = :id FOR UPDATE OF r""",
        id=request_id,
    ).mappings().first()
    if not request:
        raise HTTPException(status_code=404, detail="La solicitud no está disponible.")
    if request["status"] == "Cerrada":
        raise HTTPException(status_code=409, detail="La solicitud está cerrada.")
    if quote_brief(request) != brief:
        raise HTTPException(
            status_code=409,
            detail="La solicitud cambió durante la generación. Intenta de nuevo.",
        )
    execute(
        db,
        """UPDATE quotes SET status = 'Expirada'
           WHERE request_id = :id AND status = 'Enviada' AND valid_until < CURRENT_DATE""",
        id=request_id,
    )
    if execute(
        db,
        """SELECT 1 FROM quotes WHERE request_id = :id
           AND status IN ('Borrador', 'Enviada', 'Aprobada')""",
        id=request_id,
    ).first():
        raise HTTPException(status_code=409, detail="Esta solicitud ya tiene una cotización activa.")
    version = execute(
        db,
        "SELECT COALESCE(MAX(version), 0) + 1 FROM quotes WHERE request_id = :id",
        id=request_id,
    ).scalar_one()
    budget = request["budget_cop"]
    descriptions = [
        (
            item.category,
            item.description.strip(),
            item.quantity,
            item.unitPriceCOP,
        )
        for item in suggestion.items
    ]
    base = sum(quantity * price for _, _, quantity, price in descriptions)
    quote_id = new_id()
    try:
        row = execute(
            db,
            """INSERT INTO quotes
               (id, code, request_id, request_budget_cop, version, commercial_description,
                is_description_ai_generated, base_price_cop, valid_until, status, updated_by,
                advisor_decision_log)
               VALUES (:id, :code, :request_id, :budget, :version, :description, true,
                       :base, :valid_until, 'Borrador', :actor, :log)
               RETURNING *""",
            id=quote_id,
            code=code(db, "COT"),
            request_id=request_id,
            budget=budget,
            version=version,
            description=suggestion.commercialDescription.strip(),
            base=base,
            valid_until=date.today() + timedelta(days=15),
            actor=actor["id"],
            log=append_decision(
                None,
                actor["name"],
                f"Borrador preliminar sugerido por Gemini (versión {version}).",
            ),
        ).mappings().one()
        for order, (category, item_description, quantity, price) in enumerate(descriptions):
            execute(
                db,
                """INSERT INTO quote_items
                   (id, quote_id, category, description, quantity, unit_price_cop,
                    is_ai_generated, edited_by_advisor, sort_order)
                   VALUES (:id, :quote, :category, :description, :quantity, :price, true, false, :order)""",
                id=new_id(),
                quote=quote_id,
                category=category,
                description=item_description,
                quantity=quantity,
                price=price,
                order=order,
            )
        set_request_status(db, request_id, actor, f"En cotización ({row['code']})")
        db.commit()
        result = execute(db, "SELECT * FROM quotes WHERE id = :id", id=quote_id).mappings().one()
        return quote_record(db, result)
    except IntegrityError as error:
        db.rollback()
        fail_integrity(error)


@router.put("/{quote_id}")
def save_draft(
    quote_id: str,
    body: QuoteDraftInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Asesor"))],
):
    quote = visible_quote(db, actor, quote_id, lock=True)
    if quote["status"] != "Borrador":
        raise HTTPException(status_code=409, detail="Solo se pueden editar cotizaciones en borrador.")
    if not body.commercial_description.strip() or not body.items:
        raise HTTPException(status_code=422, detail="Ingresa la descripción y al menos un servicio.")
    if any(not item.description.strip() or item.quantity < 1 or item.unit_price_cop <= 0 for item in body.items):
        raise HTTPException(status_code=422, detail="Revisa cantidad, descripción y precios de servicios.")
    if not 0 <= body.season_surcharge_percent <= 100 or not 0 <= body.discount_percent <= 100:
        raise HTTPException(status_code=422, detail="Los porcentajes deben estar entre 0 y 100.")
    if body.valid_until < date.today():
        raise HTTPException(status_code=422, detail="La vigencia debe ser hoy o una fecha futura.")
    base = sum(item.quantity * item.unit_price_cop for item in body.items)
    surcharge = round(base * body.season_surcharge_percent / 100)
    discount = round((base + surcharge) * body.discount_percent / 100)
    total = base + surcharge - discount
    if total <= 0:
        raise HTTPException(
            status_code=422,
            detail="El total de la cotización debe ser mayor que $0. Ajusta los precios o el descuento.",
        )
    requires = body.discount_percent > 10
    execute(db, "DELETE FROM quote_items WHERE quote_id = :id", id=quote_id)
    for order, item in enumerate(body.items):
        execute(
            db,
            """INSERT INTO quote_items
               (id, quote_id, category, description, quantity, unit_price_cop,
                is_ai_generated, edited_by_advisor, sort_order)
               VALUES (:id, :quote, :category, :description, :quantity, :price, :ai, :edited, :order)""",
            id=new_id(),
            quote=quote_id,
            category=item.category,
            description=item.description.strip(),
            quantity=item.quantity,
            price=item.unit_price_cop,
            ai=item.is_ai_generated,
            edited=item.edited_by_advisor,
            order=order,
        )
    admin_approved = quote["admin_approved_by"]
    if body.discount_percent != float(quote["discount_percent"]) or not requires:
        admin_approved = None
    row = execute(
        db,
        """UPDATE quotes SET commercial_description = :description,
             is_description_ai_generated = :ai, base_price_cop = :base,
             season_surcharge_percent = :surcharge_percent, season_surcharge_cop = :surcharge,
             discount_percent = :discount_percent, discount_cop = :discount,
             requires_admin_approval = :requires, admin_approved_by = :admin,
             total_cop = :total, valid_until = :valid, updated_by = :actor,
             advisor_decision_log = :log
           WHERE id = :id RETURNING *""",
        id=quote_id,
        description=body.commercial_description.strip(),
        ai=body.is_description_ai_generated,
        base=base,
        surcharge_percent=body.season_surcharge_percent,
        surcharge=surcharge,
        discount_percent=body.discount_percent,
        discount=discount,
        requires=requires,
        admin=admin_approved,
        total=total,
        valid=body.valid_until,
        actor=actor["id"],
        log=append_decision(
            quote["advisor_decision_log"], actor["name"], body.decision_note.strip() or "Borrador actualizado."
        ),
    ).mappings().one()
    db.commit()
    return quote_record(db, row)


@router.post("/{quote_id}/approve-discount")
def approve_discount(
    quote_id: str,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Administrador"))],
):
    quote = visible_quote(db, actor, quote_id, lock=True)
    if quote["status"] != "Borrador" or not quote["requires_admin_approval"] or quote["admin_approved_by"]:
        raise HTTPException(status_code=409, detail="Esta cotización no requiere aprobación de descuento.")
    require_positive_quote_total(quote)
    row = execute(
        db,
        """UPDATE quotes SET admin_approved_by = :actor, updated_by = :actor,
             advisor_decision_log = :log WHERE id = :id RETURNING *""",
        id=quote_id,
        actor=actor["id"],
        log=append_decision(
            quote["advisor_decision_log"], actor["name"], f"Descuento del {quote['discount_percent']} % aprobado."
        ),
    ).mappings().one()
    db.commit()
    return quote_record(db, row)


@router.post("/{quote_id}/send")
def send_quote(
    quote_id: str,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Asesor"))],
):
    quote = visible_quote(db, actor, quote_id, lock=True)
    if quote["status"] != "Borrador":
        raise HTTPException(status_code=409, detail="Solo se pueden enviar cotizaciones en borrador.")
    require_positive_quote_total(quote)
    if quote["requires_admin_approval"] and not quote["admin_approved_by"]:
        raise HTTPException(status_code=409, detail="El descuento requiere aprobación del Administrador.")
    if quote["valid_until"] < date.today():
        raise HTTPException(status_code=422, detail="La vigencia ya venció.")
    row = execute(
        db,
        """UPDATE quotes SET status = 'Enviada', updated_by = :actor,
             advisor_decision_log = :log WHERE id = :id RETURNING *""",
        id=quote_id,
        actor=actor["id"],
        log=append_decision(quote["advisor_decision_log"], actor["name"], "Cotización enviada al cliente."),
    ).mappings().one()
    db.commit()
    return quote_record(db, row)


@router.post("/{quote_id}/respond")
def respond_quote(
    quote_id: str,
    body: QuoteResponseInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Cliente"))],
):
    quote = visible_quote(db, actor, quote_id, lock=True)
    if quote["status"] != "Enviada":
        raise HTTPException(status_code=409, detail="Esta cotización ya no admite respuesta.")
    require_positive_quote_total(quote)
    booking = None
    try:
        row = execute(
            db,
            """UPDATE quotes SET status = :status, updated_by = :actor,
                 advisor_decision_log = :log WHERE id = :id RETURNING *""",
            id=quote_id,
            status=body.decision,
            actor=actor["id"],
            log=append_decision(
                quote["advisor_decision_log"],
                actor["name"],
                "Cliente aprobó la cotización." if body.decision == "Aprobada" else "Cliente rechazó la cotización.",
            ),
        ).mappings().one()
        if body.decision == "Aprobada":
            booking = create_booking_from_quote(db, row, actor)
        result = quote_record(db, row)
        if booking:
            result["bookingCode"] = booking["code"]
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.post("/{quote_id}/ensure-booking")
def ensure_approved_quote_booking(
    quote_id: str,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Cliente"))],
):
    quote = visible_quote(db, actor, quote_id, lock=True)
    if quote["status"] != "Aprobada":
        raise HTTPException(status_code=409, detail="Solo puedes continuar con cotizaciones aprobadas.")
    require_positive_quote_total(quote)
    try:
        existing = execute(
            db,
            "SELECT code FROM bookings WHERE quote_id = :quote_id",
            quote_id=quote_id,
        ).mappings().first()
        if existing:
            db.commit()
            return {"bookingCode": existing["code"]}

        booking = create_booking_from_quote(db, quote, actor)
        db.commit()
        return {"bookingCode": booking["code"]}
    except Exception:
        db.rollback()
        raise
