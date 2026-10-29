from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_record, list_records, save_record
from app.core.security import current_user
from app.schemas.contracts import RequestInput
from app.services.common import audit_entry, next_code, now_iso, save_linked_request, thumbnail_for

router = APIRouter(prefix="/requests", tags=["Solicitudes"])


def _visible(actor: dict, request: dict) -> bool:
    return actor["role"] != "Cliente" or actor["id"] == request["clientId"]


def _authorize(actor: dict) -> None:
    if actor["role"] not in {"Administrador", "Asesor", "Cliente"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para acceder a las solicitudes.")


def _validate(data: RequestInput, actor: dict) -> dict:
    client = get_record("clients", data.clientId)
    if not client or (actor["role"] == "Cliente" and actor["id"] != client["id"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selecciona un cliente válido.")
    try:
        start = date.fromisoformat(data.startDate)
        end = date.fromisoformat(data.endDate)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa las fechas del viaje.") from error
    if not data.destination.strip() or end < start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa el destino y las fechas del viaje.")
    if data.budgetCOP <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El presupuesto debe ser mayor a cero.")
    if data.travelersCount < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ingresa al menos un viajero.")
    return client


@router.get("/clients")
def list_request_clients(actor: dict = Depends(current_user)):
    _authorize(actor)
    clients = list_records("clients")
    return [
        {
            "id": client["id"],
            "name": client["name"],
            "email": client["email"],
            "phone": client["phone"],
            "createdAt": client.get("auditLog", [{}])[0].get("timestamp", ""),
            "createdBy": client.get("auditLog", [{}])[0].get("user", ""),
        }
        for client in clients
        if actor["role"] != "Cliente" or actor["id"] == client["id"]
    ]


@router.get("")
def list_requests(actor: dict = Depends(current_user)):
    _authorize(actor)
    return [request for request in list_records("requests") if _visible(actor, request)]


@router.get("/{request_id}")
def get_request(request_id: str, actor: dict = Depends(current_user)):
    _authorize(actor)
    request = get_record("requests", request_id)
    if not request or not _visible(actor, request):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La solicitud no está disponible.")
    return request


@router.post("")
def create_request(data: RequestInput, actor: dict = Depends(current_user)):
    _authorize(actor)
    client = _validate(data, actor)
    code, _ = next_code("requests", "SOL")
    timestamp = now_iso()
    request_id = f"r-{uuid4()}"
    created = {
        **data.model_dump(),
        "id": request_id,
        "code": code,
        "clientName": client["name"],
        "clientEmail": client["email"],
        "clientPhone": client["phone"],
        "destination": data.destination.strip(),
        "thumbnailUrl": thumbnail_for(data.destination),
        "status": "Abierta",
        "createdBy": actor["name"],
        "createdAt": timestamp,
        "updatedBy": actor["name"],
        "updatedAt": timestamp,
        "history": [audit_entry(actor["name"], "Solicitud creada")],
    }
    save_record("requests", created)
    save_linked_request(
        created["clientId"],
        {"code": code, "destination": created["destination"], "date": created["startDate"], "status": "Abierta"},
    )
    return created


@router.put("/{request_id}")
def update_request(request_id: str, data: RequestInput, actor: dict = Depends(current_user)):
    _authorize(actor)
    previous = get_record("requests", request_id)
    if not previous or not _visible(actor, previous):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La solicitud no está disponible.")
    client = _validate(data, actor)
    timestamp = now_iso()
    next_status = previous["status"] if actor["role"] == "Cliente" else data.status
    action = (
        f"Estado cambiado a {next_status}"
        if next_status != previous["status"]
        else "Solicitud actualizada"
    )
    updated = {
        **previous,
        **data.model_dump(),
        "status": next_status,
        "destination": data.destination.strip(),
        "clientName": client["name"],
        "clientEmail": client["email"],
        "clientPhone": client["phone"],
        "updatedBy": actor["name"],
        "updatedAt": timestamp,
        "history": [*previous.get("history", []), audit_entry(actor["name"], action)],
    }
    save_record("requests", updated)
    save_linked_request(
        updated["clientId"],
        {"code": updated["code"], "destination": updated["destination"], "date": updated["startDate"], "status": updated["status"]},
    )
    return updated
