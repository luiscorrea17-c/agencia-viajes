from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.database import list_records, save_record


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def next_code(entity: str, prefix: str) -> tuple[str, int]:
    records = list_records(entity)
    current_year = datetime.now(timezone.utc).year
    seqs = []
    for record in records:
        code = str(record.get("code", ""))
        parts = code.split("-")
        if len(parts) >= 3 and parts[-2] == str(current_year) and parts[-1].isdigit():
            seqs.append(int(parts[-1]))
    sequence = max(seqs, default=0) + 1
    return f"{prefix}-{current_year}-{sequence:03d}", sequence


def audit_entry(user_name: str, action: str, reason: str | None = None) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "id": str(uuid4()),
        "action": action,
        "user": user_name,
        "timestamp": now_iso(),
    }
    if reason:
        entry["reason"] = reason
    return entry


def fail(message: str, code: int = status.HTTP_400_BAD_REQUEST) -> None:
    raise HTTPException(code, message)


def record_or_404(entity: str, record_id: str, message: str) -> dict[str, Any]:
    from app.core.database import get_record

    record = get_record(entity, record_id)
    if not record:
        fail(message, status.HTTP_404_NOT_FOUND)
    return record


def save_linked_request(client_id: str, linked: dict[str, Any]) -> None:
    from app.core.database import get_record

    client = get_record("clients", client_id)
    if client:
        entries = client.get("linkedRequests", [])
        found = False
        for index, entry in enumerate(entries):
            if entry.get("code") == linked["code"]:
                entries[index] = linked
                found = True
                break
        if not found:
            entries.insert(0, linked)
        client["linkedRequests"] = entries
        save_record("clients", client)


def sync_request_status(request_id: str, state: str, user_name: str, action: str) -> None:
    from app.core.database import get_record

    request = get_record("requests", request_id)
    if not request or request["status"] == state:
        return
    timestamp = now_iso()
    request["status"] = state
    request["updatedBy"] = user_name
    request["updatedAt"] = timestamp
    request.setdefault("history", []).append(
        audit_entry(user_name, action)
    )
    save_record("requests", request)
    save_linked_request(
        request["clientId"],
        {
            "code": request["code"],
            "destination": request["destination"],
            "date": request["startDate"],
            "status": state,
        },
    )


def thumbnail_for(destination: str) -> str:
    if any(term in destination.lower() for term in ("san andrés", "san andres", "isla", "playa")):
        return "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=900&q=80"
    return "https://images.unsplash.com/photo-1583531352515-8884af319dc1?auto=format&fit=crop&w=900&q=80"
