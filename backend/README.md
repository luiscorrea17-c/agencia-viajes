# TravelRequests API

FastAPI backend for the existing PostgreSQL/Supabase schema in `../database/`.
The API does not create or alter database tables automatically.

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to the PostgreSQL
   session-pooler connection string. Use the `postgresql+psycopg://` driver
   prefix and keep the file private.
2. Create and activate a virtual environment, then install `requirements.txt`.
3. If this is a new database, apply `database/01_schema.sql` and
   `database/02_seed.sql` manually in Supabase SQL Editor. Do not run these
   scripts against a database whose schema has not been checked.
4. Start the API from this directory:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --env-file .env --reload --host 127.0.0.1 --port 8000
   ```

5. In `frontend/`, copy `.env.example` to `.env` and start the frontend. The
   configured Vite origin must be present in `API_CORS_ORIGINS`.

The public health endpoint is `/health`; `/health/ready` checks PostgreSQL.
Interactive API documentation is available at `/docs` outside production.
The private payment-receipt files are stored under `files/receipts/`.

Seeded demo passwords are for local development only. Replace them before
exposing the service to any shared or public environment.
