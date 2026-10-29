from datetime import date
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_record, list_records, save_record
from app.core.security import current_user
from app.schemas.contracts import ClientInput
from app.services.common import audit_entry, next_code, now_iso

router = APIRouter(prefix="/clients", tags=["Expedientes"])
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _validate(data: ClientInput) -> None:
    if not data.name.strip() or not data.phone.strip() or not data.docNumber.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa el nombre, correo, teléfono y documento.")
    if not EMAIL_RE.fullmatch(data.email.strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa el nombre, correo, teléfono y documento.")
    if data.passportExpiry:
        try:
            date.fromisoformat(data.passportExpiry)
        except ValueError as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa el vencimiento del pasaporte.") from error
    today = date.today()
    companion_ids: set[str] = set()
    for companion in data.companions:
        try:
            birth_date = date.fromisoformat(companion.birthDate)
            if companion.passportExpiry:
                date.fromisoformat(companion.passportExpiry)
        except ValueError as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa los datos de los viajeros.") from error
        if (
            companion.id in companion_ids
            or birth_date > today
            or not companion.fullName.strip()
            or not companion.docNumber.strip()
        ):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa los datos de los viajeros.")
        companion_ids.add(companion.id)


def _visible(actor: dict, client: dict) -> bool:
    return actor["role"] != "Cliente" or actor["id"] == client["id"]


@router.get("")
def list_clients(actor: dict = Depends(current_user)):
    if actor["role"] not in {"Administrador", "Asesor", "Contabilidad", "Cliente"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para acceder a los expedientes.")
    return [client for client in list_records("clients") if _visible(actor, client)]


@router.get("/{client_id}")
def get_client(client_id: str, actor: dict = Depends(current_user)):
    client = get_record("clients", client_id)
    if not client or not _visible(actor, client):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El expediente no está disponible.")
    return client


@router.post("")
def create_client(data: ClientInput, actor: dict = Depends(current_user)):
    if actor["role"] not in {"Administrador", "Asesor"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo Administrador o Asesor pueden registrar nuevos clientes.")
    _validate(data)
    email = data.email.strip().lower()
    if any(record["email"].lower() == email for record in list_records("clients")):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un expediente con ese correo electrónico.")
    code, _ = next_code("clients", "EXP")
    client_id = f"c-{uuid4()}"
    created = {
        **data.model_dump(exclude_none=True),
        "id": client_id,
        "code": code,
        "name": data.name.strip(),
        "email": email,
        "phone": data.phone.strip(),
        "linkedRequests": [],
        "auditLog": [audit_entry(actor["name"], "Expediente creado")],
    }
    save_record("clients", created)
    return created


@router.put("/{client_id}")
def update_client(
    client_id: str,
    data: ClientInput,
    reason: str | None = None,
    actor: dict = Depends(current_user),
):
    previous = get_record("clients", client_id)
    if not previous or not _visible(actor, previous):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El expediente no está disponible.")
    if actor["role"] == "Contabilidad" or (actor["role"] not in {"Administrador", "Asesor", "Cliente"}):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tu rol solo permite consultar expedientes.")
    if actor["role"] == "Cliente" and actor["id"] != client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes modificar expedientes de otros clientes.")
    _validate(data)
    if any(
        client["id"] != client_id and client["email"].lower() == data.email.strip().lower()
        for client in list_records("clients")
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un expediente con ese correo electrónico.")
    updated = {
        **previous,
        **data.model_dump(exclude_none=True),
        "id": client_id,
        "code": previous["code"],
        "name": data.name.strip(),
        "email": data.email.strip(),
        "phone": data.phone.strip(),
        "auditLog": [
            *previous.get("auditLog", []),
            audit_entry(
                actor["name"],
                "Expediente y viajeros actualizados",
                reason.strip() if reason and reason.strip() else None,
            ),
        ],
    }
    save_record("clients", updated)
    return updated
