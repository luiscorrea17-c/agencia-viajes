import re
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from supabase_auth.errors import AuthApiError

from app.core.security import require_roles
from app.core.supabase_auth import (
    create_auth_user,
    is_api_key_error,
    list_auth_users,
    profile_for,
    set_auth_user_active,
    update_auth_user,
)
from app.schemas.contracts import UserInput

router = APIRouter(prefix="/users", tags=["Usuarios"])
admin = Depends(require_roles("Administrador"))
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ROLES = {"Administrador", "Asesor", "Contabilidad", "Cliente"}


def _validate(data: UserInput) -> None:
    if (
        not data.name.strip()
        or not data.branch.strip()
        or not EMAIL_RE.fullmatch(data.email.strip())
        or data.role not in ROLES
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Revisa nombre, correo, sede y rol.")
    if data.password is not None and len(data.password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña debe tener al menos 8 caracteres.")


def _raise_auth_error(error: AuthApiError) -> NoReturn:
    if is_api_key_error(error):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Supabase rechazó SUPABASE_SERVICE_ROLE_KEY. Revisa la clave de servidor en backend/.env.",
        ) from error
    message = str(error)
    if error.status in {400, 422}:
        if any(phrase in message.lower() for phrase in ("already registered", "already exists", "duplicate")):
            raise HTTPException(status.HTTP_409_CONFLICT, "Este correo ya está registrado.") from error
        raise HTTPException(status.HTTP_400_BAD_REQUEST, message) from error
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Supabase Auth no pudo completar la operación.",
    ) from error


@router.get("")
def list_users(actor: dict = admin):
    try:
        return [profile_for(user) for user in list_auth_users()]
    except AuthApiError as error:
        _raise_auth_error(error)


@router.post("")
def create_user(data: UserInput, actor: dict = admin):
    _validate(data)
    if not data.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña debe tener al menos 8 caracteres.")
    try:
        user = create_auth_user(
            name=data.name,
            email=data.email,
            password=data.password,
            role=data.role,
            branch=data.branch,
        )
    except AuthApiError as error:
        _raise_auth_error(error)
    return profile_for(user)


@router.put("/{user_id}")
def update_user(user_id: str, data: UserInput, actor: dict = admin):
    _validate(data)
    if user_id == actor["id"] and data.role != "Administrador":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes quitarte el acceso de Administrador.")
    try:
        user = update_auth_user(
            user_id,
            name=data.name,
            email=data.email,
            role=data.role,
            branch=data.branch,
            password=data.password,
        )
    except AuthApiError as error:
        _raise_auth_error(error)
    return profile_for(user)


@router.patch("/{user_id}/active")
def set_user_active(user_id: str, body: dict[str, bool], actor: dict = admin):
    active = body.get("active")
    if not isinstance(active, bool):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Indica el estado activo.")
    if user_id == actor["id"] and not active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes desactivar tu propia cuenta.")
    try:
        user = set_auth_user_active(user_id, active)
    except AuthApiError as error:
        _raise_auth_error(error)
    return profile_for(user)
