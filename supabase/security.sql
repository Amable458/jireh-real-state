-- ============================================================
-- JIREH REAL STATE — HARDENING DE SEGURIDAD v2
-- Ejecutar en Supabase → SQL Editor DESPUÉS de schema.sql
-- Idempotente: se puede re-ejecutar sin problema.
-- ============================================================

-- 1) Extensión pgcrypto
create schema if not exists extensions;
do $$
declare current_schema_name text;
begin
  select n.nspname into current_schema_name
  from pg_extension e join pg_namespace n on e.extnamespace = n.oid
  where e.extname = 'pgcrypto';

  if current_schema_name is null then
    create extension pgcrypto with schema extensions;
  elsif current_schema_name not in ('extensions', 'public') then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end $$;

-- ============================================================
-- 2) TABLAS DE SEGURIDAD
-- ============================================================

-- Sesiones server-side (reemplaza el JWT simulado)
create table if not exists sessions (
  token text primary key,
  user_id bigint not null,
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  last_used_at timestamptz default now(),
  user_agent text,
  ip text
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

-- Intentos de login (para lockout)
create table if not exists login_attempts (
  id bigserial primary key,
  username text not null,
  success boolean not null,
  attempted_at timestamptz default now(),
  ip text
);
create index if not exists login_attempts_user_time_idx on login_attempts (lower(username), attempted_at desc);

-- ============================================================
-- 3) HELPERS DE SEGURIDAD
-- ============================================================

-- Genera un token criptográficamente fuerte (64 chars hex)
create or replace function gen_session_token() returns text
language sql security definer
set search_path = public, extensions
as $$
  select encode(gen_random_bytes(32), 'hex');
$$;

-- Verifica complejidad de contraseña
-- Reglas: 8+ chars, mayúscula, minúscula, dígito
create or replace function validate_password_policy(p_password text) returns void
language plpgsql immutable
as $$
begin
  if p_password is null or length(p_password) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;
  if p_password !~ '[A-Z]' then
    raise exception 'La contraseña debe contener al menos una mayúscula';
  end if;
  if p_password !~ '[a-z]' then
    raise exception 'La contraseña debe contener al menos una minúscula';
  end if;
  if p_password !~ '[0-9]' then
    raise exception 'La contraseña debe contener al menos un dígito';
  end if;
end $$;

-- Valida un token de sesión. Retorna user info o null.
create or replace function validate_session(p_token text)
returns table(user_id bigint, username text, role text, "fullName" text)
language plpgsql security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare s record;
begin
  if p_token is null or length(p_token) < 16 then return; end if;

  select s2.user_id, u.username, u.role, u."fullName", u.blocked, s2.expires_at
    into s
  from sessions s2 join users u on u.id = s2.user_id
  where s2.token = p_token;

  if not found then return; end if;
  if s.expires_at < now() then
    delete from sessions where token = p_token;
    return;
  end if;
  if s.blocked = 1 then
    delete from sessions where token = p_token;
    return;
  end if;

  -- Actualiza last_used
  update sessions set last_used_at = now() where token = p_token;

  return query select s.user_id, s.username, s.role, s."fullName";
end $$;

-- ============================================================
-- 4) AUTH RPCs
-- ============================================================

-- LOGIN con lockout + creación de sesión
-- Retorna: token de sesión + datos de usuario, o lanza excepción si falla
create or replace function auth_login(p_username text, p_password text, p_remember boolean default false)
returns table(
  token text,
  user_id bigint,
  username text,
  role text,
  "fullName" text,
  expires_at timestamptz
)
language plpgsql security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  u record;
  legacy_hash text;
  failed_count int;
  new_token text;
  ttl interval;
  expires timestamptz;
  ok boolean := false;
