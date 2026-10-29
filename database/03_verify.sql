-- =====================================================================
-- 03_verify.sql — Comprobaciones. Ejecuta cada bloque por separado
-- (selecciona el bloque y pulsa Run en el SQL Editor).
-- =====================================================================

-- 1) Debe devolver 12 (tablas creadas)
select count(*) as tablas from information_schema.tables where table_schema = 'public';

-- 2) Debe devolver true (login simulado con bcrypt)
select crypt('admin123', password_hash) = password_hash as login_ok
from users where email = 'admin@travelrequests.co';

-- 3) Debe devolver 5 usuarios, 4 activos y 1 inactivo
select role, active, count(*) from users group by role, active order by role;

-- 4) Debe mostrar EXP-2026-001 (el año depende de la fecha actual)
select code, name, user_id is not null as tiene_cuenta from client_records;

-- 5) Genera el siguiente código; cada ejecución sube el número
select next_code('SOL') as siguiente_solicitud;

-- 6) RLS activo en todas las tablas: todas deben salir en true
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;

-- 7) Bucket de comprobantes: debe aparecer 'receipts' con public = false
select id, public from storage.buckets;

-- ---------------------------------------------------------------------
-- PRUEBAS DE RECHAZO (deben FALLAR; úsalas en la exposición).
-- Descomenta UNA a la vez y ejecútala; el error demuestra que el CHECK/FK funciona.
-- ---------------------------------------------------------------------
-- a) Presupuesto negativo:
-- insert into travel_requests (client_id, destination, start_date, end_date, budget_cop, travelers_count)
-- select id, 'Test', '2026-12-01', '2026-12-05', -5, 1 from client_records limit 1;
--
-- b) Fecha fin anterior a la de inicio:
-- insert into travel_requests (client_id, destination, start_date, end_date, budget_cop, travelers_count)
-- select id, 'Test', '2026-12-10', '2026-12-05', 1000000, 1 from client_records limit 1;
--
-- c) Rol inexistente:
-- insert into users (name, email, password_hash, role) values ('X','x@x.co','h','Hacker');
