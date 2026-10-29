import os
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / "backend" / ".env")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("SUPABASE_ADMIN_EMAILS", "").split(",")
    if email.strip()
}
TOKEN_SECRET = os.getenv("TOKEN_SECRET", "change-this-development-secret-before-deploying")
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", str(8 * 60 * 60)))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