begin
  -- Sanitizar
  p_username := lower(trim(coalesce(p_username, '')));
  if p_username = '' or coalesce(p_password, '') = '' then
    raise exception 'Usuario y contraseña son requeridos';
  end if;

  -- Lockout: ≥5 fallos en últimos 15 min
  select count(*) into failed_count
  from login_attempts
  where lower(username) = p_username
    and success = false
    and attempted_at > now() - interval '15 minutes';

  if failed_count >= 5 then
    insert into login_attempts(username, success) values (p_username, false);
    raise exception 'Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intente de nuevo en 15 minutos.';
  end if;

  -- Buscar usuario
  select * into u from users where lower(users.username) = p_username;
  if not found then
    insert into login_attempts(username, success) values (p_username, false);
    raise exception 'Credenciales inválidas';
  end if;
  if u.blocked = 1 then
    insert into login_attempts(username, success) values (p_username, false);
    raise exception 'Usuario bloqueado';
  end if;

  -- Verificar password
  if u."passHash" like '$2%' then
    ok := (u."passHash" = crypt(p_password, u."passHash"));
  else
    -- Legacy SHA-256
    legacy_hash := encode(digest(p_password, 'sha256'), 'hex');
    ok := (u."passHash" = legacy_hash);
    if ok then
      -- Re-hashea a bcrypt
      update users set "passHash" = crypt(p_password, gen_salt('bf', 10)) where id = u.id;
    end if;
  end if;

  if not ok then
    insert into login_attempts(username, success) values (p_username, false);
    raise exception 'Credenciales inválidas';
  end if;

  -- Limpiar attempts fallidos de este usuario
  delete from login_attempts where lower(username) = p_username and success = false;
  insert into login_attempts(username, success) values (p_username, true);

  -- Crear sesión
  new_token := gen_session_token();
  ttl := case when p_remember then interval '30 days' else interval '8 hours' end;
  expires := now() + ttl;

  insert into sessions(token, user_id, expires_at) values (new_token, u.id, expires);

  -- Limpieza oportunista de sesiones expiradas
  delete from sessions where expires_at < now();

  return query select new_token, u.id, u.username, u.role, u."fullName", expires;
end $$;

-- LOGOUT
create or replace function auth_logout(p_token text) returns void
language sql security definer
set search_path = public, extensions
as $$
  delete from sessions where token = p_token;
$$;

-- VALIDAR SESIÓN (para refresh al cargar la app)
create or replace function auth_validate(p_token text)
returns table(user_id bigint, username text, role text, "fullName" text)
language sql security definer
set search_path = public, extensions
as $$
  select * from validate_session(p_token);
$$;

-- ENSURE USUARIOS POR DEFECTO
create or replace function auth_ensure_default_users()
returns text[] language plpgsql security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
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
end $$;

-- LISTAR USUARIOS (sin passHash)
create or replace function auth_list_users(p_token text)
returns table(id bigint, username text, role text, "fullName" text, blocked smallint, "createdAt" timestamptz)
language plpgsql security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare s record;
begin
  s := validate_session(p_token);
  if s.user_id is null then raise exception 'Sesión no válida'; end if;
  return query select u.id, u.username, u.role, u."fullName", u.blocked, u."createdAt" from users u order by u.id;
end $$;

-- CONTAR USUARIOS (no requiere sesión — necesario para diagnóstico de login)
create or replace function auth_user_count() returns int
language sql security definer
set search_path = public, extensions
as $$
  select count(*)::int from users;
$$;

