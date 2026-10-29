import base64
import hashlib
import hmac
import secrets
from typing import Any, NoReturn

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_auth.errors import AuthApiError

from app.core.supabase_auth import get_auth_user, is_api_key_error, profile_for


bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"{base64.urlsafe_b64encode(salt).decode()}:{base64.urlsafe_b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt_text, expected = encoded.split(":", 1)
        salt = base64.urlsafe_b64decode(salt_text)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
        return hmac.compare_digest(base64.urlsafe_b64encode(digest).decode(), expected)
    except (ValueError, TypeError):
        return False


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inicia sesión para continuar.")
    try:
        auth_user = get_auth_user(credentials.credentials)
    except AuthApiError as error:
        if is_api_key_error(error):
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Supabase rechazó SUPABASE_SERVICE_ROLE_KEY. Revisa la clave de servidor en backend/.env.",
            ) from error
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "La sesión no es válida o ha expirado."
        ) from error
    if not auth_user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La sesión no es válida o ha expirado.")
    user = profile_for(auth_user)
    if not user["active"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La sesión no es válida o el usuario está inactivo.")
    return user


def require_roles(*roles: str):
    def dependency(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        if user["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción.")
        return user

    return dependency
