import re
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_record, list_records, save_record
from app.core.security import current_user
from app.schemas.contracts import QuoteDraftInput
from app.services.common import audit_entry, next_code, now_iso, sync_request_status

router = APIRouter(prefix="/quotes", tags=["Cotizaciones"])
MAX_DISCOUNT_WITHOUT_APPROVAL = 10
CLIENT_STATUSES = {"Enviada", "Aprobada", "Rechazada", "Expirada"}
CATEGORIES = ["Vuelos", "Alojamiento", "Traslados", "Actividades", "Asistencia"]


def _staff(actor: dict) -> bool:
    return actor["role"] in {"Administrador", "Asesor", "Contabilidad"}


def _authorize(actor: dict) -> None:
    if actor["role"] not in {"Administrador", "Asesor", "Contabilidad", "Cliente"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para acceder a las cotizaciones.")


def _visible(actor: dict, quote: dict) -> bool:
    return _staff(actor) or (
        quote["clientEmail"] == actor["email"] and quote["status"] in CLIENT_STATUSES
    )


def _find(actor: dict, quote_id: str) -> dict:
    for quote in list_records("quotes"):
        if quote["status"] == "Enviada" and quote["validUntil"] < date.today().isoformat():
            quote["status"] = "Expirada"
            save_record("quotes", quote)
        if quote["id"] == quote_id and _visible(actor, quote):
            return quote
    raise HTTPException(status.HTTP_404_NOT_FOUND, "La cotización no está disponible.")


def _stamp(actor: dict, note: str) -> str:
    return f"{datetime.now().strftime('%d/%m/%Y')} · {actor['name']}: {note}"


def _commit(actor: dict, quote: dict, note: str) -> dict:
    updated = {
        **quote,
        "advisorDecisionLog": "\n".join(filter(None, [quote.get("advisorDecisionLog", ""), _stamp(actor, note)])),
        "updatedBy": actor["name"],
        "updatedAt": now_iso(),
    }
    save_record("quotes", updated)
    return updated


def _totals(items: list[dict], surcharge: float, discount: float) -> dict:
    base = sum(item["quantity"] * item["unitPriceCOP"] for item in items)
    surcharge_amount = round(base * surcharge / 100)
    discount_amount = round((base + surcharge_amount) * discount / 100)
    return {
        "basePriceCOP": base,
        "seasonSurchargeCOP": surcharge_amount,
        "discountCOP": discount_amount,
        "totalCOP": base + surcharge_amount - discount_amount,
        "requiresAdminApproval": discount > MAX_DISCOUNT_WITHOUT_APPROVAL,
    }


def _ai_quote_items(destination: str, travelers: int, nights: int, budget: float, notes: str) -> list[dict]:
    premium = re.search(r"boutique|5 estrellas|lujo|frente al mar|comunicad", notes, re.I) is not None
    weights = (0.34, 0.42, 0.08, 0.10, 0.06) if premium else (0.38, 0.36, 0.08, 0.12, 0.06)
    hotel = (
        f"Hotel en {destination} con habitaciones comunicadas y desayuno ({nights} noches)"
        if re.search("comunicad", notes, re.I)
        else f"Hotel cerca del centro histórico en {destination} con desayuno"
        if re.search("centro hist", notes, re.I)
        else f"Hotel seleccionado en {destination} con desayuno incluido"
    )
    descriptions = [
        f"Tiquete ida y regreso Bogotá – {destination}, tarifa con equipaje",
        hotel,
        "Traslado privado aeropuerto – hotel – aeropuerto",
        f"Recorrido guiado y experiencia local en {destination}",
        "Asistencia médica integral durante el viaje",
    ]
    quantities = [travelers, nights, 1, travelers, travelers]
    return [
        {
            "id": f"i-{uuid4()}",
            "category": category,
            "description": description,
            "quantity": quantity,
            "unitPriceCOP": max(25000, round((budget * weight / quantity) / 5000) * 5000),
            "isAiGenerated": True,
            "editedByAdvisor": False,
        }
        for category, description, quantity, weight in zip(CATEGORIES, descriptions, quantities, weights)
    ]


@router.get("")
def list_quotes(actor: dict = Depends(current_user)):
    _authorize(actor)
    result = []
    today = date.today().isoformat()
    for quote in list_records("quotes"):
        if quote["status"] == "Enviada" and quote["validUntil"] < today:
            quote["status"] = "Expirada"
            save_record("quotes", quote)
        if _visible(actor, quote):
            result.append(quote)
    return result


@router.post("/from-request/{request_id}")
def create_quote_from_request(request_id: str, actor: dict = Depends(current_user)):
    _authorize(actor)
    if actor["role"] != "Asesor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo un Asesor puede crear cotizaciones.")
    request = get_record("requests", request_id)
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La solicitud no está disponible.")
    existing = [quote for quote in list_records("quotes") if quote["requestId"] == request_id]
    if any(quote["status"] in {"Borrador", "Enviada", "Aprobada"} for quote in existing):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta solicitud ya tiene una cotización activa.")
    if request["status"] == "Cerrada":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La solicitud está cerrada.")
    start = date.fromisoformat(request["startDate"])
    end = date.fromisoformat(request["endDate"])
    nights = max(1, (end - start).days)
    code, _ = next_code("quotes", "COT")
    client_notes = request.get("notes", "")
    description = (
        f"Propuesta de {nights} {'noche' if nights == 1 else 'noches'} en {request['destination']} "
        f"para {request['travelersCount']} {'viajero' if request['travelersCount'] == 1 else 'viajeros'}, "
        "con distribución equilibrada de vuelos, alojamiento con desayuno, traslados, actividad guiada y asistencia."
    )
    if client_notes.strip():
        description += f" Incluye preferencias solicitadas: {client_notes.strip().rstrip('.')}."
    quote = {
        "id": f"q-{uuid4()}",
        "code": code,
        "requestId": request_id,
        "requestBudgetCOP": request["budgetCOP"],
        "version": len(existing) + 1,
        "clientName": request["clientName"],
        "clientEmail": request["clientEmail"],
        "destination": request["destination"],
        "commercialDescription": description,
        "isDescriptionAiGenerated": True,
        "items": _ai_quote_items(request["destination"], request["travelersCount"], nights, request["budgetCOP"], client_notes),
        "seasonSurchargePercent": 0,
        "discountPercent": 0,
        "adminApprovedBy": None,
        "validUntil": (date.today() + timedelta(days=15)).isoformat(),
        "status": "Borrador",
        "advisorDecisionLog": "",
        "updatedBy": actor["name"],
        "updatedAt": now_iso(),
    }
    quote.update(_totals(quote["items"], 0, 0))
    save_record("quotes", quote)
    sync_request_status(request_id, "En cotización", actor["name"], f"En cotización ({code})")
    return _commit(
        actor,
        quote,
        f"Nueva versión v{quote['version']} generada con distribución de presupuesto IA."
        if quote["version"] > 1
        else "Borrador creado con distribución de presupuesto IA.",
    )


