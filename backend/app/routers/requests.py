from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common import audit, audit_entries, code, ensure_client_access, fail_integrity, iso, new_id
from app.database import execute, get_db
from app.schemas import RequestInput
from app.security import require_roles


router = APIRouter(prefix="/api/requests")
DB = Annotated[Session, Depends(get_db)]
ROLES = ("Administrador", "Asesor", "Cliente")


def request_record(db: Session, row) -> dict:
    client = execute(
        db, "SELECT name, email, phone FROM client_records WHERE id = :id", id=row["client_id"]
    ).mappings().one()
    created_by = execute(
        db, "SELECT name FROM users WHERE id = :id", id=row["created_by"]
    ).scalar()
    updated_by = execute(
        db, "SELECT name FROM users WHERE id = :id", id=row["updated_by"]
    ).scalar()
    return {
        "id": str(row["id"]),
        "code": row["code"],
        "clientId": str(row["client_id"]),
        "clientName": client["name"],
        "clientEmail": client["email"],
        "clientPhone": client["phone"] or "",
        "destination": row["destination"],
        "thumbnailUrl": row["thumbnail_url"] or "",
        "startDate": iso(row["start_date"]),
        "endDate": iso(row["end_date"]),
        "budgetCOP": row["budget_cop"],
        "travelersCount": row["travelers_count"],
        "status": row["status"],
        "notes": row["notes"] or "",
        "createdBy": created_by or "",
        "createdAt": iso(row["created_at"]),
        "updatedBy": updated_by or "",
        "updatedAt": iso(row["updated_at"]),
        "history": audit_entries(db, "request", str(row["id"])),
    }


def validate_request(body: RequestInput) -> None:
    if body.end_date < body.start_date:
        raise HTTPException(status_code=422, detail="La fecha final debe ser igual o posterior a la inicial.")
    if body.budget_cop <= 0 or body.travelers_count < 1:
        raise HTTPException(status_code=422, detail="Revisa presupuesto y número de viajeros.")
    if not body.destination.strip():
        raise HTTPException(status_code=422, detail="Ingresa el destino.")


@router.get("")
def list_requests(db: DB, actor: Annotated[dict, Depends(require_roles(*ROLES))]):
    if actor["role"] == "Cliente":
        rows = execute(
            db,
            """SELECT r.* FROM travel_requests r
               JOIN client_records c ON c.id = r.client_id
               WHERE c.user_id = :user_id ORDER BY r.created_at DESC""",
            user_id=actor["id"],
        ).mappings()
    else:
        rows = execute(db, "SELECT * FROM travel_requests ORDER BY created_at DESC").mappings()
    return [request_record(db, row) for row in rows]


@router.get("/clients")
def request_clients(db: DB, actor: Annotated[dict, Depends(require_roles(*ROLES))]):
    if actor["role"] == "Cliente":
        rows = execute(
            db,
            "SELECT id, name, email, phone, created_at FROM client_records WHERE user_id = :id",
            id=actor["id"],
        ).mappings()
    else:
        rows = execute(
            db,
            "SELECT id, name, email, phone, created_at FROM client_records ORDER BY name",
        ).mappings()
    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"] or "",
            "createdAt": iso(row["created_at"]),
            "createdBy": "",
        }
        for row in rows
    ]


@router.get("/{request_id}")
def get_request(
    request_id: str,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*ROLES))],
):
    row = execute(
        db, "SELECT * FROM travel_requests WHERE id = :id", id=request_id
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="La solicitud no está disponible.")
    ensure_client_access(db, actor, str(row["client_id"]))
    return request_record(db, row)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_request(
    body: RequestInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*ROLES))],
):
    validate_request(body)
    if not execute(db, "SELECT id FROM client_records WHERE id = :id", id=body.client_id).first():
        raise HTTPException(status_code=404, detail="Selecciona un cliente válido.")
    ensure_client_access(db, actor, body.client_id)
    request_id = new_id()
    try:
        row = execute(
            db,
            """INSERT INTO travel_requests
               (id, code, client_id, destination, start_date, end_date, budget_cop,
                travelers_count, status, notes, created_by, updated_by)
               VALUES (:id, :code, :client_id, :destination, :start_date, :end_date,
                       :budget_cop, :travelers_count, 'Abierta', :notes, :actor, :actor)
               RETURNING *""",
            id=request_id,
            code=code(db, "SOL"),
            client_id=body.client_id,
            destination=body.destination.strip(),
            start_date=body.start_date,
            end_date=body.end_date,
            budget_cop=body.budget_cop,
            travelers_count=body.travelers_count,
            notes=body.notes,
            actor=actor["id"],
        ).mappings().one()
        audit(db, "request", request_id, "Solicitud creada", actor)
        db.commit()
        return request_record(db, row)
    except IntegrityError as error:
        db.rollback()
        fail_integrity(error)


@router.put("/{request_id}")
def update_request(
    request_id: str,
    body: RequestInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*ROLES))],
):
    validate_request(body)
    previous = execute(
        db, "SELECT * FROM travel_requests WHERE id = :id FOR UPDATE", id=request_id
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=404, detail="La solicitud no está disponible.")
    ensure_client_access(db, actor, str(previous["client_id"]))
    ensure_client_access(db, actor, body.client_id)
    status_value = previous["status"] if actor["role"] == "Cliente" else body.status
    row = execute(
        db,
        """UPDATE travel_requests SET client_id = :client_id, destination = :destination,
             start_date = :start_date, end_date = :end_date, budget_cop = :budget_cop,
             travelers_count = :travelers_count, status = :status, notes = :notes,
             updated_by = :actor
           WHERE id = :id RETURNING *""",
        id=request_id,
        client_id=body.client_id,
        destination=body.destination.strip(),
        start_date=body.start_date,
        end_date=body.end_date,
        budget_cop=body.budget_cop,
        travelers_count=body.travelers_count,
        status=status_value,
        notes=body.notes,
        actor=actor["id"],
    ).mappings().one()
    action = (
        f"Estado cambiado a {status_value}"
        if status_value != previous["status"]
        else "Solicitud actualizada"
    )
    audit(db, "request", request_id, action, actor)
    db.commit()
    return request_record(db, row)
