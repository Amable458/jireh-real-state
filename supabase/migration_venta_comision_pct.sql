-- ============================================================
-- MIGRACIÓN: Comisión de venta como % del precio
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================

-- % de comisión sobre el precio de venta. El monto (columna commission)
-- se calcula como price × commissionPercent / 100.
alter table sales add column if not exists "commissionPercent" numeric;

-- Backfill: para ventas existentes con comisión pero sin %, deriva el %
-- desde el monto y el precio (para que al editar se vea el % correcto).
update sales
set "commissionPercent" = round(commission / price * 100.0, 4)
where "commissionPercent" is null and commission is not null and price is not null and price > 0;

do $$ begin
  raise notice '✓ Migración de comisión %% en ventas aplicada: sales.commissionPercent + backfill.';
end $$;
