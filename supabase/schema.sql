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
