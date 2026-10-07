-- ============================================================
-- PROPIEDADES EN LA WEB (landing jireh-realestate.vercel.app)
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================
--
-- El panel «Propiedades en la web» de la app de gestión es la ÚNICA fuente
-- de las propiedades que muestra la landing (reemplaza la importación del
-- WordPress). La landing lee solo lo publicado mediante web_catalogo().

create table if not exists "webProps" (
  id bigserial primary key,
  titulo text not null,
  operaciones text[] not null default '{venta}',   -- venta | renta | planos
  tipo text not null default 'apartamento',
  ciudad text not null default '',
  sector text not null default '',
  precio numeric,                                  -- null = «Precio a consultar»
  moneda text not null default 'USD',
  "porM2" boolean not null default false,
  habitaciones int,
  banos numeric,
  parqueos int,
  m2 numeric,
  caracteristicas text[] not null default '{}',
  descripcion text not null default '',
  destacada boolean not null default false,
  estado text not null default 'publicada',        -- publicada | oculta | cerrada
  fotos jsonb not null default '[]'::jsonb,        -- [{url, card?}] — la primera es la portada
  "urlOriginal" text,                              -- ficha del WordPress (solo las importadas)
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "createdBy" text,
  "updatedBy" text,
  constraint webprops_estado_chk check (estado in ('publicada', 'oculta', 'cerrada'))
);

create index if not exists "webProps_estado_idx" on "webProps" (estado);

-- Las importadas conservan su número del WordPress (12482–18498), así los
-- enlaces #p-<id> y las «Ref.» ya compartidas siguen sirviendo. Las nuevas se
-- numeran a partir de 20000 para no chocar nunca con ellas.
select setval(pg_get_serial_sequence('"webProps"', 'id'),
              greatest(20000, coalesce((select max(id) from "webProps"), 0) + 1), false);

create or replace function webprops_touch()
returns trigger language plpgsql as $$
begin new."updatedAt" := now(); return new; end $$;

drop trigger if exists webprops_touch on "webProps";
create trigger webprops_touch before update on "webProps"
  for each row execute function webprops_touch();

-- ---------- Acceso: el mismo modelo que el resto del sistema ----------
alter table "webProps" enable row level security;
drop policy if exists "sesion leer" on "webProps";
drop policy if exists "sesion crear" on "webProps";
drop policy if exists "sesion editar" on "webProps";
drop policy if exists "admin borrar" on "webProps";
create policy "sesion leer" on "webProps" for select to anon, authenticated
  using ((select jireh_session_role()) is not null);
create policy "sesion crear" on "webProps" for insert to anon, authenticated
  with check ((select jireh_session_role()) is not null);
create policy "sesion editar" on "webProps" for update to anon, authenticated
  using ((select jireh_session_role()) is not null)
  with check ((select jireh_session_role()) is not null);
create policy "admin borrar" on "webProps" for delete to anon, authenticated
  using ((select jireh_session_role()) in ('SuperAdmin', 'Admin'));

-- Avisos en tiempo real (mismo canal sin datos que las demás tablas)
drop trigger if exists jireh_broadcast on "webProps";
create trigger jireh_broadcast after insert or update or delete on "webProps"
  for each statement execute function jireh_broadcast_change();

-- ---------- Lectura PÚBLICA: solo lo publicado, en el formato de la landing ----------
-- La tabla no es legible sin sesión; esta función expone únicamente las
-- propiedades publicadas y solo los campos que la landing muestra.
create or replace function web_catalogo()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'resumen', json_build_object(
      -- total = filas en la tabla (cualquier estado). En 0 significa que aún no se
      -- importó nada: la landing sigue mostrando su copia estática.
      'total', (select count(*) from "webProps"),
      'disponibles', (select count(*) from "webProps" where estado = 'publicada'),
      -- 124 = negocios cerrados que ya contaba el WordPress al migrar (4-oct-2026);
      -- se les suman los que se marquen como cerrados en el panel.
      'cerradas', 124 + (select count(*) from "webProps" where estado = 'cerrada'),
      'ciudades', (select count(distinct ciudad) from "webProps" where estado = 'publicada' and ciudad <> ''),
      'actualizado', to_char(coalesce((select max("updatedAt") from "webProps"), now()) at time zone 'America/Santo_Domingo', 'YYYY-MM-DD')
    ),
    'props', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 't', p.titulo, 'ops', p.operaciones, 'tipo', p.tipo,
        'ciudad', p.ciudad, 'sector', p.sector, 'precio', p.precio, 'mon', p.moneda, 'porM2', p."porM2",
        'hab', p.habitaciones, 'banos', p.banos, 'parq', p.parqueos, 'm2', p.m2,
        'feat', p.caracteristicas, 'desc', p.descripcion, 'url', p."urlOriginal",
        'fecha', to_char(p."updatedAt" at time zone 'America/Santo_Domingo', 'YYYY-MM-DD'),
        'dest', p.destacada,
        'img', coalesce(p.fotos -> 0 ->> 'card', p.fotos -> 0 ->> 'url'),
        'gal', coalesce((select json_agg(f ->> 'url') from jsonb_array_elements(p.fotos) f), '[]'::json)
      ) order by p.destacada desc, p."updatedAt" desc)
      from "webProps" p
      where p.estado = 'publicada'
    ), '[]'::json)
  )
$$;

revoke all on function web_catalogo() from public;
grant execute on function web_catalogo() to anon, authenticated;

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
  clear_order text[] := array['rentals','sales','expenses','ownerReports','webProps','tenants','properties','agents','distributionConfig','settings'];
  insert_order text[] := array['settings','distributionConfig','agents','properties','tenants','webProps','ownerReports','expenses','sales','rentals'];
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

do $$ begin
  raise notice '✓ Propiedades en la web: tabla webProps, web_catalogo() y restauración actualizada.';
end $$;
