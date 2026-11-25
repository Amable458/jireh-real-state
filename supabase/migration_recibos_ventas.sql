-- ============================================================
-- RECIBOS A INQUILINOS + EXCLUSIVIDAD EN EL INVENTARIO
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================
--
-- 1) Tabla receipts: cada recibo emitido al registrar un cobro. Guarda una
--    COPIA de los datos (nombre del inquilino, propiedad, monto) para que el
--    recibo reimpreso salga igual aunque luego se edite el ingreso.
-- 2) properties: exclusividad (sí/no) y fecha en que vence.
-- 3) jireh_restore incluye la tabla nueva al restaurar respaldos.

create table if not exists receipts (
  id bigserial primary key,
  "rentalId" bigint references rentals(id) on delete set null,
  "tenantId" bigint references tenants(id) on delete set null,
  "propertyId" bigint references properties(id) on delete set null,
  "tenantName" text not null default '',
  "propertyName" text not null default '',
  concept text not null default 'Renta',
  year int,
  month int,
  amount numeric not null default 0,
  currency text not null default 'DOP',
  "exchangeRate" numeric,
  "paymentDate" date,
  method text not null default '',
  notes text not null default '',
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  constraint receipts_currency_check check (currency in ('DOP', 'USD')),
  constraint receipts_amount_check check (amount >= 0)
);

create index if not exists receipts_rental_idx on receipts ("rentalId");
create index if not exists receipts_tenant_idx on receipts ("tenantId");
create index if not exists receipts_property_idx on receipts ("propertyId");

-- Acceso: el mismo modelo que el resto del sistema
alter table receipts enable row level security;
drop policy if exists "sesion leer" on receipts;
drop policy if exists "sesion crear" on receipts;
drop policy if exists "sesion editar" on receipts;
drop policy if exists "admin borrar" on receipts;
create policy "sesion leer" on receipts for select to anon, authenticated
  using ((select jireh_session_role()) is not null);
create policy "sesion crear" on receipts for insert to anon, authenticated
  with check ((select jireh_session_role()) is not null);
create policy "sesion editar" on receipts for update to anon, authenticated
  using ((select jireh_session_role()) is not null)
  with check ((select jireh_session_role()) is not null);
create policy "admin borrar" on receipts for delete to anon, authenticated
  using ((select jireh_session_role()) in ('SuperAdmin', 'Admin'));

-- Avisos en tiempo real (mismo canal sin datos que las demás tablas)
drop trigger if exists jireh_broadcast on receipts;
create trigger jireh_broadcast after insert or update or delete on receipts
  for each statement execute function jireh_broadcast_change();

-- ---------- Exclusividad en el inventario ----------
alter table properties add column if not exists exclusive boolean not null default false;
alter table properties add column if not exists "exclusiveUntil" date;

-- ---------- Restaurar respaldos: incluir la tabla nueva ----------
create or replace function jireh_restore(p_data jsonb)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  t text;
  n int;
  seq text;
  result jsonb := '{}'::jsonb;
  clear_order text[] := array['receipts','rentals','sales','expenses','ownerReports','webProps','tenants','properties','agents','distributionConfig','settings'];
  insert_order text[] := array['settings','distributionConfig','agents','properties','tenants','webProps','ownerReports','expenses','sales','rentals','receipts'];
begin
  if jireh_session_role() is distinct from 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede restaurar respaldos.';
  end if;

  foreach t in array clear_order loop
    if p_data ? t and to_regclass('public.' || quote_ident(t)) is not null then
      execute format('delete from %I', t);
    end if;
  end loop;

  foreach t in array insert_order loop
    if p_data ? t and to_regclass('public.' || quote_ident(t)) is not null then
      execute format('insert into %1$I select * from jsonb_populate_recordset(null::%1$I, $1)', t)
        using p_data -> t;
      get diagnostics n = row_count;
      result := result || jsonb_build_object(t, n);
      seq := pg_get_serial_sequence(quote_ident(t), 'id');
      if seq is not null then
        execute format('select setval(%L, coalesce((select max(id) from %I), 0) + 1, false)', seq, t);
      end if;
    end if;
  end loop;

  return result::json;
end $$;

revoke all on function jireh_restore(jsonb) from public;
grant execute on function jireh_restore(jsonb) to anon, authenticated;

-- Que la API vea la tabla y columnas nuevas de inmediato
notify pgrst, 'reload schema';

do $$ begin
  raise notice '✓ Recibos: tabla receipts lista; propiedades con exclusividad; restauración actualizada.';
end $$;
