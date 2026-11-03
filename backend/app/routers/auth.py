from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common import fail_integrity, public_user
from app.database import execute, get_db
from app.schemas import ActiveInput, LoginInput, UserInput
from app.security import (
    CurrentUser,
    create_access_token,
    hash_password,
    require_roles,
    verify_password,
)


router = APIRouter(prefix="/api")
DB = Annotated[Session, Depends(get_db)]


@router.post("/auth/login")
def login(body: LoginInput, db: DB):
    row = execute(
        db,
        """SELECT id, name, email, password_hash, role, branch, avatar_url, active
           FROM users WHERE lower(email) = lower(:email)""",
        email=body.email.strip(),
    ).mappings().first()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")
    if not row["active"]:
        raise HTTPException(
            status_code=403, detail="Tu usuario está inactivo. Contacta al administrador."
        )
    token, expires_at = create_access_token(str(row["id"]))
    return {
        "user": public_user(dict(row)),
        "token": token,
        "expiresAt": int(expires_at.timestamp() * 1000),
    }


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(_: CurrentUser):
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/auth/me")
def current_session(user: CurrentUser):
    return public_user(user)


@router.get("/users")
def list_users(
    db: DB,
    _: Annotated[dict, Depends(require_roles("Administrador"))],
):
    rows = execute(
        db,
        """SELECT id, name, email, role, branch, avatar_url, active
           FROM users ORDER BY name""",
    ).mappings()
    return [public_user(dict(row)) for row in rows]


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserInput,
    db: DB,
    _: Annotated[dict, Depends(require_roles("Administrador"))],
):
    if not body.password or len(body.password) < 8:
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 8 caracteres.")
    if not body.name.strip() or not body.branch.strip():
        raise HTTPException(status_code=422, detail="Revisa nombre y sede.")
    try:
        row = execute(
            db,
            """INSERT INTO users (name, email, password_hash, role, branch, avatar_url)
               VALUES (:name, :email, :password_hash, :role, :branch, :avatar_url)
               RETURNING id, name, email, role, branch, avatar_url, active""",
            name=body.name.strip(),
            email=body.email.strip().lower(),
            password_hash=hash_password(body.password),
            role=body.role,
            branch=body.branch.strip(),
            avatar_url=None,
        ).mappings().one()
        db.commit()
        return public_user(dict(row))
    except IntegrityError as error:
        db.rollback()
        fail_integrity(error)


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: UserInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Administrador"))],
):
    if user_id == str(actor["id"]) and body.role != "Administrador":
        raise HTTPException(status_code=400, detail="No puedes quitarte el acceso de Administrador.")
    if not body.name.strip() or not body.branch.strip():
        raise HTTPException(status_code=422, detail="Revisa nombre y sede.")
    if body.password is not None and len(body.password) < 8:
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 8 caracteres.")
    password_sql = ", password_hash = :password_hash" if body.password else ""
    params = {
        "id": user_id,
        "name": body.name.strip(),
        "email": body.email.strip().lower(),
        "role": body.role,
        "branch": body.branch.strip(),
    }
    if body.password:
        params["password_hash"] = hash_password(body.password)
    try:
        row = execute(
            db,
            f"""UPDATE users SET name = :name, email = :email, role = :role,
                    branch = :branch{password_sql}
                WHERE id = :id
                RETURNING id, name, email, role, branch, avatar_url, active""",
            **params,
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="El usuario no está disponible.")
        db.commit()
        return public_user(dict(row))
    except IntegrityError as error:
        db.rollback()
        fail_integrity(error)


@router.patch("/users/{user_id}/active")
def set_user_active(
    user_id: str,
    body: ActiveInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Administrador"))],
):
    if user_id == str(actor["id"]) and not body.active:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta.")
    row = execute(
        db,
        """UPDATE users SET active = :active WHERE id = :id
           RETURNING id, name, email, role, branch, avatar_url, active""",
        id=user_id,
        active=body.active,
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="El usuario no está disponible.")
    db.commit()
    return public_user(dict(row))
