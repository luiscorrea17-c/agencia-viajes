import json
import re
from urllib.parse import quote
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import execute


def new_id() -> str:
    return str(uuid.uuid4())


def iso(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def mapping(row) -> dict:
    return {key: iso(value) for key, value in dict(row).items()}


def public_user(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "avatarUrl": row.get("avatar_url") or (
            "https://api.dicebear.com/9.x/initials/svg?seed="
            + quote(row["name"])
        ),
        "branch": row.get("branch") or "",
        "active": row["active"],
    }


def code(db: Session, prefix: str) -> str:
    return execute(db, "SELECT next_code(:prefix) AS value", prefix=prefix).scalar_one()


def audit(
    db: Session,
    entity_type: str,
    entity_id: str,
    action: str,
    actor: dict,
    reason: str | None = None,
) -> None:
    execute(
        db,
        """INSERT INTO audit_logs (entity_type, entity_id, action, reason, user_id, user_name)
           VALUES (:entity_type, :entity_id, :action, :reason, :user_id, :user_name)""",
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        reason=reason,
        user_id=actor["id"],
        user_name=actor["name"],
    )


def audit_entries(db: Session, entity_type: str, entity_id: str) -> list[dict]:
    rows = execute(
        db,
        """SELECT id, action, reason, user_name, created_at
           FROM audit_logs WHERE entity_type = :type AND entity_id = :id
           ORDER BY created_at, id""",
        type=entity_type,
        id=entity_id,
    ).mappings()
    return [
        {
            "id": str(row["id"]),
            "action": row["action"],
            "reason": row["reason"],
            "user": row["user_name"],
            "timestamp": iso(row["created_at"]),
        }
        for row in rows
    ]


def client_for_user(db: Session, user_id: str):
    return execute(
        db, "SELECT * FROM client_records WHERE user_id = :id", id=user_id
    ).mappings().first()


def ensure_client_access(db: Session, actor: dict, client_id: str) -> None:
    if actor["role"] == "Cliente":
        owner = execute(
            db,
            "SELECT 1 FROM client_records WHERE id = :client_id AND user_id = :user_id",
            client_id=client_id,
            user_id=actor["id"],
        ).first()
        if not owner:
            raise HTTPException(status_code=404, detail="El registro no está disponible.")


def fail_integrity(error: IntegrityError) -> None:
    message = str(error.orig).lower()
    if "unique" in message or "duplicate key" in message:
        raise HTTPException(
            status_code=409, detail="El registro ya existe o entra en conflicto."
        ) from error
    raise HTTPException(status_code=422, detail="Los datos no cumplen las reglas de la base.") from error


def camel_dict(row: dict) -> dict:
    def camel(key: str) -> str:
        return re.sub(r"_([a-z])", lambda match: match.group(1).upper(), key)

    return {camel(key): iso(value) for key, value in row.items()}


def json_parameter(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
