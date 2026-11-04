from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import APP_ENV
from app.database import engine
from app.routers import auth, bookings, clients, dashboard, quotes, requests


app = FastAPI(
    title="TravelRequests API",
    version="1.0.0",
    description="API transaccional para solicitudes, cotizaciones, reservas y pagos.",
    docs_url=None if APP_ENV == "production" else "/docs",
    redoc_url=None if APP_ENV == "production" else "/redoc",
)

# Configuración permisiva de CORS para evitar errores con los dominios dinámicos de Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite peticiones desde cualquier frontend (Vercel, localhost, etc.)
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(clients.router)
app.include_router(requests.router)
app.include_router(quotes.router)
app.include_router(bookings.router)
app.include_router(dashboard.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise HTTPException(status_code=503, detail="No hay conexión con PostgreSQL.") from error
    return {"status": "ready", "database": "connected"}