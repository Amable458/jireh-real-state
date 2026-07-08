-- ============================================================================
-- JIREH REAL STATE — SCRIPT MAESTRO DE BASE DE DATOS
-- ============================================================================
-- Ejecutar este ÚNICO archivo en Supabase → SQL Editor deja la base de datos
-- 100% al día: esquema, seguridad y todas las migraciones de funcionalidades.
-- Es completamente IDEMPOTENTE: se puede re-ejecutar sin dañar datos.
-- Generado a partir de los archivos individuales de /supabase.
-- ============================================================================


-- ############################################################################
-- ### SECCIÓN: schema.sql
-- ############################################################################

-- ============================================================
-- JIREH REAL STATE — Esquema de Supabase
-- Ejecutar UNA SOLA VEZ en: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- Tablas (idempotente: usa "if not exists")

create table if not exists users (
  id bigserial primary key,
  username text unique not null,
  "passHash" text,
  role text,
  "fullName" text,
  blocked smallint default 0,
  "createdAt" timestamptz default now()
);

create table if not exists agents (
  id bigserial primary key,
  name text not null,
  phone text,
  email text,
  commission numeric,
  active smallint default 1,
  notes text,
  "createdAt" timestamptz default now()
);

create table if not exists properties (
  id bigserial primary key,
  name text not null,
  type text,
  address text,
  rent numeric,
  sale numeric,
  status text,
  notes text,
  "createdAt" timestamptz default now()
);

create table if not exists tenants (
  id bigserial primary key,
  name text not null,
  phone text,
  email text,
  identification text,
  "propertyId" bigint,
  "propertyName" text,
  "contractStart" date,
  "contractEnd" date,
  "monthlyRent" numeric,
  notes text,
  "createdAt" timestamptz default now()
);

create table if not exists rentals (
  id bigserial primary key,
  year int not null,
  month int not null,
  date date,
  "propertyId" bigint,
  "propertyName" text,
  "tenantId" bigint,
  "tenantName" text,
  "agentId" bigint,
  "agentName" text,
  amount numeric,
  paid numeric,
  status text,
  notes text,
  "createdAt" timestamptz default now()
);
create index if not exists rentals_period_idx on rentals (year, month);

create table if not exists sales (
  id bigserial primary key,
  year int not null,
  month int not null,
  date date,
  "propertyId" bigint,
  "propertyName" text,
  "agentId" bigint,
  "agentName" text,
  buyer text,
  price numeric,
  commission numeric,
  notes text,
  "createdAt" timestamptz default now()
);
create index if not exists sales_period_idx on sales (year, month);

create table if not exists expenses (
  id bigserial primary key,
  year int not null,
  month int not null,
  description text,
  monthly numeric,
  q1 numeric,
  q2 numeric,
  "paymentDate" date,
  status text,
  recurring smallint default 0,
  notes text,
  "createdAt" timestamptz default now()
);
create index if not exists expenses_period_idx on expenses (year, month);

create table if not exists "distributionConfig" (
  key text primary key,
  categories jsonb,
  ahorro numeric,
  "gastosOficina" numeric,
  "bonosEquipo" numeric,
  administracion numeric,
  "updatedAt" timestamptz default now()
);

create table if not exists distributions (
  id bigserial primary key,
  "ymKey" text unique,
  year int,
  month int
);

create table if not exists "activityLog" (
  id bigserial primary key,
  ts timestamptz default now(),
  "userId" bigint,
  username text,
  action text,
  detail text
);
create index if not exists activitylog_ts_idx on "activityLog" (ts desc);

create table if not exists settings (
  key text primary key,
  "companyName" text,
  currency text,
  "contractAlertDays" int
);

-- ============================================================
-- RLS: deshabilitado en todas las tablas
-- La app usa autenticación propia (SHA-256 + tokens en localStorage)
-- por encima de la anon key de Supabase. Cualquier persona con la
-- URL+anon key (que viaja en el bundle del frontend) puede acceder.
-- Recomendado para producción: habilitar RLS + políticas, o mover
-- escrituras a Vercel Functions con service_role key.
-- ============================================================

alter table users disable row level security;
alter table agents disable row level security;
alter table properties disable row level security;
alter table tenants disable row level security;
alter table rentals disable row level security;
alter table sales disable row level security;
alter table expenses disable row level security;
alter table "distributionConfig" disable row level security;
alter table distributions disable row level security;
alter table "activityLog" disable row level security;
alter table settings disable row level security;

-- ############################################################################
-- ### SECCIÓN: security.sql
-- ############################################################################

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

