-- ============================================================
-- MIGRACIÓN: Pago automático a propietario (renta − comisión)
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================

-- Nombre del propietario en cada propiedad
alter table properties add column if not exists owner text;

-- Clave de serie en gastos para los pagos auto-generados (anti-duplicados)
alter table expenses add column if not exists "recurringKey" text;

create unique index if not exists expenses_recurring_month_uidx
  on expenses ("recurringKey", year, month)
  where "recurringKey" is not null;

do $$ begin
  raise notice '✓ Migración pago a propietario aplicada: properties.owner + expenses.recurringKey con índice anti-duplicados.';
end $$;
