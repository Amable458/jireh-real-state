-- ============================================================
-- MIGRACIÓN CONSOLIDADA — pendientes
-- Junta: renta/comisión + pago automático a propietario.
-- Ejecutar UNA VEZ en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================

-- ---- 1) Renta completa + comisión aparte (rentals) -------------------------
alter table rentals add column if not exists "commissionPercent" numeric;
alter table rentals add column if not exists "commissionAmount" numeric;

-- Corrige cobros auto-generados con la lógica vieja (monto = comisión):
-- el monto pasa a ser la renta completa y la comisión queda aparte.
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

-- ---- 2) Pago a propietario (properties + expenses) -------------------------
alter table properties add column if not exists owner text;
alter table expenses   add column if not exists "recurringKey" text;

create unique index if not exists expenses_recurring_month_uidx
  on expenses ("recurringKey", year, month)
  where "recurringKey" is not null;

-- Backfill: crea el pago a propietario para los cobros de renta PENDIENTES
-- ya existentes. Idempotente por el índice único + ON CONFLICT DO NOTHING.
insert into expenses
  (year, month, description, monthly, q1, q2, "paymentDate", status,
   currency, "exchangeRate", recurring, "recurringKey", notes, "createdAt")
select
  r.year, r.month,
  'Pago a propietario'
    || coalesce(' ' || nullif(trim(p.owner), ''), '')
    || ' — ' || coalesce(nullif(p.name, ''), nullif(r."propertyName", ''), 'renta ' || r."tenantName"),
  round(r.amount - r."commissionAmount", 2),
  case when extract(day from r.date) <= 15 then round(r.amount - r."commissionAmount", 2) else 0 end,
  case when extract(day from r.date) > 15 then round(r.amount - r."commissionAmount", 2) else 0 end,
  r.date, 'pendiente',
  r.currency, r."exchangeRate", 0,
  'tenant_owner_' || r."tenantId",
  'Renta menos comisión — inquilino ' || r."tenantName",
  now()
from rentals r
left join properties p on p.id = r."propertyId"
where r."recurringKey" like 'tenant\_%' escape '\'
  and r."tenantId" is not null
  and r."commissionAmount" is not null
  and r.status = 'pendiente'
  and (r.amount - r."commissionAmount") > 0
on conflict do nothing;

do $$ begin
  raise notice '✓ Migraciones pendientes aplicadas: rentals.commissionAmount, properties.owner, expenses.recurringKey + backfill de pagos a propietario.';
end $$;
