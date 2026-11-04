import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


ROOT_DIR = Path(__file__).resolve().parents[2]
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/travelrequests",
)
def normalize_database_url(value: str) -> str:
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


DATABASE_URL = normalize_database_url(DATABASE_URL)
JWT_SECRET = os.getenv("JWT_SECRET", "development-only-change-this-secret")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "480"))
APP_ENV = os.getenv("APP_ENV", "development")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "API_CORS_ORIGINS", "http://localhost:5173,http://localhost:8080"
    ).split(",")
    if origin.strip()
]
RECEIPTS_DIR = Path(
    os.getenv("RECEIPTS_DIR", str(ROOT_DIR.parent / "files" / "receipts"))
).resolve()

if APP_ENV == "production" and JWT_SECRET == "development-only-change-this-secret":
    raise RuntimeError("JWT_SECRET must be configured outside development.")
