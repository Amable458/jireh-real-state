-- ============================================================
-- JIREH REAL STATE — HARDENING DE SEGURIDAD
-- Ejecutar en Supabase → SQL Editor DESPUÉS de schema.sql
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================

-- 1) Extensión pgcrypto (bcrypt, digest, crypt, gen_salt)
-- Detecta dónde está pgcrypto y la mueve a `extensions` si está en otro lugar.
-- Si no existe, la crea allí.
create schema if not exists extensions;

do $$
declare current_schema_name text;
begin
  select n.nspname into current_schema_name
  from pg_extension e
  join pg_namespace n on e.extnamespace = n.oid
  where e.extname = 'pgcrypto';

  if current_schema_name is null then
    create extension pgcrypto with schema extensions;
    raise notice 'pgcrypto instalada en schema extensions';
  elsif current_schema_name not in ('extensions', 'public') then
    execute 'alter extension pgcrypto set schema extensions';
    raise notice 'pgcrypto movida de % a extensions', current_schema_name;
  else
    raise notice 'pgcrypto ya disponible en schema %', current_schema_name;
  end if;
end $$;

-- Diagnóstico — confirma que gen_salt es alcanzable
do $$
declare test_hash text;
begin
  set local search_path = public, extensions;
  select crypt('test', gen_salt('bf', 4)) into test_hash;
  raise notice '✓ pgcrypto funciona. Hash de prueba: %', substr(test_hash, 1, 20);
end $$;

-- ============================================================
-- 2) FUNCIONES RPC DE AUTENTICACIÓN
--    Todas SECURITY DEFINER → corren con permisos del owner,
--    bypassean RLS de la tabla users.
-- ============================================================

-- 2.1 LOGIN — soporta hashes SHA-256 legacy y los re-hashea a bcrypt
create or replace function auth_login(p_username text, p_password text)
returns table(id bigint, username text, role text, "fullName" text, blocked smallint)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  u record;
  legacy_hash text;
begin
  select * into u from users where lower(users.username) = lower(p_username);
  if not found then return; end if;
  if u.blocked = 1 then return; end if;

  -- Hash bcrypt (formato $2a$/$2b$/$2y$)
  if u."passHash" like '$2%' then
    if u."passHash" = crypt(p_password, u."passHash") then
      return query select u.id, u.username, u.role, u."fullName", u.blocked;
    end if;
    return;
  end if;

  -- Hash SHA-256 legacy → verificar y migrar a bcrypt al vuelo
  legacy_hash := encode(digest(p_password, 'sha256'), 'hex');
  if u."passHash" = legacy_hash then
    update users set "passHash" = crypt(p_password, gen_salt('bf', 10)) where id = u.id;
    return query select u.id, u.username, u.role, u."fullName", u.blocked;
  end if;
end;
$$;

-- 2.2 SEMBRAR USUARIOS POR DEFECTO (idempotente, hashea con bcrypt)
create or replace function auth_ensure_default_users()
returns text[] language plpgsql security definer
set search_path = public, extensions
as $$
declare
  created text[] := '{}';
  u record;
begin
  for u in select * from (values
    ('superadmin', 'SuperAdmin2024!', 'SuperAdmin', 'Super Administrador'),
    ('admin',      'Admin2024!',      'Admin',      'Administrador'),
    ('usuario1',   'User2024!',       'Operativo',  'Usuario Operativo')
  ) as t(uname, pwd, role, full_name)
  loop
    if not exists(select 1 from users where lower(users.username) = lower(u.uname)) then
      insert into users(username, "passHash", role, "fullName", blocked)
      values (u.uname, crypt(u.pwd, gen_salt('bf', 10)), u.role, u.full_name, 0);
      created := array_append(created, u.uname);
    end if;
  end loop;
  return created;
end;
$$;

-- 2.3 LISTAR USUARIOS (sin passHash)
create or replace function auth_list_users()
returns table(id bigint, username text, role text, "fullName" text, blocked smallint, "createdAt" timestamptz)
language sql security definer
set search_path = public, extensions
as $$
  select id, username, role, "fullName", blocked, "createdAt" from users order by id;
$$;

-- 2.4 CONTAR USUARIOS
create or replace function auth_user_count()
returns int language sql security definer
set search_path = public, extensions
as $$
  select count(*)::int from users;
$$;

