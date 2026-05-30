-- ============================================================
-- MIGRACIÓN: Tipos de ingreso (renta / otro) + categoría
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- ============================================================

-- kind: 'renta' | 'otro'
alter table rentals add column if not exists kind text default 'renta';

-- category: para renta = 'Renta'; para otro = 'Por contrato' |
-- 'Por administración de propiedad' | texto libre
alter table rentals add column if not exists category text default 'Renta';

-- Normaliza registros existentes (rentas previas)
update rentals set kind = 'renta' where kind is null;
update rentals set category = 'Renta' where category is null or category = '';

-- CHECK: kind solo admite los dos valores
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rentals_kind_check') then
    alter table rentals add constraint rentals_kind_check check (kind in ('renta','otro'));
  end if;
end $$;

do $$ begin
  raise notice '✓ Migración de ingresos aplicada: columnas kind y category listas.';
end $$;
