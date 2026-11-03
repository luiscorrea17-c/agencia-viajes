from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.common import public_user
from app.database import execute, get_db
from app.routers.bookings import booking_record, payment_record
from app.routers.quotes import quote_record
from app.routers.requests import request_record
from app.security import CurrentUser


router = APIRouter(prefix="/api/dashboard")
DB = Annotated[Session, Depends(get_db)]


@router.get("")
def dashboard(db: DB, actor: CurrentUser):
    role = actor["role"]
    requests = []
    bookings = []
    payments = []
    users = []
    if role in ("Administrador", "Asesor"):
        request_rows = execute(db, "SELECT * FROM travel_requests ORDER BY created_at DESC").mappings()
    elif role == "Cliente":
        request_rows = execute(
            db,
            """SELECT r.* FROM travel_requests r
               JOIN client_records c ON c.id = r.client_id
               WHERE c.user_id = :id ORDER BY r.created_at DESC""",
            id=actor["id"],
        ).mappings()
    else:
        request_rows = []
    requests = [request_record(db, row) for row in request_rows]

    if role == "Cliente":
        quote_rows = execute(
            db,
            """SELECT q.* FROM quotes q
               JOIN travel_requests r ON r.id = q.request_id
               JOIN client_records c ON c.id = r.client_id
               WHERE c.user_id = :id AND q.status <> 'Borrador'
               ORDER BY q.created_at DESC""",
            id=actor["id"],
        ).mappings()
    elif role in ("Administrador", "Asesor"):
        quote_rows = execute(db, "SELECT * FROM quotes ORDER BY created_at DESC").mappings()
    else:
        quote_rows = []
    quotes = [quote_record(db, row) for row in quote_rows]

    if role in ("Administrador", "Asesor"):
        booking_rows = execute(db, "SELECT * FROM bookings ORDER BY created_at DESC").mappings()
    elif role == "Cliente":
        booking_rows = execute(
            db,
            """SELECT b.* FROM bookings b JOIN client_records c ON c.id = b.client_id
               WHERE c.user_id = :id ORDER BY b.created_at DESC""",
            id=actor["id"],
        ).mappings()
    else:
        booking_rows = []
    bookings = [booking_record(db, row) for row in booking_rows]

    if role in ("Administrador", "Contabilidad"):
        payment_rows = execute(db, "SELECT * FROM payments ORDER BY created_at DESC").mappings()
    elif role == "Cliente":
        payment_rows = execute(
            db,
            """SELECT p.* FROM payments p JOIN client_records c ON c.id = p.client_id
               WHERE c.user_id = :id ORDER BY p.created_at DESC""",
            id=actor["id"],
        ).mappings()
    else:
        payment_rows = []
    payments = [payment_record(db, row) for row in payment_rows]
    if role == "Administrador":
        users = [
            public_user(dict(row))
            for row in execute(
                db,
                """SELECT id, name, email, role, branch, avatar_url, active
                   FROM users ORDER BY name""",
            ).mappings()
        ]
    return {
        "requests": requests,
        "quotes": quotes,
        "bookings": bookings,
        "payments": payments,
        "users": users,
    }