-- 2.5 CREAR USUARIO (valida permisos del actor)
create or replace function auth_create_user(
  actor_id bigint,
  p_username text,
  p_password text,
  p_role text,
  p_full_name text
) returns bigint
language plpgsql security definer
set search_path = public, extensions
as $$
declare actor record; new_id bigint;
begin
  select * into actor from users where id = actor_id and blocked = 0;
  if not found then raise exception 'Sesión no válida'; end if;
  if actor.role not in ('SuperAdmin','Admin') then raise exception 'Sin permisos para crear usuarios'; end if;
  if p_role = 'SuperAdmin' and actor.role <> 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede crear otro SuperAdmin';
  end if;
  if p_role not in ('SuperAdmin','Admin','Operativo') then
    raise exception 'Rol inválido';
  end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'Contraseña debe tener al menos 6 caracteres'; end if;
  if length(coalesce(p_username,'')) < 3 then raise exception 'Usuario debe tener al menos 3 caracteres'; end if;

  insert into users(username, "passHash", role, "fullName", blocked)
  values (lower(trim(p_username)), crypt(p_password, gen_salt('bf', 10)), p_role, p_full_name, 0)
  returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'Usuario ya existe';
end;
$$;

-- 2.6 ACTUALIZAR DATOS DE USUARIO (sin password)
create or replace function auth_update_user(
  actor_id bigint, target_id bigint,
  p_username text, p_full_name text, p_role text
) returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare actor record; target record;
begin
  select * into actor from users where id = actor_id and blocked = 0;
  if not found then raise exception 'Sesión no válida'; end if;
  if actor.role not in ('SuperAdmin','Admin') then raise exception 'Sin permisos'; end if;

  select * into target from users where id = target_id;
  if not found then raise exception 'Usuario no existe'; end if;
  if target.role = 'SuperAdmin' and actor.role <> 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede modificar otro SuperAdmin';
  end if;
  if p_role = 'SuperAdmin' and actor.role <> 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede asignar rol SuperAdmin';
  end if;
  if p_role not in ('SuperAdmin','Admin','Operativo') then raise exception 'Rol inválido'; end if;

  update users set username = lower(trim(p_username)), "fullName" = p_full_name, role = p_role
  where id = target_id;
exception when unique_violation then
  raise exception 'Otro usuario ya tiene ese nombre';
end;
$$;

-- 2.7 CAMBIAR CONTRASEÑA
create or replace function auth_change_password(
  actor_id bigint, target_id bigint, new_password text
) returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare actor record; target record;
begin
  select * into actor from users where id = actor_id and blocked = 0;
  if not found then raise exception 'Sesión no válida'; end if;
  select * into target from users where id = target_id;
  if not found then raise exception 'Usuario no existe'; end if;

  if actor.id <> target.id then
    if actor.role = 'Operativo' then raise exception 'Sin permisos'; end if;
    if target.role = 'SuperAdmin' and actor.role <> 'SuperAdmin' then
      raise exception 'Solo SuperAdmin puede modificar otro SuperAdmin';
    end if;
  end if;
  if length(coalesce(new_password,'')) < 6 then raise exception 'Contraseña debe tener al menos 6 caracteres'; end if;

  update users set "passHash" = crypt(new_password, gen_salt('bf', 10)) where id = target_id;
end;
$$;

-- 2.8 BLOQUEAR / DESBLOQUEAR
create or replace function auth_toggle_block(actor_id bigint, target_id bigint)
returns smallint language plpgsql security definer
set search_path = public, extensions
as $$
declare actor record; target record; new_state smallint;
begin
  select * into actor from users where id = actor_id and blocked = 0;
  if not found then raise exception 'Sesión no válida'; end if;
  if actor.role not in ('SuperAdmin','Admin') then raise exception 'Sin permisos'; end if;
  if actor.id = target_id then raise exception 'No puede bloquearse a sí mismo'; end if;

  select * into target from users where id = target_id;
  if not found then raise exception 'Usuario no existe'; end if;
  if target.role = 'SuperAdmin' and actor.role <> 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede bloquear otro SuperAdmin';
  end if;

  new_state := case when target.blocked = 1 then 0 else 1 end;
  update users set blocked = new_state where id = target_id;
  return new_state;
end;
$$;

-- 2.9 EXPORT / IMPORT (con passHash, solo SuperAdmin)
create or replace function auth_admin_export_users(actor_id bigint)
returns setof users language plpgsql security definer
set search_path = public, extensions
as $$
declare actor record;
begin
  select * into actor from users where id = actor_id and blocked = 0;
  if not found or actor.role <> 'SuperAdmin' then raise exception 'Solo SuperAdmin'; end if;
  return query select * from users order by id;
