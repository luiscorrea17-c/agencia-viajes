from typing import Any

from supabase import Client, create_client
from supabase_auth.errors import AuthApiError

from app.core.config import (
    SUPABASE_ANON_KEY,
    SUPABASE_ADMIN_EMAILS,
    SUPABASE_URL,
)
from app.core.database import _get_client


ROLES = {"Administrador", "Asesor", "Contabilidad", "Cliente"}


def is_api_key_error(error: AuthApiError) -> bool:
    message = str(error).lower()
    return "invalid api key" in message or "invalid jwt" in message or "api key" in message


def sign_in(email: str, password: str) -> Any:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError(
            "Configura SUPABASE_URL y SUPABASE_ANON_KEY en backend/.env."
        )
    auth_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return auth_client.auth.sign_in_with_password(
        {"email": email.strip().lower(), "password": password}
    )


def get_auth_user(access_token: str) -> Any | None:
    return _get_client().auth.get_user(access_token).user


def list_auth_users() -> list[Any]:
    users = []
    page = 1
    page_size = 100
    while True:
        batch = _get_client().auth.admin.list_users(page=page, per_page=page_size)
        users.extend(batch)
        if len(batch) < page_size:
            return users
        page += 1


def create_auth_user(
    *,
    name: str,
    email: str,
    password: str,
    role: str,
    branch: str,
) -> Any:
    return _get_client().auth.admin.create_user(
        {
            "email": email.strip().lower(),
            "password": password,
            "email_confirm": True,
            "user_metadata": {"name": name.strip(), "branch": branch.strip()},
            "app_metadata": {"role": role, "active": True},
        }
    ).user


def update_auth_user(
    user_id: str,
    *,
    name: str,
    email: str,
    role: str,
    branch: str,
    password: str | None = None,
) -> Any:
    previous = _get_client().auth.admin.get_user_by_id(user_id).user
    attributes: dict[str, Any] = {
        "email": email.strip().lower(),
        "email_confirm": True,
        "user_metadata": {
            **(previous.user_metadata or {}),
            "name": name.strip(),
            "branch": branch.strip(),
        },
        "app_metadata": {**(previous.app_metadata or {}), "role": role},
    }
    if password:
        attributes["password"] = password
    return _get_client().auth.admin.update_user_by_id(user_id, attributes).user


def set_auth_user_active(user_id: str, active: bool) -> Any:
    previous = _get_client().auth.admin.get_user_by_id(user_id).user
    attributes = {
        "app_metadata": {**(previous.app_metadata or {}), "active": active},
    }
    return _get_client().auth.admin.update_user_by_id(user_id, attributes).user


def delete_auth_user(user_id: str) -> None:
    _get_client().auth.admin.delete_user(user_id)


def profile_for(auth_user: Any) -> dict[str, Any]:
    app_metadata = auth_user.app_metadata or {}
    user_metadata = auth_user.user_metadata or {}
    email = auth_user.email or ""
    role = app_metadata.get("role")
    if not role and email.lower() in SUPABASE_ADMIN_EMAILS:
        role = "Administrador"
    if not isinstance(role, str) or role not in ROLES:
        role = "Cliente"
    name_value = (
        user_metadata.get("name")
        or user_metadata.get("full_name")
        or (email.split("@", 1)[0] if email else "Usuario")
    )
    name = name_value if isinstance(name_value, str) else "Usuario"
    avatar_value = user_metadata.get("avatarUrl") or user_metadata.get("avatar_url")
    avatar_url = avatar_value if isinstance(avatar_value, str) else None
    branch = user_metadata.get("branch")
    return {
        "id": auth_user.id,
        "name": name,
        "email": email,
        "role": role,
        "avatarUrl": avatar_url
        or f"https://api.dicebear.com/9.x/initials/svg?seed={name.replace(' ', '%20')}",
        "branch": branch if isinstance(branch, str) else "",
        "active": app_metadata.get("active", True) is not False
        and auth_user.banned_until is None,
    }


def auth_client() -> Client:
    return _get_client()