-- ELIMINAR USUARIO (solo SuperAdmin)
create or replace function auth_delete_user(p_token text, target_id bigint)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare s record; target record;
begin
  s := validate_session(p_token);
  if s.user_id is null then raise exception 'Sesión no válida'; end if;
  if s.role <> 'SuperAdmin' then raise exception 'Solo SuperAdmin puede eliminar usuarios'; end if;
  if s.user_id = target_id then raise exception 'No puede eliminarse a sí mismo'; end if;

  select * into target from users where id = target_id;
  if not found then raise exception 'Usuario no existe'; end if;

  -- Evitar borrar el último SuperAdmin activo del sistema
  if target.role = 'SuperAdmin' then
    if (select count(*) from users where role = 'SuperAdmin' and blocked = 0) <= 1 then
      raise exception 'No se puede eliminar el único SuperAdmin activo';
    end if;
  end if;

  -- Invalida sus sesiones y elimina el usuario
  delete from sessions where user_id = target_id;
  delete from users where id = target_id;

  insert into "activityLog"(ts, "userId", username, action, detail)
  values (now(), s.user_id, s.username, 'user.delete', format('id=%s username=%s', target_id, target.username));
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
revoke all on function auth_delete_user(text,bigint) from public;
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
grant execute on function auth_delete_user(text,bigint) to anon, authenticated;
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

-- Tablas operativas: RLS habilitado con policy permisiva (gap conocido, ver TODO).
-- Defensivo: solo procesa tablas que existen (por si alguna fue eliminada).
do $$
declare t text;
begin
  for t in select unnest(array['rentals','sales','expenses','properties','tenants','agents','distributionConfig','settings'])
  loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
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
-- 9) ELIMINAR TABLA "distributions" (dead code, ya no se usa)
--    Idempotente: si no existe, no hace nada
-- ============================================================
do $$ begin
  if to_regclass('public.distributions') is not null then
    drop table distributions cascade;
    raise notice 'Tabla distributions eliminada (dead code)';
  end if;
end $$;

-- ============================================================
-- 10) REALTIME (sincronización en vivo entre dispositivos)
-- Agrega tablas operativas a la publicación supabase_realtime
-- ============================================================
do $$
declare t text;
begin
  for t in select unnest(array['rentals','sales','expenses','properties','tenants','agents','distributionConfig','settings','activityLog'])
  loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    begin
      execute format('alter publication supabase_realtime add table %I', t);
      raise notice 'Realtime activado en %', t;
    exception
      when duplicate_object then null;
      when others then raise notice 'No se pudo activar realtime en %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- ============================================================
-- LISTO
-- ============================================================
do $$ begin
  raise notice '✓ Hardening v2 + Realtime aplicado: sesiones server-side, lockout, password policy, FKs, CHECKs, sync en vivo.';
end $$;

-- ############################################################################
-- ### SECCIÓN: migration_ingresos.sql
-- ############################################################################

-- ============================================================
-- MIGRACIÓN: Tipos de ingreso (renta / otro) + categoría
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- ============================================================

-- kind: 'renta' | 'otro'
alter table rentals add column if not exists kind text default 'renta';

-- category: para renta = 'Renta'; para otro = 'Por contrato' |
-- 'Por administración de propiedad' | texto libre
alter table rentals add column if not exists category text default 'Renta';

-- Normaliza registros existentes (rentas previas)
update rentals set kind = 'renta' where kind is null;
update rentals set category = 'Renta' where category is null or category = '';

-- CHECK: kind solo admite los dos valores
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rentals_kind_check') then
    alter table rentals add constraint rentals_kind_check check (kind in ('renta','otro'));
  end if;
end $$;

-- ============================================================
-- Ingresos recurrentes
-- recurring: 1 = se autogenera como pendiente cada mes
-- recurringKey: identificador estable de la "serie" recurrente
-- ============================================================
alter table rentals add column if not exists recurring smallint default 0;
alter table rentals add column if not exists "recurringKey" text;

update rentals set recurring = 0 where recurring is null;

do $$ begin
  raise notice '✓ Migración de ingresos aplicada: kind, category, recurring y recurringKey listas.';
end $$;

-- ############################################################################
-- ### SECCIÓN: migration_currency.sql
-- ############################################################################

-- ============================================================
-- MIGRACIÓN: Doble moneda (DOP / USD)
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- ============================================================

-- Columnas de moneda en tablas con montos
alter table rentals  add column if not exists currency text default 'DOP';
alter table rentals  add column if not exists "exchangeRate" numeric;
alter table sales    add column if not exists currency text default 'DOP';
alter table sales    add column if not exists "exchangeRate" numeric;
alter table expenses add column if not exists currency text default 'DOP';
alter table expenses add column if not exists "exchangeRate" numeric;

-- Compatibilidad: registros existentes = DOP
update rentals  set currency = 'DOP' where currency is null;
update sales    set currency = 'DOP' where currency is null;
update expenses set currency = 'DOP' where currency is null;

-- Tasa de cambio global USD -> DOP en settings
alter table settings add column if not exists "usdToDop" numeric default 60;
update settings set "usdToDop" = 60 where "usdToDop" is null;

