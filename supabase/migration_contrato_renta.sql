-- ============================================================
-- MIGRACIÓN: Desglose de "Contrato de renta" (cuentas por pagar)
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================

-- Config editable del desglose de contrato, guardada en settings.app
alter table settings add column if not exists "contractFees" jsonb;

-- Siembra el desglose por defecto si aún no existe
update settings
set "contractFees" = '[
  {"id":"notario","label":"Abogado notario","amount":500},
  {"id":"abogado_inmobiliaria","label":"Abogado inmobiliaria","amount":500},
  {"id":"datacredito","label":"Depuración (Data crédito)","amount":500},
  {"id":"gestor","label":"Depuración (Gestor)","amount":500}
]'::jsonb
where key = 'app' and "contractFees" is null;

-- El índice único expenses_recurring_month_uidx ya existe
-- (de migration_pago_propietario.sql); no se recrea aquí.

do $$ begin
  raise notice '✓ Migración de contrato de renta aplicada: settings.contractFees con desglose por defecto.';
end $$;
