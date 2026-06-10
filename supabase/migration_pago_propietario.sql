-- ============================================================
-- MIGRACIÓN: Pago automático a propietario (renta − comisión)
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================

-- Nombre del propietario en cada propiedad
alter table properties add column if not exists owner text;

-- Clave de serie en gastos para los pagos auto-generados (anti-duplicados)
alter table expenses add column if not exists "recurringKey" text;

create unique index if not exists expenses_recurring_month_uidx
  on expenses ("recurringKey", year, month)
  where "recurringKey" is not null;

-- Backfill: crea el pago a propietario para los cobros de renta
-- PENDIENTES ya generados (p. ej. el mes en curso). Idempotente
-- gracias a ON CONFLICT DO NOTHING sobre el índice único.
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
  raise notice '✓ Migración pago a propietario aplicada: properties.owner, expenses.recurringKey + backfill de pagos pendientes.';
end $$;
