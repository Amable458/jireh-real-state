-- ============================================================
-- SEGURIDAD — PASO 2 de 2: exigir sesión válida para acceder a los datos.
-- Correr SOLO después del paso 1 y de desplegar la versión de la app que
-- envía la cabecera x-jireh-session. Si algo falla: migration_rls_rollback.sql
-- ============================================================
--
-- Antes: cualquiera con la anon key (que va en el bundle público) podía leer,
-- modificar y borrar todas las tablas sin iniciar sesión.
-- Ahora:
--   · leer / crear / editar → cualquier usuario con sesión válida
--   · borrar                → solo SuperAdmin y Admin
-- "(select ...)" hace que la función se evalúe una vez por consulta, no por fila.

do $$
declare t text;
begin
  if to_regprocedure('jireh_session_role()') is null then
    raise exception 'Falta el paso 1 (migration_rls_1_funciones.sql). No se aplicó nada.';
  end if;

  for t in select unnest(array['rentals','sales','expenses','properties','tenants','agents',
                               'distributionConfig','settings','ownerReports'])
  loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon all" on %I', t);
    execute format('drop policy if exists "sesion leer" on %I', t);
    execute format('drop policy if exists "sesion crear" on %I', t);
    execute format('drop policy if exists "sesion editar" on %I', t);
    execute format('drop policy if exists "admin borrar" on %I', t);

    execute format('create policy "sesion leer" on %I for select to anon, authenticated
                    using ((select jireh_session_role()) is not null)', t);
    execute format('create policy "sesion crear" on %I for insert to anon, authenticated
                    with check ((select jireh_session_role()) is not null)', t);
    execute format('create policy "sesion editar" on %I for update to anon, authenticated
                    using ((select jireh_session_role()) is not null)
                    with check ((select jireh_session_role()) is not null)', t);
    execute format('create policy "admin borrar" on %I for delete to anon, authenticated
                    using ((select jireh_session_role()) in (''SuperAdmin'', ''Admin''))', t);
  end loop;

  -- Bitácora: se escribe solo por la RPC log_activity (autor = la sesión).
  drop policy if exists "log select" on "activityLog";
  drop policy if exists "log insert" on "activityLog";
  drop policy if exists "sesion leer" on "activityLog";
  create policy "sesion leer" on "activityLog" for select to anon, authenticated
    using ((select jireh_session_role()) is not null);

  raise notice '✓ Paso 2 aplicado: los datos exigen sesión válida; borrar solo Admin/SuperAdmin.';
end $$;
