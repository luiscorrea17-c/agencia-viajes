# Base de datos (Supabase / PostgreSQL)

Scripts SQL de TravelRequests. Se ejecutan **a mano** en Supabase > SQL Editor, en este orden:

| Orden | Archivo | Qué hace |
| :-: | :-- | :-- |
| 1 | `01_schema.sql` | Crea las 12 tablas, índices, checks, triggers, RLS y el bucket `receipts` |
| 2 | `02_seed.sql` | Inserta los 5 usuarios semilla y el expediente de Carlos (re-ejecutable) |
| 3 | `03_verify.sql` | Consultas de comprobación y pruebas de rechazo |
| — | `99_reset.sql` | **Destructivo.** Borra todo para empezar de cero (solo desarrollo) |

## Conexión
El backend leerá `DATABASE_URL` desde `backend/.env` (ignorado por git; plantilla en `backend/.env.example`).
Usa la cadena **Session pooler** de Supabase. El frontend nunca se conecta a la base.

## Reglas
- La base garantiza integridad: tipos, rangos (`CHECK`), relaciones (`FK`) y unicidad.
- El backend aplica reglas de negocio: totales de cotización, descuento > 10 %, transiciones de estado, recálculo de `paid_cop` y RBAC.
- Cualquier cambio de esquema se agrega como nuevo archivo `NN_descripcion.sql`; no se edita `01_schema.sql` una vez ejecutado en Supabase.
