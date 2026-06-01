-- ============================================================
-- MIGRACIÓN: Doble moneda (DOP / USD)
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- ============================================================

-- Columnas de moneda en tablas con montos
alter table rentals  add column if not exists currency text default 'DOP';
alter table rentals  add column if not exists "exchangeRate" numeric;
alter table sales    add column if not exists currency text default 'DOP';
alter table sales    add column if not exists "exchangeRate" numeric;
alter table expenses add column if not exists currency text default 'DOP';
alter table expenses add column if not exists "exchangeRate" numeric;

-- Compatibilidad: registros existentes = DOP
update rentals  set currency = 'DOP' where currency is null;
update sales    set currency = 'DOP' where currency is null;
update expenses set currency = 'DOP' where currency is null;

-- Tasa de cambio global USD -> DOP en settings
alter table settings add column if not exists "usdToDop" numeric default 60;
update settings set "usdToDop" = 60 where "usdToDop" is null;

-- CHECK: solo DOP o USD
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rentals_currency_check') then
    alter table rentals add constraint rentals_currency_check check (currency in ('DOP','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_currency_check') then
    alter table sales add constraint sales_currency_check check (currency in ('DOP','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_currency_check') then
    alter table expenses add constraint expenses_currency_check check (currency in ('DOP','USD'));
  end if;
end $$;

do $$ begin
  raise notice '✓ Migración de doble moneda aplicada: currency, exchangeRate y tasa global usdToDop.';
end $$;
