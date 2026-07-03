-- ============================================================
-- MIGRACIÓN: Bono de administración por inquilino (colaborador)
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================

-- Responsable/administrador asignado a cada inquilino (usuario del sistema)
alter table tenants add column if not exists "managerId" bigint references users(id) on delete set null;
alter table tenants add column if not exists "managerName" text;

-- Monto fijo por inquilino administrado (config editable, por defecto RD$500)
alter table settings add column if not exists "adminBonusPerTenant" numeric default 500;
update settings set "adminBonusPerTenant" = 500 where key = 'app' and "adminBonusPerTenant" is null;

-- El índice único expenses_recurring_month_uidx ya existe
-- (de migration_pago_propietario.sql); no se recrea aquí.

do $$ begin
  raise notice '✓ Migración de bono de administración aplicada: tenants.managerId/managerName + settings.adminBonusPerTenant.';
end $$;
