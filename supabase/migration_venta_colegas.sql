-- ============================================================
-- MIGRACIÓN: Reparto de comisión a colegas en ventas
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================

-- Reparto de la comisión: array [{id, name, percent}] guardado en la venta.
-- Cada colega genera una cuenta por pagar (gasto pendiente) = comisión × %.
-- El residual (comisión − suma de colegas) es la parte de la inmobiliaria.
alter table sales add column if not exists colegas jsonb;

-- El índice único expenses_recurring_month_uidx ya existe
-- (de migration_pago_propietario.sql); no se recrea aquí.

do $$ begin
  raise notice '✓ Migración de colegas en ventas aplicada: sales.colegas (reparto de comisión).';
end $$;
