-- =====================================================================
-- 01_schema.sql — Esquema de TravelRequests (Módulo 4) para Supabase/PostgreSQL
-- Ejecutar UNA vez en: Supabase > SQL Editor > New query > Run
-- Tablas: 12 (users, client_records, client_companions, travel_requests,
--          quotes, quote_items, bookings, booking_travelers,
--          booking_agreed_items, payments, audit_logs, code_counters)
-- =====================================================================

-- ============ EXTENSIONES ============
create extension if not exists pgcrypto;

-- ============ CONTADOR DE CÓDIGOS (EXP/SOL/COT/RES/PAG-YYYY-NNN) ============
create table code_counters (
  prefix     text not null,
  year       int  not null,
  last_value int  not null default 0,
  primary key (prefix, year)
);

-- INSERT ... ON CONFLICT DO UPDATE es atómico: dos usuarios simultáneos
-- nunca obtienen el mismo número (a diferencia de MAX()+1).
create or replace function next_code(p text) returns text
language plpgsql as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into code_counters (prefix, year, last_value)
  values (p, y, 1)
  on conflict (prefix, year)
  do update set last_value = code_counters.last_value + 1
  returning last_value into n;
  return p || '-' || y || '-' || lpad(n::text, 3, '0');
end $$;

-- ============ 1. USERS ============
create table users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  password_hash text not null,
  role          text not null check (role in ('Administrador','Asesor','Contabilidad','Cliente')),
  branch        text,
  avatar_url    text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index users_email_uq on users (lower(email));

