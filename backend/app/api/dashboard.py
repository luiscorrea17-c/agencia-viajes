from fastapi import APIRouter, Depends

from app.core.database import list_records
from app.core.security import current_user

router = APIRouter(prefix="/dashboard", tags=["Inicio"])


@router.get("")
def dashboard(actor: dict = Depends(current_user)):
    role = actor["role"]
    requests = list_records("requests") if role in {"Administrador", "Asesor", "Cliente"} else []
    quotes = list_records("quotes")
    bookings = list_records("bookings") if role in {"Administrador", "Asesor", "Cliente"} else []
    payments = list_records("payments") if role in {"Administrador", "Contabilidad", "Cliente"} else []
    users = list_records("users") if role == "Administrador" else []
    if role == "Cliente":
        requests = [item for item in requests if item["clientId"] == actor["id"]]
        quotes = [item for item in quotes if item["clientEmail"] == actor["email"] and item["status"] in {"Enviada", "Aprobada", "Rechazada", "Expirada"}]
        bookings = [item for item in bookings if item["clientId"] == actor["id"]]
        payments = [item for item in payments if item["clientId"] == actor["id"]]
    return {
        "requests": requests,
        "quotes": quotes,
        "bookings": bookings,
        "payments": payments,
        "users": users,
    }
