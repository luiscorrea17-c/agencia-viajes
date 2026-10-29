import time

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from supabase_auth.errors import AuthApiError

from app.core.security import current_user, bearer
from app.core.supabase_auth import auth_client, is_api_key_error, profile_for, sign_in
from app.schemas.contracts import LoginInput

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login")
def login(data: LoginInput):
    try:
        response = sign_in(data.email, data.password)
    except AuthApiError as error:
        if is_api_key_error(error):
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Supabase rechazó SUPABASE_ANON_KEY. Copia la clave API correcta del proyecto en backend/.env y reinicia FastAPI.",
            ) from error
        if error.status in {400, 401}:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Correo o contraseña incorrectos, o la cuenta no está confirmada.",
            ) from error
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Supabase Auth no pudo procesar el inicio de sesión.",
        ) from error
    if not response.user or not response.session:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Supabase no devolvió una sesión válida."
        )
    user = profile_for(response.user)
    if not user["active"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tu usuario está inactivo. Contacta al administrador.")
    return {
        "user": user,
        "token": response.session.access_token,
        "expiresAt": (
            response.session.expires_at
            or int(time.time()) + response.session.expires_in
        )
        * 1000,
    }


@router.post("/logout")
def logout(
    _: dict = Depends(current_user),
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
):
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inicia sesión para continuar.")
    try:
        auth_client().auth.admin.sign_out(credentials.credentials, scope="local")
    except AuthApiError as error:
        if is_api_key_error(error):
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Supabase rechazó SUPABASE_SERVICE_ROLE_KEY. Revisa la clave de servidor en backend/.env.",
            ) from error
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "No fue posible cerrar la sesión de Supabase."
        ) from error
    return {"ok": True}
