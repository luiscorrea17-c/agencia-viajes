# Agencia de Viajes — TravelRequests (Módulo 4)

Aplicación transaccional para la **gestión de solicitudes, cotizaciones asistidas por IA, reservas, viajeros y pagos**.

## Estructura del repositorio

- `frontend/` — Aplicación web en React 19, TypeScript, TanStack Start/Router/Query y Tailwind CSS v4.
- `backend/` — Servicios API (preparado para FastAPI + Pydantic consumiendo los contratos de `frontend/src/api`).
- `database/` — Esquemas, migraciones y semillas de base de datos.
- `files/` — Almacenamiento local de soportes y comprobantes.

## Ejecución local del frontend

```bash
cd frontend
npm install
npm run dev
```

Pruebas y verificación de tipos:

```bash
cd frontend
npx tsc --noEmit
npm test
```
