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

## Vercel deployment

Deploy the backend as its own Vercel project with `backend/` as the Root
Directory. Let Vercel detect the FastAPI application; do not configure a
persistent Uvicorn start command or use `--reload` on Vercel.

Set `DATABASE_URL` to the Supabase PostgreSQL connection string, `JWT_SECRET`
to a private random secret, `APP_ENV=production`, and
`API_CORS_ORIGINS` to the deployed frontend's HTTPS origin. Optionally set
`GEMINI_API_KEY` to enable AI quote suggestions. Confirm the deployment with
`/health/ready`.

## Preliminary quote suggestions

The advisor's **Generate with AI** action requests a draft suggestion from the
Gemini API. Configure `GEMINI_API_KEY` in the private backend `.env` file;
`GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`. Never put the key in the
frontend or commit it. The request sends only destination, travel dates,
traveler count, budget, and trip preferences—not client name, email, or
identity documents. Preferences are free text, so remove any personal details
from them before generating. Suggestions are estimates, not live prices or confirmed
availability. The advisor must review and edit the draft before sending it.

## Role access

- **Cliente:** accesses their own dossier, requests, sent quotes, bookings, and
  payments; can respond to quotes, automatically receive a pending-payment
  booking when approving, and submit payments with receipts.
- **Asesor:** manages client dossiers and requests, prepares and sends quotes,
  and creates or updates bookings.
- **Contabilidad:** reviews payment records and receipts, then reconciles,
  rejects, or refunds payments. Booking options exposed to this role contain
  only the fields needed for payment review.
- **Administrador:** manages user accounts, supervises operational records in
  read-only views, and approves discounts above the advisor limit.

The API enforces these permissions independently of frontend navigation.
Client-owned records are additionally restricted by ownership checks. Existing
approved quotes can be converted into a booking by the client from the quote
screen if they predate automatic conversion.
Creating a user with the **Cliente** role also creates or links that account's
client dossier, making it available to advisors and enabling the client to
submit travel requests directly from the portal.

Seeded demo passwords are for local development only. Replace them before
exposing the service to any shared or public environment.