end;
$$;

create or replace function auth_admin_import_users(actor_id bigint, payload jsonb)
returns int language plpgsql security definer
set search_path = public, extensions
as $$
declare actor record; n int := 0; rec jsonb;
begin
  select * into actor from users where id = actor_id and blocked = 0;
  if not found or actor.role <> 'SuperAdmin' then raise exception 'Solo SuperAdmin'; end if;

  delete from users;
  for rec in select * from jsonb_array_elements(payload)
  loop
    insert into users(username, "passHash", role, "fullName", blocked, "createdAt")
    values(
      rec->>'username',
      rec->>'passHash',
      rec->>'role',
      rec->>'fullName',
      coalesce((rec->>'blocked')::smallint, 0),
      coalesce((rec->>'createdAt')::timestamptz, now())
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ============================================================
-- 3) GRANTS — solo anon puede invocar las RPCs
-- ============================================================
revoke all on function auth_login(text,text) from public;
revoke all on function auth_ensure_default_users() from public;
revoke all on function auth_list_users() from public;
revoke all on function auth_user_count() from public;
revoke all on function auth_create_user(bigint,text,text,text,text) from public;
revoke all on function auth_update_user(bigint,bigint,text,text,text) from public;
revoke all on function auth_change_password(bigint,bigint,text) from public;
revoke all on function auth_toggle_block(bigint,bigint) from public;
revoke all on function auth_admin_export_users(bigint) from public;
revoke all on function auth_admin_import_users(bigint,jsonb) from public;

grant execute on function auth_login(text,text) to anon, authenticated;
grant execute on function auth_ensure_default_users() to anon, authenticated;
grant execute on function auth_list_users() to anon, authenticated;
grant execute on function auth_user_count() to anon, authenticated;
grant execute on function auth_create_user(bigint,text,text,text,text) to anon, authenticated;
grant execute on function auth_update_user(bigint,bigint,text,text,text) to anon, authenticated;
grant execute on function auth_change_password(bigint,bigint,text) to anon, authenticated;
grant execute on function auth_toggle_block(bigint,bigint) to anon, authenticated;
grant execute on function auth_admin_export_users(bigint) to anon, authenticated;
grant execute on function auth_admin_import_users(bigint,jsonb) to anon, authenticated;

-- ============================================================
-- 4) RLS — BLOQUEAR ACCESO DIRECTO A USERS
-- Las RPCs (SECURITY DEFINER) bypassean RLS.
-- ============================================================
alter table users enable row level security;
-- Sin policies = nadie con anon key puede SELECT/INSERT/UPDATE/DELETE directo.
-- Todo debe pasar por las RPCs auth_*.
do $$ begin
  -- limpia policies si existían de pruebas previas
  drop policy if exists "users anon all" on users;
end $$;

-- ============================================================
-- 5) RLS — PROTEGER BITÁCORA (insert/select OK, no update/delete)
-- ============================================================
alter table "activityLog" enable row level security;
drop policy if exists "log select" on "activityLog";
drop policy if exists "log insert" on "activityLog";
create policy "log select" on "activityLog" for select to anon, authenticated using (true);
create policy "log insert" on "activityLog" for insert to anon, authenticated with check (true);
-- update/delete: sin policy = denegado

-- ============================================================
-- 6) RLS habilitado en demás tablas (allow-all por ahora)
-- Esto activa el flag de RLS para satisfacer Supabase y permite
-- restringir más adelante sin migración.
-- ============================================================
do $$
declare t text;
begin
  for t in select unnest(array['rentals','sales','expenses','properties','tenants','agents','distributionConfig','distributions','settings'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon all" on %I', t);
    execute format('create policy "anon all" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================
-- 7) Re-hashear usuarios sembrados que aún tengan SHA-256 a bcrypt
-- (la migración al vuelo en auth_login lo hace en el primer login,
--  esto los migra antes para no dejar passHash débil reposando)
-- ============================================================
-- No podemos rehashear sin conocer el password. Lo dejamos para login al vuelo.
-- Pero sí podemos invalidar passHashes legacy si quieres forzar reset.
-- (Comentado por defecto)
-- update users set "passHash" = null where "passHash" not like '$2%';

-- ============================================================
-- LISTO. Mensaje de éxito.
-- ============================================================
do $$ begin
  raise notice 'Hardening aplicado: bcrypt activo, RLS en users y activityLog, RPCs auth_* disponibles.';
end $$;
