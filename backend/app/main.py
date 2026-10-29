from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, clients, dashboard, operations, quotes, requests, users
from app.core.config import CORS_ORIGINS
from app.core.database import initialize


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    yield


app = FastAPI(
    title="TravelRequests API",
    description="API de solicitudes, expedientes, cotizaciones, reservas, pagos y usuarios.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(clients.router, prefix="/api/v1")
app.include_router(requests.router, prefix="/api/v1")
app.include_router(quotes.router, prefix="/api/v1")
app.include_router(operations.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")


@app.get("/health", tags=["Sistema"])
def health():
    return {"status": "ok"}
