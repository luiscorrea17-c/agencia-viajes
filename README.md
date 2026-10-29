# Agencia de Viajes — TravelRequests (Módulo 4)

Aplicación transaccional para la **gestión de solicitudes, cotizaciones asistidas por IA, reservas, viajeros y pagos**.

## Estructura del repositorio

- `frontend/` — Aplicación web en React 19, TypeScript, TanStack Start/Router/Query y Tailwind CSS v4.
- `backend/` — Servicios API (preparado para FastAPI + Pydantic consumiendo los contratos de `frontend/src/api`).
- `database/` — Esquemas, migraciones y semillas de base de datos.
- `files/` — Almacenamiento local de soportes y comprobantes.

## Ejecución local

### Backend FastAPI

El backend usa FastAPI, Pydantic y SQLite. La primera ejecución crea la base de datos en `database/travel_requests.db` y carga las cuentas y registros de demostración.

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --reload
```

La API queda disponible en `http://localhost:8000/api/v1`; la documentación interactiva está en `http://localhost:8000/docs` y la comprobación de salud en `http://localhost:8000/health`.

Configura un secreto propio en `backend/.env` antes de desplegar y restringe `CORS_ORIGINS` a los dominios permitidos. El valor incluido en `.env.example` solo sirve para desarrollo local.

### Frontend

Para conectar React con FastAPI, configura `frontend/.env` con:

```env
VITE_API_URL=http://localhost:8000/api/v1
```

```bash
cd frontend
npm install
npm run dev
```

Sin `VITE_API_URL`, el frontend conserva los mocks en memoria para la demo y las pruebas. Con la variable configurada, las funciones en `frontend/src/api` usan el backend y las pantallas mantienen sus contratos tipados.

### Cuentas de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@travelrequests.co` | `admin123` |
| Asesor | `asesor@travelrequests.co` | `asesor123` |
| Contabilidad | `contabilidad@travelrequests.co` | `conta123` |
| Cliente | `cliente@travelrequests.co` | `cliente123` |

### Organización del backend

- `backend/app/api/` define rutas REST para autenticación, usuarios, expedientes, solicitudes, cotizaciones, reservas, pagos e inicio.
- `backend/app/core/` contiene configuración, SQLite, semillas y autenticación/token.
- `backend/app/schemas/` mantiene los contratos Pydantic alineados con `frontend/src/api`.
- `backend/app/services/` reúne utilidades de auditoría, códigos consecutivos y sincronización de estados entre módulos.
- `database/` almacena el archivo SQLite local; no se versiona.

Pruebas y verificación de tipos:

```bash
cd frontend
npx tsc --noEmit
npm test
```
