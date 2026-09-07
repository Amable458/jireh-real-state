-- ============================================================
-- MIGRACIÓN: Reporte de gastos de propiedad (para propietarios)
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================

-- Un reporte por propiedad y periodo: cabecera (propietario, inquilino,
-- dirección, residencial, periodo, cuenta) + renglones de gastos en jsonb
-- [{date, method, description, paidTo, amount}]. Se rellena a mano y se
-- imprime en PDF para entregárselo al propietario.
create table if not exists "ownerReports" (
  id bigserial primary key,
  "createdAt" timestamptz default now(),
  "createdBy" text,
  "propertyId" bigint,
  "tenantId" bigint,
  "ownerName" text,
  "tenantName" text,
  address text,
  "apartmentNo" text,
  "residentialName" text,
  "periodFrom" date,
  "periodTo" date,
  "paymentDate" date,
  "depositAccount" text,
  "rentAmount" numeric default 0,
  currency text default 'DOP',
  "exchangeRate" numeric,
  items jsonb default '[]'::jsonb,
  notes text
);

create index if not exists "ownerReports_property_idx" on "ownerReports" ("propertyId");
create index if not exists "ownerReports_period_idx" on "ownerReports" ("periodFrom", "periodTo");

-- Misma política que el resto de tablas operativas
alter table "ownerReports" enable row level security;
drop policy if exists "anon all" on "ownerReports";
create policy "anon all" on "ownerReports" for all to anon, authenticated using (true) with check (true);

do $$ begin
  raise notice '✓ Migración de reporte a propietario aplicada: tabla ownerReports.';
end $$;
