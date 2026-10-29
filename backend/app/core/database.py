from collections.abc import Iterable
from typing import Any

from supabase import Client, create_client

from app.core.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError(
                "Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env."
            )
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client


def initialize() -> None:
    _get_client()


def get_record(entity: str, record_id: str) -> dict[str, Any] | None:
    result = (
        _get_client()
        .table("records")
        .select("payload")
        .eq("entity", entity)
        .eq("id", record_id)
        .limit(1)
        .execute()
    )
    return result.data[0]["payload"] if result.data else None


def list_records(entity: str) -> list[dict[str, Any]]:
    result = (
        _get_client()
        .table("records")
        .select("payload")
        .eq("entity", entity)
        .order("created_at", desc=True)
        .execute()
    )
    return [row["payload"] for row in result.data]


def save_record(entity: str, record: dict[str, Any]) -> dict[str, Any]:
    _get_client().table("records").upsert(
        {"entity": entity, "id": str(record["id"]), "payload": record},
        on_conflict="entity,id",
    ).execute()
    return record


def save_records(entity: str, records: Iterable[dict[str, Any]]) -> None:
    rows = [
        {"entity": entity, "id": str(record["id"]), "payload": record}
        for record in records
    ]
    if rows:
        _get_client().table("records").upsert(
            rows, on_conflict="entity,id"
        ).execute()


def delete_record(entity: str, record_id: str) -> None:
    _get_client().table("records").delete().eq("entity", entity).eq("id", record_id).execute()
