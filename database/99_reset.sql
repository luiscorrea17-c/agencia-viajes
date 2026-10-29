-- =====================================================================
-- 99_reset.sql — ⚠ DESTRUCTIVO: borra TODAS las tablas y datos del esquema.
-- Úsalo solo en desarrollo, si quieres rehacer 01_schema.sql desde cero.
-- Luego vuelve a correr 01_schema.sql y 02_seed.sql.
-- =====================================================================

drop table if exists
  audit_logs, payments, booking_agreed_items, booking_travelers, bookings,
  quote_items, quotes, travel_requests, client_companions, client_records,
  users, code_counters
cascade;

drop function if exists next_code(text);
drop function if exists set_updated_at();

delete from storage.buckets where id = 'receipts';