-- CREAR USUARIO
create or replace function auth_create_user(
  p_token text, p_username text, p_password text, p_role text, p_full_name text
) returns bigint
language plpgsql security definer
set search_path = public, extensions
as $$
declare s record; new_id bigint;
begin
  s := validate_session(p_token);
  if s.user_id is null then raise exception 'Sesión no válida'; end if;
  if s.role not in ('SuperAdmin','Admin') then raise exception 'Sin permisos para crear usuarios'; end if;
  if p_role = 'SuperAdmin' and s.role <> 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede crear otro SuperAdmin';
  end if;
  if p_role not in ('SuperAdmin','Admin','Operativo') then raise exception 'Rol inválido'; end if;
  if length(coalesce(p_username,'')) < 3 then raise exception 'Usuario debe tener al menos 3 caracteres'; end if;

  perform validate_password_policy(p_password);

  insert into users(username, "passHash", role, "fullName", blocked)
  values (lower(trim(p_username)), crypt(p_password, gen_salt('bf', 10)), p_role, p_full_name, 0)
  returning id into new_id;

  insert into "activityLog"(ts, "userId", username, action, detail)
  values (now(), s.user_id, s.username, 'user.create', format('id=%s role=%s', new_id, p_role));

  return new_id;
exception when unique_violation then raise exception 'Usuario ya existe';
end $$;

-- ACTUALIZAR USUARIO
create or replace function auth_update_user(
  p_token text, target_id bigint,
  p_username text, p_full_name text, p_role text
) returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare s record; target record;
begin
  s := validate_session(p_token);
  if s.user_id is null then raise exception 'Sesión no válida'; end if;
  if s.role not in ('SuperAdmin','Admin') then raise exception 'Sin permisos'; end if;

  select * into target from users where id = target_id;
  if not found then raise exception 'Usuario no existe'; end if;
  if target.role = 'SuperAdmin' and s.role <> 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede modificar otro SuperAdmin';
  end if;
  if p_role = 'SuperAdmin' and s.role <> 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede asignar rol SuperAdmin';
  end if;
  if p_role not in ('SuperAdmin','Admin','Operativo') then raise exception 'Rol inválido'; end if;

  update users set username = lower(trim(p_username)), "fullName" = p_full_name, role = p_role
  where id = target_id;

  insert into "activityLog"(ts, "userId", username, action, detail)
  values (now(), s.user_id, s.username, 'user.update', format('id=%s', target_id));
exception when unique_violation then raise exception 'Otro usuario ya tiene ese nombre';
end $$;

-- CAMBIAR CONTRASEÑA
create or replace function auth_change_password(
  p_token text, target_id bigint, new_password text
) returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare s record; target record;
begin
  s := validate_session(p_token);
  if s.user_id is null then raise exception 'Sesión no válida'; end if;
  select * into target from users where id = target_id;
  if not found then raise exception 'Usuario no existe'; end if;

  if s.user_id <> target.id then
    if s.role = 'Operativo' then raise exception 'Sin permisos'; end if;
    if target.role = 'SuperAdmin' and s.role <> 'SuperAdmin' then
      raise exception 'Solo SuperAdmin puede modificar otro SuperAdmin';
    end if;
  end if;

  perform validate_password_policy(new_password);

  update users set "passHash" = crypt(new_password, gen_salt('bf', 10)) where id = target_id;

  -- Invalida todas las sesiones del usuario (forzar re-login)
  delete from sessions where user_id = target_id;

  insert into "activityLog"(ts, "userId", username, action, detail)
  values (now(), s.user_id, s.username, 'user.passwd', format('id=%s', target_id));
end $$;

-- BLOQUEAR / DESBLOQUEAR
create or replace function auth_toggle_block(p_token text, target_id bigint)
returns smallint
language plpgsql security definer
set search_path = public, extensions
as $$
declare s record; target record; new_state smallint;
begin
  s := validate_session(p_token);
  if s.user_id is null then raise exception 'Sesión no válida'; end if;
  if s.role not in ('SuperAdmin','Admin') then raise exception 'Sin permisos'; end if;
  if s.user_id = target_id then raise exception 'No puede bloquearse a sí mismo'; end if;

  select * into target from users where id = target_id;
  if not found then raise exception 'Usuario no existe'; end if;
  if target.role = 'SuperAdmin' and s.role <> 'SuperAdmin' then
    raise exception 'Solo SuperAdmin puede bloquear otro SuperAdmin';
  end if;

  new_state := case when target.blocked = 1 then 0 else 1 end;
  update users set blocked = new_state where id = target_id;

  -- Si lo bloquea, invalida sus sesiones
  if new_state = 1 then delete from sessions where user_id = target_id; end if;

  insert into "activityLog"(ts, "userId", username, action, detail)
  values (now(), s.user_id, s.username,
          case when new_state = 1 then 'user.block' else 'user.unblock' end,
          format('id=%s', target_id));

  return new_state;
