from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common import audit, code, fail_integrity, new_id, public_user
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


def ensure_client_profile(
    db: Session,
    user: dict,
    body: UserInput,
    actor: dict,
) -> None:
    if user["role"] != "Cliente":
        return

    profile = execute(
        db,
        "SELECT id, user_id FROM client_records WHERE user_id = :user_id FOR UPDATE",
        user_id=user["id"],
    ).mappings().first()
    if not profile:
        profile = execute(
            db,
            """SELECT id, user_id FROM client_records
               WHERE lower(email) = lower(:email) FOR UPDATE""",
            email=user["email"],
        ).mappings().first()

    if profile:
        if profile["user_id"] and str(profile["user_id"]) != str(user["id"]):
            raise HTTPException(
                status_code=409,
                detail="Ya existe un expediente con este correo vinculado a otra cuenta.",
            )
        execute(
            db,
            """UPDATE client_records
               SET user_id = :user_id, name = :name, email = :email,
                   phone = COALESCE(NULLIF(:phone, ''), phone),
                   doc_type = CASE WHEN NULLIF(:doc_number, '') IS NULL
                                   THEN doc_type ELSE COALESCE(:doc_type, doc_type) END,
                   doc_number = COALESCE(NULLIF(:doc_number, ''), doc_number)
               WHERE id = :id""",
            id=profile["id"],
            user_id=user["id"],
            name=user["name"],
            email=user["email"],
            phone=(body.client_phone or "").strip(),
            doc_type=body.client_doc_type,
            doc_number=(body.client_doc_number or "").strip(),
        )
        audit(db, "client", str(profile["id"]), "Cuenta de cliente vinculada", actor)
        return

    if (
        not (body.client_phone or "").strip()
        or not body.client_doc_type
        or not (body.client_doc_number or "").strip()
    ):
        raise HTTPException(
            status_code=422,
            detail="Para crear la cuenta de Cliente, ingresa teléfono y documento para su expediente.",
        )

    client_id = new_id()
    execute(
        db,
        """INSERT INTO client_records
           (id, code, user_id, name, email, phone, type, segment, doc_type, doc_number)
           VALUES (:id, :code, :user_id, :name, :email, :phone, :type, :segment,
                   :doc_type, :doc_number)""",
        id=client_id,
        code=code(db, "EXP"),
        user_id=user["id"],
        name=user["name"],
        email=user["email"],
        phone=body.client_phone.strip(),
        type=body.client_type,
        segment=body.client_segment,
        doc_type=body.client_doc_type,
        doc_number=body.client_doc_number.strip(),
    )
    audit(db, "client", client_id, "Expediente creado y vinculado a cuenta", actor)


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Administrador"))],
):
    if not body.password or len(body.password) < 8:
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 8 caracteres.")
    if not body.name.strip() or (body.role != "Cliente" and not body.branch.strip()):
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
        ensure_client_profile(db, dict(row), body, actor)
        db.commit()
        return public_user(dict(row))
    except IntegrityError as error:
        db.rollback()
        fail_integrity(error)
    except HTTPException:
        db.rollback()
        raise


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: UserInput,
    db: DB,
    actor: Annotated[dict, Depends(require_roles("Administrador"))],
):
    if user_id == str(actor["id"]) and body.role != "Administrador":
        raise HTTPException(status_code=400, detail="No puedes quitarte el acceso de Administrador.")
    if not body.name.strip() or (body.role != "Cliente" and not body.branch.strip()):
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
        ensure_client_profile(db, dict(row), body, actor)
        db.commit()
        return public_user(dict(row))
    except IntegrityError as error:
        db.rollback()
        fail_integrity(error)
    except HTTPException:
        db.rollback()
        raise


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
