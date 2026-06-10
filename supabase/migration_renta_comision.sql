-- ============================================================
-- MIGRACIÓN: Cobro = renta completa; comisión guardada aparte
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- NO borra datos — agrega columnas y corrige cobros pendientes.
-- ============================================================

alter table rentals add column if not exists "commissionPercent" numeric;
alter table rentals add column if not exists "commissionAmount" numeric;

-- Corrige los cobros auto-generados bajo la lógica anterior
-- (monto = comisión) para que el monto sea la renta completa
-- y la comisión quede registrada aparte.
-- Solo toca cobros PENDIENTES generados desde inquilinos.
update rentals r set
  amount = t."monthlyRent",
  "commissionPercent" = t."commissionPercent",
  "commissionAmount" = round(t."monthlyRent" * t."commissionPercent" / 100.0, 2)
from tenants t
where r."recurringKey" = 'tenant_' || t.id::text
  and r.status = 'pendiente'
  and r."commissionAmount" is null
  and t."monthlyRent" is not null
  and t."commissionPercent" is not null;

do $$ begin
  raise notice '✓ Migración renta/comisión aplicada: el cobro es la renta completa y la comisión queda registrada aparte.';
end $$;