-- ============ 2. CLIENT_RECORDS ============
create table client_records (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default next_code('EXP'),
  user_id         uuid unique references users(id) on delete set null,
  name            text not null,
  email           text not null,
  phone           text,
  type            text not null check (type in ('Persona','Empresa')),
  segment         text not null default 'Estándar' check (segment in ('Estándar','Corporativo','VIP')),
  doc_type        text not null check (doc_type in ('CC','NIT','CE','Pasaporte')),
  doc_number      text not null,
  passport_number text,
  passport_expiry date,
  billing_address text,
  tax_regime      text,
  notes           jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index client_records_email_uq on client_records (lower(email));

-- ============ 3. CLIENT_COMPANIONS ============
create table client_companions (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references client_records(id) on delete cascade,
  full_name       text not null,
  birth_date      date not null,
  is_minor        boolean not null default false,
  doc_type        text not null check (doc_type in ('CC','NIT','CE','Pasaporte')),
  doc_number      text not null,
  passport_expiry date
);
create index on client_companions (client_id);

-- ============ 4. TRAVEL_REQUESTS ============
create table travel_requests (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default next_code('SOL'),
  client_id       uuid not null references client_records(id) on delete restrict,
  destination     text not null,
  thumbnail_url   text,
  start_date      date not null,
  end_date        date not null,
  budget_cop      bigint not null check (budget_cop > 0),
  travelers_count int not null check (travelers_count >= 1),
  status          text not null default 'Abierta' check (status in ('Abierta','En cotización','Cerrada')),
  notes           text,
  created_by      uuid references users(id),
  updated_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on travel_requests (client_id);
create index on travel_requests (status);

-- ============ 5. QUOTES ============
create table quotes (
  id                          uuid primary key default gen_random_uuid(),
  code                        text not null unique default next_code('COT'),
  request_id                  uuid not null references travel_requests(id) on delete restrict,
  request_budget_cop          bigint not null,
  version                     int  not null default 1 check (version >= 1),
  commercial_description      text,
  is_description_ai_generated boolean not null default false,
  base_price_cop              bigint not null default 0,
  season_surcharge_percent    numeric(5,2) not null default 0 check (season_surcharge_percent between 0 and 100),
  season_surcharge_cop        bigint not null default 0,
  discount_percent            numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_cop                bigint not null default 0,
  requires_admin_approval     boolean not null default false,
  admin_approved_by           uuid references users(id),
  total_cop                   bigint not null default 0,
  valid_until                 date not null,
  status                      text not null default 'Borrador'
                              check (status in ('Borrador','Enviada','Aprobada','Rechazada','Expirada')),
  advisor_decision_log        text,
  updated_by                  uuid references users(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (request_id, version)
);
create index on quotes (request_id);
-- Solo una cotización activa por solicitud
create unique index quotes_one_active_per_request
  on quotes (request_id) where status in ('Borrador','Enviada','Aprobada');

-- ============ 6. QUOTE_ITEMS ============
create table quote_items (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid not null references quotes(id) on delete cascade,
  category          text not null check (category in ('Vuelos','Alojamiento','Traslados','Actividades','Asistencia')),
  description       text not null,
  quantity          int  not null check (quantity >= 1),
  unit_price_cop    bigint not null check (unit_price_cop > 0),
  is_ai_generated   boolean not null default false,
  edited_by_advisor boolean not null default false,
  sort_order        int not null default 0
);
create index on quote_items (quote_id);

-- ============ 7. BOOKINGS ============
create table bookings (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique default next_code('RES'),
  quote_id         uuid not null unique references quotes(id) on delete restrict,
  request_id       uuid not null references travel_requests(id) on delete restrict,
  client_id        uuid not null references client_records(id) on delete restrict,
  destination      text not null,
  thumbnail_url    text,
  start_date       date not null,
  end_date         date not null,
  payment_due_date date not null,
  travelers_count  int  not null check (travelers_count >= 1),
  conditions       text,
  total_cop        bigint not null check (total_cop >= 0),
  paid_cop         bigint not null default 0 check (paid_cop >= 0),
  status           text not null default 'pendiente_pago'
                   check (status in ('pendiente_pago','confirmada','en_modificacion','cancelada')),
  notes            text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date >= start_date),
  check (payment_due_date <= start_date)
);
create index on bookings (client_id);
create index on bookings (status);

-- ============ 8. BOOKING_TRAVELERS (copia nominada) ============
create table booking_travelers (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  full_name       text not null,
  doc_type        text not null check (doc_type in ('CC','NIT','CE','Pasaporte')),
  doc_number      text not null,
  is_minor        boolean not null default false,
  passport_expiry date
);
create index on booking_travelers (booking_id);

-- ============ 9. BOOKING_AGREED_ITEMS (copia congelada) ============
create table booking_agreed_items (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references bookings(id) on delete cascade,
  category       text not null check (category in ('Vuelos','Alojamiento','Traslados','Actividades','Asistencia')),
  description    text not null,
  quantity       int  not null check (quantity >= 1),
  unit_price_cop bigint not null check (unit_price_cop > 0)
);
create index on booking_agreed_items (booking_id);

-- ============ 10. PAYMENTS ============
create table payments (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique default next_code('PAG'),
  booking_id   uuid not null references bookings(id) on delete restrict,
  client_id    uuid not null references client_records(id) on delete restrict,
  amount_cop   bigint not null check (amount_cop > 0),
  method       text not null check (method in ('Transferencia','Consignación','Efectivo')),
  reference    text,
  payment_date date not null,
  receipt_name text,
  receipt_path text,   -- ruta del archivo en el bucket 'receipts' de Supabase Storage
  status       text not null default 'por_conciliar'
               check (status in ('por_conciliar','validado','rechazado','devuelto')),
  notes        text,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on payments (booking_id);
create index on payments (status);

-- ============ 11. AUDIT_LOGS (bitácora genérica, sin FK a la entidad) ============
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('client','request','booking','payment')),
  entity_id   uuid not null,
  action      text not null,
  reason      text,
  user_id     uuid references users(id),
  user_name   text not null,
  created_at  timestamptz not null default now()
);
create index on audit_logs (entity_type, entity_id);

-- ============ updated_at AUTOMÁTICO ============
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['client_records','travel_requests','quotes','bookings','payments'] loop
    execute format('create trigger trg_%I_updated before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ============ SEGURIDAD: RLS sin políticas ============
-- Cierra la API pública de Supabase (PostgREST). Solo el backend, conectado
-- con DATABASE_URL (rol postgres), puede leer y escribir.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- ============ STORAGE: bucket privado para comprobantes de pago ============
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