-- CHECK: solo DOP o USD
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rentals_currency_check') then
    alter table rentals add constraint rentals_currency_check check (currency in ('DOP','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_currency_check') then
    alter table sales add constraint sales_currency_check check (currency in ('DOP','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_currency_check') then
    alter table expenses add constraint expenses_currency_check check (currency in ('DOP','USD'));
  end if;
end $$;

do $$ begin
  raise notice '✓ Migración de doble moneda aplicada: currency, exchangeRate y tasa global usdToDop.';
end $$;

-- ############################################################################
-- ### SECCIÓN: migration_tenants.sql
-- ############################################################################

-- ============================================================
-- MIGRACIÓN: Inquilinos con moneda, % de comisión y día de cobro
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- NO borra ni modifica datos existentes — solo agrega columnas.
-- ============================================================

alter table tenants add column if not exists currency text default 'DOP';
alter table tenants add column if not exists "exchangeRate" numeric;
alter table tenants add column if not exists "commissionPercent" numeric;
alter table tenants add column if not exists "collectionDay" int default 1;

-- Compatibilidad: inquilinos existentes quedan en DOP, sin comisión configurada
update tenants set currency = 'DOP' where currency is null;
update tenants set "collectionDay" = 1 where "collectionDay" is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_currency_check') then
    alter table tenants add constraint tenants_currency_check check (currency in ('DOP','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_collection_day_check') then
    alter table tenants add constraint tenants_collection_day_check check ("collectionDay" between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_commission_check') then
    alter table tenants add constraint tenants_commission_check check ("commissionPercent" is null or ("commissionPercent" >= 0 and "commissionPercent" <= 100));
  end if;
end $$;

-- Evita duplicados de ingresos auto-generados: una sola fila por serie
-- recurrente (recurringKey) por mes, garantizado a nivel de base de datos.
create unique index if not exists rentals_recurring_month_uidx
  on rentals ("recurringKey", year, month)
  where "recurringKey" is not null;

do $$ begin
  raise notice '✓ Migración de inquilinos aplicada: currency, exchangeRate, commissionPercent, collectionDay + índice anti-duplicados.';
end $$;

-- ############################################################################
-- ### SECCIÓN: migration_renta_comision.sql
-- ############################################################################

-- ============================================================
-- MIGRACIÓN: Cobro = renta completa; comisión guardada aparte
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- NO borra datos — agrega columnas y corrige cobros pendientes.
-- ============================================================

alter table rentals add column if not exists "commissionPercent" numeric;
alter table rentals add column if not exists "commissionAmount" numeric;

-- Corrige los cobros auto-generados bajo la lógica anterior
-- (monto = comisión) para que el monto sea la renta completa
-- y la comisión quede registrada aparte.
-- Solo toca cobros PENDIENTES generados desde inquilinos.
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

do $$ begin
  raise notice '✓ Migración renta/comisión aplicada: el cobro es la renta completa y la comisión queda registrada aparte.';
end $$;

-- ############################################################################
-- ### SECCIÓN: migration_pago_propietario.sql
-- ############################################################################

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

-- ############################################################################
-- ### SECCIÓN: migration_contrato_renta.sql
-- ############################################################################

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

-- ############################################################################
-- ### SECCIÓN: migration_admin_bonus.sql
-- ############################################################################

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

-- ############################################################################
-- ### SECCIÓN: migration_fix_duplicados.sql
-- ############################################################################

-- ============================================================
-- LIMPIEZA: duplicados de renta + pagos a propietario prematuros
-- Ejecutar UNA VEZ en Supabase → SQL Editor. Idempotente.
-- Corrige la data generada por los bugs anteriores.
-- ============================================================

-- 1) Elimina rentas duplicadas de inquilino: deja una por (inquilino, mes),
--    priorizando la PAGADA; si ninguna está pagada, la de menor id.
with ranked as (
  select id,
    row_number() over (
      partition by "tenantId", year, month
      order by (case when status = 'pagado' then 0 else 1 end), id
    ) as rn
  from rentals
  where kind = 'renta' and "tenantId" is not null
)
delete from rentals where id in (select id from ranked where rn > 1);

-- 2) Restaura la clave de serie perdida (recurringKey) en las rentas de
--    inquilino que la perdieron al marcarse como pagadas.
update rentals set "recurringKey" = 'tenant_' || "tenantId"
where kind = 'renta'
  and "tenantId" is not null
  and "commissionPercent" is not null
  and ("recurringKey" is null or "recurringKey" = '');

-- 3) Elimina los "pago a propietario" cuya renta NO está pagada
--    (se generaron antes de tiempo). Ahora solo deben existir cuando
--    la renta correspondiente ya se cobró.
delete from expenses e
where e."recurringKey" like 'tenant\_owner\_%' escape '\'
  and not exists (
    select 1 from rentals r
    where r."tenantId" = replace(e."recurringKey", 'tenant_owner_', '')::bigint
      and r.year = e.year and r.month = e.month
      and r.status = 'pagado'
  );

do $$ begin
  raise notice '✓ Limpieza aplicada: duplicados de renta eliminados, recurringKey restaurado, pagos a propietario prematuros removidos.';
end $$;

-- ============================================================
-- SECCIÓN: Reparto de comisión a colegas en ventas
-- ============================================================
alter table sales add column if not exists colegas jsonb;

do $$ begin
  raise notice '✓ Colegas en ventas: sales.colegas listo.';
end $$;

do $$ begin
  raise notice '======================================================';
  raise notice '✓✓✓ MASTER.SQL COMPLETO — base de datos 100%% al día ✓✓✓';
  raise notice '======================================================';
end $$;