end $$;

-- EXPORT / IMPORT (solo SuperAdmin)
create or replace function auth_admin_export_users(p_token text)
returns setof users language plpgsql security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare s record;
begin
  s := validate_session(p_token);
  if s.user_id is null or s.role <> 'SuperAdmin' then raise exception 'Solo SuperAdmin'; end if;
  return query select * from users order by id;
end $$;

create or replace function auth_admin_import_users(p_token text, payload jsonb)
returns int language plpgsql security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare s record; n int := 0; rec jsonb;
begin
  s := validate_session(p_token);
  if s.user_id is null or s.role <> 'SuperAdmin' then raise exception 'Solo SuperAdmin'; end if;

  -- No borra el propio SuperAdmin para no perder acceso
  delete from users where id <> s.user_id;
  for rec in select * from jsonb_array_elements(payload)
  loop
    if (rec->>'id')::bigint = s.user_id then continue; end if;
    insert into users(username, "passHash", role, "fullName", blocked, "createdAt")
    values(
      rec->>'username',
      rec->>'passHash',
      rec->>'role',
      rec->>'fullName',
      coalesce((rec->>'blocked')::smallint, 0),
      coalesce((rec->>'createdAt')::timestamptz, now())
    )
    on conflict (username) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============================================================
-- 5) PURGA DE BITÁCORA (llamar manualmente o vía cron)
-- ============================================================
create or replace function purge_activity_log(p_token text, p_days_keep int default 90)
returns int language plpgsql security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare s record; deleted_count int;
begin
  s := validate_session(p_token);
  if s.user_id is null or s.role <> 'SuperAdmin' then raise exception 'Solo SuperAdmin'; end if;
  if p_days_keep < 7 then raise exception 'Mínimo 7 días de retención'; end if;

  with d as (
    delete from "activityLog" where ts < now() - (p_days_keep || ' days')::interval returning 1
  ) select count(*)::int into deleted_count from d;

  insert into "activityLog"(ts, "userId", username, action, detail)
  values (now(), s.user_id, s.username, 'log.purge', format('borrados=%s keep=%s días', deleted_count, p_days_keep));
  return deleted_count;
end $$;

-- ============================================================
-- 6) GRANTS
-- ============================================================
revoke all on function auth_login(text,text,boolean) from public;
revoke all on function auth_logout(text) from public;
revoke all on function auth_validate(text) from public;
revoke all on function auth_ensure_default_users() from public;
revoke all on function auth_user_count() from public;
revoke all on function auth_list_users(text) from public;
revoke all on function auth_create_user(text,text,text,text,text) from public;
revoke all on function auth_update_user(text,bigint,text,text,text) from public;
revoke all on function auth_change_password(text,bigint,text) from public;
revoke all on function auth_toggle_block(text,bigint) from public;
revoke all on function auth_admin_export_users(text) from public;
revoke all on function auth_admin_import_users(text,jsonb) from public;
revoke all on function purge_activity_log(text,int) from public;

grant execute on function auth_login(text,text,boolean) to anon, authenticated;
grant execute on function auth_logout(text) to anon, authenticated;
grant execute on function auth_validate(text) to anon, authenticated;
grant execute on function auth_ensure_default_users() to anon, authenticated;
grant execute on function auth_user_count() to anon, authenticated;
grant execute on function auth_list_users(text) to anon, authenticated;
grant execute on function auth_create_user(text,text,text,text,text) to anon, authenticated;
grant execute on function auth_update_user(text,bigint,text,text,text) to anon, authenticated;
grant execute on function auth_change_password(text,bigint,text) to anon, authenticated;
grant execute on function auth_toggle_block(text,bigint) to anon, authenticated;
grant execute on function auth_admin_export_users(text) to anon, authenticated;
grant execute on function auth_admin_import_users(text,jsonb) to anon, authenticated;
grant execute on function purge_activity_log(text,int) to anon, authenticated;

