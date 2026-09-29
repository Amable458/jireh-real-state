-- ============================================================
-- SEGURIDAD — PASO 1 de 2: funciones y avisos en tiempo real.
-- ADITIVO: no cambia ningún permiso. La app sigue funcionando igual.
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- ============================================================

-- Rol del usuario dueño de la sesión que viene en la cabecera x-jireh-session
-- (la añade el cliente en cada petición). Null si no hay sesión válida.
-- Solo lectura a propósito: las políticas RLS se evalúan también en consultas
-- de solo lectura, así que no puede reutilizar validate_session (que escribe).
create or replace function jireh_session_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select u.role
  from sessions s
  join users u on u.id = s.user_id
  where s.token = (nullif(current_setting('request.headers', true), '')::json ->> 'x-jireh-session')
    and s.expires_at > now()
    and coalesce(u.blocked, 0) <> 1
  limit 1
$$;

revoke all on function jireh_session_role() from public;
grant execute on function jireh_session_role() to anon, authenticated;

-- Diagnóstico: ¿la base de datos reconoce mi sesión? Devuelve rol y usuario.
create or replace function jireh_whoami()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object('role', u.role, 'username', u.username)
  from sessions s
  join users u on u.id = s.user_id
  where s.token = (nullif(current_setting('request.headers', true), '')::json ->> 'x-jireh-session')
    and s.expires_at > now()
    and coalesce(u.blocked, 0) <> 1
  limit 1
$$;

revoke all on function jireh_whoami() from public;
grant execute on function jireh_whoami() to anon, authenticated;

-- Bitácora: el autor lo decide la SESIÓN, no el cliente. Sin sesión válida
-- no registra nada (y no falla).
create or replace function log_activity(p_action text, p_detail text default '')
returns void
language plpgsql security definer
set search_path = public
as $$
declare v record;
begin
  select u.id, u.username into v
  from sessions s
  join users u on u.id = s.user_id
  where s.token = (nullif(current_setting('request.headers', true), '')::json ->> 'x-jireh-session')
    and s.expires_at > now()
    and coalesce(u.blocked, 0) <> 1
  limit 1;

  if not found then return; end if;

  insert into "activityLog"(ts, "userId", username, action, detail)
  values (now(), v.id, v.username, left(coalesce(p_action, ''), 80), left(coalesce(p_detail, ''), 500));
end $$;

revoke all on function log_activity(text, text) from public;
grant execute on function log_activity(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Restauración de respaldo TODO O NADA (una sola transacción).
-- Antes el navegador borraba e insertaba tabla por tabla: si algo fallaba a
-- mitad quedaban tablas vacías, se perdían los id originales (rentals.tenantId
-- y demás quedaban apuntando a la nada) y el orden rompía las claves foráneas.
-- Aquí: borra hijos antes que padres, inserta padres antes que hijos, conserva
-- los id y ajusta los contadores. Cualquier error revierte todo.
-- ------------------------------------------------------------
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
  clear_order text[] := array['rentals','sales','expenses','ownerReports','tenants','properties','agents','distributionConfig','settings'];
  insert_order text[] := array['settings','distributionConfig','agents','properties','tenants','ownerReports','expenses','sales','rentals'];
begin
  if jireh_session_role() is distinct from 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede restaurar respaldos.';
  end if;

  -- Solo se tocan las tablas que vienen en el archivo
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

      -- Los id se insertaron tal cual: subir el contador por encima del máximo
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

-- ------------------------------------------------------------
-- Tiempo real SIN datos: cada cambio emite solo el nombre de la tabla por el
-- canal público "jireh-db"; la app vuelve a leer por la vía protegida.
-- (postgres_changes dejará de emitir cuando las tablas exijan sesión.)
-- Un fallo al emitir NUNCA bloquea la escritura.
-- ------------------------------------------------------------
create or replace function jireh_broadcast_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'changed', 'jireh-db', false);
  exception when others then
    null;
  end;
  return null;
end $$;

do $$
declare t text;
declare has_send boolean := to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null;
begin
  if not has_send then
    raise notice '⚠ realtime.send no existe en este proyecto: triggers NO instalados (avísale a Claude).';
    return;
  end if;
  for t in select unnest(array['rentals','sales','expenses','properties','tenants','agents',
                               'distributionConfig','settings','ownerReports','activityLog'])
  loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('drop trigger if exists jireh_broadcast on %I', t);
    execute format('create trigger jireh_broadcast after insert or update or delete on %I
                    for each statement execute function jireh_broadcast_change()', t);
  end loop;
  raise notice '✓ Paso 1 aplicado: jireh_session_role, jireh_whoami, log_activity, jireh_restore y avisos en tiempo real.';
end $$;
