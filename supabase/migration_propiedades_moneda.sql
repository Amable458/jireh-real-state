-- ============================================================
-- MIGRACION: Moneda por propiedad (RD$ / US$)
-- Ejecutar en Supabase -> SQL Editor. Idempotente. NO borra datos.
-- ============================================================

alter table properties add column if not exists currency text default 'DOP';
update properties set currency = 'DOP' where currency is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'properties_currency_check') then
    alter table properties add constraint properties_currency_check check (currency in ('DOP','USD'));
  end if;
end $$;

-- Que la API vea la columna nueva de inmediato
notify pgrst, 'reload schema';

do $$ begin
  raise notice 'Propiedades: columna currency lista (las existentes quedan en RD$).';
end $$;