-- ============================================================
-- 7) RLS — TABLAS SENSIBLES
-- ============================================================

-- users: SOLO via RPCs
alter table users enable row level security;
drop policy if exists "users anon all" on users;

-- sessions: SOLO via RPCs
alter table sessions enable row level security;
drop policy if exists "sessions anon all" on sessions;

-- login_attempts: SOLO via RPCs (escritura desde auth_login security definer)
alter table login_attempts enable row level security;
drop policy if exists "login_attempts anon all" on login_attempts;

-- activityLog: SELECT/INSERT permitidos para que la app pueda registrar acciones
alter table "activityLog" enable row level security;
drop policy if exists "log select" on "activityLog";
drop policy if exists "log insert" on "activityLog";
create policy "log select" on "activityLog" for select to anon, authenticated using (true);
create policy "log insert" on "activityLog" for insert to anon, authenticated with check (true);
-- UPDATE/DELETE: bloqueados (sin policy)

-- Tablas operativas: RLS habilitado con policy permisiva (gap conocido, ver TODO)
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
-- 8) INTEGRIDAD REFERENCIAL Y CHECK CONSTRAINTS
-- ============================================================

-- Foreign keys (ON DELETE SET NULL para no perder historial)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rentals_property_fk') then
    alter table rentals add constraint rentals_property_fk
      foreign key ("propertyId") references properties(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rentals_tenant_fk') then
    alter table rentals add constraint rentals_tenant_fk
      foreign key ("tenantId") references tenants(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rentals_agent_fk') then
    alter table rentals add constraint rentals_agent_fk
      foreign key ("agentId") references agents(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_property_fk') then
    alter table sales add constraint sales_property_fk
      foreign key ("propertyId") references properties(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_agent_fk') then
    alter table sales add constraint sales_agent_fk
      foreign key ("agentId") references agents(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_property_fk') then
    alter table tenants add constraint tenants_property_fk
      foreign key ("propertyId") references properties(id) on delete set null;
  end if;
end $$;

-- CHECK constraints
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rentals_amount_check') then
    alter table rentals add constraint rentals_amount_check check (amount >= 0 and paid >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rentals_status_check') then
    alter table rentals add constraint rentals_status_check check (status in ('pagado','pendiente','parcial'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rentals_period_check') then
    alter table rentals add constraint rentals_period_check check (year between 2000 and 2200 and month between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_amount_check') then
    alter table sales add constraint sales_amount_check check (price >= 0 and commission >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_period_check') then
    alter table sales add constraint sales_period_check check (year between 2000 and 2200 and month between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_amount_check') then
    alter table expenses add constraint expenses_amount_check check (monthly >= 0 and q1 >= 0 and q2 >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_status_check') then
    alter table expenses add constraint expenses_status_check check (status in ('pagado','pendiente'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_period_check') then
    alter table expenses add constraint expenses_period_check check (year between 2000 and 2200 and month between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_role_check') then
    alter table users add constraint users_role_check check (role in ('SuperAdmin','Admin','Operativo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_status_check') then
    alter table properties add constraint properties_status_check check (status in ('disponible','rentado','vendido') or status is null);
  end if;
end $$;

-- ============================================================
-- 9) ELIMINAR TABLA "distributions" (dead code)
-- ============================================================
drop table if exists distributions cascade;

-- ============================================================
-- LISTO
-- ============================================================
do $$ begin
  raise notice '✓ Hardening v2 aplicado: sesiones server-side, lockout, password policy, FKs, CHECKs.';
end $$;