@router.put("/{quote_id}/draft")
def save_quote_draft(quote_id: str, data: QuoteDraftInput, actor: dict = Depends(current_user)):
    _authorize(actor)
    quote = _find(actor, quote_id)
    if actor["role"] != "Asesor" or quote["status"] != "Borrador":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el Asesor puede editar cotizaciones en borrador.")
    if not data.commercialDescription.strip() or not data.items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ingresa la descripción comercial y agrega al menos un servicio.")
    for item in data.items:
        if not item.description.strip() or item.quantity < 1 or item.unitPriceCOP <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa cantidades, descripciones y precios de los servicios.")
    if not 0 <= data.seasonSurchargePercent <= 100 or not 0 <= data.discountPercent <= 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El recargo y el descuento deben estar entre 0 % y 100 %.")
    try:
        valid_until = date.fromisoformat(data.validUntil)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa la fecha de vigencia.") from error
    if valid_until < date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La vigencia debe ser una fecha futura.")
    totals = _totals([item.model_dump() for item in data.items], data.seasonSurchargePercent, data.discountPercent)
    updated = {
        **quote,
        "commercialDescription": data.commercialDescription.strip(),
        "isDescriptionAiGenerated": data.isDescriptionAiGenerated,
        "items": [item.model_dump() for item in data.items],
        "seasonSurchargePercent": data.seasonSurchargePercent,
        "discountPercent": data.discountPercent,
        "validUntil": data.validUntil,
        **totals,
    }
    if data.discountPercent != quote["discountPercent"] or not totals["requiresAdminApproval"]:
        updated.pop("adminApprovedBy", None)
    return _commit(actor, updated, data.decisionNote.strip() or "Borrador actualizado.")


@router.post("/{quote_id}/approve-discount")
def approve_discount(quote_id: str, actor: dict = Depends(current_user)):
    _authorize(actor)
    quote = _find(actor, quote_id)
    if (
        actor["role"] != "Administrador"
        or quote["status"] != "Borrador"
        or not quote["requiresAdminApproval"]
        or quote.get("adminApprovedBy")
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el Administrador puede aprobar este descuento.")
    quote["adminApprovedBy"] = actor["name"]
    return _commit(actor, quote, f"Descuento del {quote['discountPercent']} % aprobado.")


@router.post("/{quote_id}/send")
def send_quote(quote_id: str, actor: dict = Depends(current_user)):
    _authorize(actor)
    quote = _find(actor, quote_id)
    if actor["role"] != "Asesor" or quote["status"] != "Borrador":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el Asesor puede enviar cotizaciones en borrador.")
    if quote["requiresAdminApproval"] and not quote.get("adminApprovedBy"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Descuentos mayores al {MAX_DISCOUNT_WITHOUT_APPROVAL} % requieren aprobación del Administrador.")
    if quote["validUntil"] < date.today().isoformat():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La vigencia ya venció. Actualízala antes de enviar.")
    return _commit(actor, {**quote, "status": "Enviada"}, "Cotización enviada al cliente.")


@router.post("/{quote_id}/respond")
def respond_quote(quote_id: str, body: dict[str, str], actor: dict = Depends(current_user)):
    _authorize(actor)
    quote = _find(actor, quote_id)
    decision = body.get("decision")
    if (
        actor["role"] != "Cliente"
        or quote["status"] != "Enviada"
        or quote["clientEmail"] != actor["email"]
        or decision not in {"Aprobada", "Rechazada"}
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esta cotización ya no admite respuesta.")
    return _commit(
        actor,
        {**quote, "status": decision},
        "Cliente aprobó la cotización." if decision == "Aprobada" else "Cliente rechazó la cotización.",
    )
