-- ============================================================
-- MIGRACIÓN: Inquilinos con moneda, % de comisión y día de cobro
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- NO borra ni modifica datos existentes — solo agrega columnas.
-- ============================================================

alter table tenants add column if not exists currency text default 'DOP';
alter table tenants add column if not exists "exchangeRate" numeric;
alter table tenants add column if not exists "commissionPercent" numeric;
alter table tenants add column if not exists "collectionDay" int default 1;

-- Compatibilidad: inquilinos existentes quedan en DOP, sin comisión configurada
update tenants set currency = 'DOP' where currency is null;
update tenants set "collectionDay" = 1 where "collectionDay" is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_currency_check') then
    alter table tenants add constraint tenants_currency_check check (currency in ('DOP','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_collection_day_check') then
    alter table tenants add constraint tenants_collection_day_check check ("collectionDay" between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_commission_check') then
    alter table tenants add constraint tenants_commission_check check ("commissionPercent" is null or ("commissionPercent" >= 0 and "commissionPercent" <= 100));
  end if;
end $$;

-- Evita duplicados de ingresos auto-generados: una sola fila por serie
-- recurrente (recurringKey) por mes, garantizado a nivel de base de datos.
create unique index if not exists rentals_recurring_month_uidx
  on rentals ("recurringKey", year, month)
  where "recurringKey" is not null;

do $$ begin
  raise notice '✓ Migración de inquilinos aplicada: currency, exchangeRate, commissionPercent, collectionDay + índice anti-duplicados.';
end $$;
