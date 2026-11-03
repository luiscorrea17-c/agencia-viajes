import json
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common import audit, audit_entries, code, ensure_client_access, fail_integrity, iso, new_id
from app.database import execute, get_db
from app.schemas import ClientInput
from app.security import require_roles


router = APIRouter(prefix="/api/clients")
DB = Annotated[Session, Depends(get_db)]
READ_ROLES = ("Administrador", "Asesor", "Contabilidad", "Cliente")
EDIT_ROLES = ("Administrador", "Asesor", "Cliente")


def client_record(db: Session, row) -> dict:
    client_id = str(row["id"])
    companions = execute(
        db,
        """SELECT id, full_name, birth_date, is_minor, doc_type, doc_number, passport_expiry
           FROM client_companions WHERE client_id = :id ORDER BY full_name""",
        id=client_id,
    ).mappings()
    linked = execute(
        db,
        """SELECT code, destination, start_date, status
           FROM travel_requests WHERE client_id = :id ORDER BY created_at DESC""",
        id=client_id,
    ).mappings()
    return {
        "id": client_id,
        "code": row["code"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"] or "",
        "type": row["type"],
        "segment": row["segment"],
        "docType": row["doc_type"],
        "docNumber": row["doc_number"],
        "passportNumber": row["passport_number"],
        "passportExpiry": iso(row["passport_expiry"]),
        "billingAddress": row["billing_address"] or "",
        "taxRegime": row["tax_regime"] or "",
        "companions": [
            {
                "id": str(item["id"]),
                "fullName": item["full_name"],
                "birthDate": iso(item["birth_date"]),
                "isMinor": item["is_minor"],
                "docType": item["doc_type"],
                "docNumber": item["doc_number"],
                "passportExpiry": iso(item["passport_expiry"]),
            }
            for item in companions
        ],
        "notes": row["notes"] or [],
        "linkedRequests": [
            {
                "code": item["code"],
                "destination": item["destination"],
                "date": iso(item["start_date"]),
                "status": item["status"],
            }
            for item in linked
        ],
        "auditLog": audit_entries(db, "client", client_id),
    }


def validate_client(body: ClientInput) -> None:
    if not body.name.strip() or not body.phone.strip() or not body.doc_number.strip():
        raise HTTPException(status_code=422, detail="Revisa nombre, teléfono y documento.")
    if "@" not in body.email or "." not in body.email.rsplit("@", 1)[-1]:
        raise HTTPException(status_code=422, detail="Ingresa un correo válido.")
    for companion in body.companions:
        if companion.birth_date > date.today():
            raise HTTPException(status_code=422, detail="La fecha de nacimiento no puede ser futura.")


def save_companions(db: Session, client_id: str, body: ClientInput) -> None:
    execute(db, "DELETE FROM client_companions WHERE client_id = :id", id=client_id)
    for companion in body.companions:
        execute(
            db,
            """INSERT INTO client_companions
               (id, client_id, full_name, birth_date, is_minor, doc_type, doc_number, passport_expiry)
               VALUES (:id, :client_id, :full_name, :birth_date, :is_minor,
                       :doc_type, :doc_number, :passport_expiry)""",
            id=new_id(),
            client_id=client_id,
            full_name=companion.full_name.strip(),
            birth_date=companion.birth_date,
            is_minor=companion.is_minor,
            doc_type=companion.doc_type,
            doc_number=companion.doc_number.strip(),
            passport_expiry=companion.passport_expiry,
        )


@router.get("")
def list_clients(db: DB, actor: Annotated[dict, Depends(require_roles(*READ_ROLES))]):
    if actor["role"] == "Cliente":
        rows = execute(
            db, "SELECT * FROM client_records WHERE user_id = :id", id=actor["id"]
        ).mappings()
    else:
        rows = execute(db, "SELECT * FROM client_records ORDER BY created_at DESC").mappings()
    return [client_record(db, row) for row in rows]


@router.get("/directory")
def client_directory(
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Administrador", "Asesor", "Cliente"))],
):
    if actor["role"] == "Cliente":
        rows = execute(
            db,
            """SELECT c.id, c.name, c.email, c.phone, c.created_at, u.name AS created_by
               FROM client_records c LEFT JOIN users u ON u.id = c.user_id
               WHERE c.user_id = :id""",
            id=actor["id"],
        ).mappings()
    else:
        rows = execute(
            db,
            """SELECT c.id, c.name, c.email, c.phone, c.created_at, u.name AS created_by
               FROM client_records c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.name""",
        ).mappings()
    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"] or "",
            "createdAt": iso(row["created_at"]),
            "createdBy": row["created_by"] or "",
        }
        for row in rows
    ]


