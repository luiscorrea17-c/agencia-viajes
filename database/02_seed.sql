-- =====================================================================
-- 02_seed.sql — Datos semilla (paridad con frontend/src/api/auth.ts)
-- Ejecutar DESPUÉS de 01_schema.sql. Se puede re-ejecutar sin duplicar.
-- Las contraseñas se guardan con bcrypt (compatible con passlib[bcrypt]).
-- =====================================================================

insert into users (name, email, password_hash, role, branch, active) values
 ('Laura Gómez',   'admin@travelrequests.co',        crypt('admin123',    gen_salt('bf', 10)), 'Administrador', 'Bogotá - Chicó',        true),
 ('Andrés Ruiz',   'asesor@travelrequests.co',       crypt('asesor123',   gen_salt('bf', 10)), 'Asesor',        'Medellín - El Poblado', true),
 ('Marta Díaz',    'contabilidad@travelrequests.co', crypt('conta123',    gen_salt('bf', 10)), 'Contabilidad',  'Bogotá - Chicó',        true),
 ('Carlos Pérez',  'cliente@travelrequests.co',      crypt('cliente123',  gen_salt('bf', 10)), 'Cliente',       'Cali - Granada',        true),
 ('Julián Ospina', 'inactivo@travelrequests.co',     crypt('inactivo123', gen_salt('bf', 10)), 'Asesor',        'Cartagena',             false)
on conflict (lower(email)) do nothing;

-- Expediente de Carlos, vinculado a su cuenta de portal
insert into client_records (user_id, name, email, phone, type, segment, doc_type, doc_number)
select id, name, email, '3000000000', 'Persona', 'Estándar', 'CC', '1030000001'
from users where email = 'cliente@travelrequests.co'
on conflict (lower(email)) do nothing;