@router.get("/{client_id}")
def get_client(
    client_id: str,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*READ_ROLES))],
):
    row = execute(
        db, "SELECT * FROM client_records WHERE id = :id", id=client_id
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="El expediente no está disponible.")
    ensure_client_access(db, actor, client_id)
    return client_record(db, row)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_client(
    body: ClientInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Administrador", "Asesor"))],
):
    validate_client(body)
    client_id = new_id()
    try:
        row = execute(
            db,
            """INSERT INTO client_records
               (id, code, name, email, phone, type, segment, doc_type, doc_number,
                passport_number, passport_expiry, billing_address, tax_regime, notes)
               VALUES (:id, :code, :name, :email, :phone, :type, :segment, :doc_type,
                       :doc_number, :passport_number, :passport_expiry,
                       :billing_address, :tax_regime, CAST(:notes AS jsonb))
               RETURNING *""",
            id=client_id,
            code=code(db, "EXP"),
            name=body.name.strip(),
            email=body.email.strip().lower(),
            phone=body.phone.strip(),
            type=body.type,
            segment=body.segment,
            doc_type=body.doc_type,
            doc_number=body.doc_number.strip(),
            passport_number=body.passport_number,
            passport_expiry=body.passport_expiry,
            billing_address=body.billing_address,
            tax_regime=body.tax_regime,
            notes=json.dumps(body.notes, ensure_ascii=False),
        ).mappings().one()
        save_companions(db, client_id, body)
        audit(db, "client", client_id, "Expediente creado", actor)
        db.commit()
        return client_record(db, row)
    except IntegrityError as error:
        db.rollback()
        fail_integrity(error)


@router.put("/{client_id}")
def update_client(
    client_id: str,
    body: ClientInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles(*EDIT_ROLES))],
    reason: str | None = None,
):
    validate_client(body)
    previous = execute(
        db, "SELECT * FROM client_records WHERE id = :id", id=client_id
    ).mappings().first()
    if not previous:
        raise HTTPException(status_code=404, detail="El expediente no está disponible.")
    ensure_client_access(db, actor, client_id)
    if actor["role"] == "Cliente" and body.email.strip().lower() != previous["email"].lower():
        raise HTTPException(status_code=403, detail="No puedes cambiar el correo vinculado a tu cuenta.")
    try:
        row = execute(
            db,
            """UPDATE client_records SET name = :name, email = :email, phone = :phone,
                 type = :type, segment = :segment, doc_type = :doc_type, doc_number = :doc_number,
                 passport_number = :passport_number, passport_expiry = :passport_expiry,
                 billing_address = :billing_address, tax_regime = :tax_regime,
                 notes = CAST(:notes AS jsonb)
               WHERE id = :id RETURNING *""",
            id=client_id,
            name=body.name.strip(),
            email=body.email.strip().lower(),
            phone=body.phone.strip(),
            type=body.type,
            segment=body.segment,
            doc_type=body.doc_type,
            doc_number=body.doc_number.strip(),
            passport_number=body.passport_number,
            passport_expiry=body.passport_expiry,
            billing_address=body.billing_address,
            tax_regime=body.tax_regime,
            notes=json.dumps(body.notes, ensure_ascii=False),
        ).mappings().one()
        save_companions(db, client_id, body)
        audit(db, "client", client_id, "Expediente y viajeros actualizados", actor, reason)
        db.commit()
        return client_record(db, row)
    except IntegrityError as error:
        db.rollback()
        fail_integrity(error)
