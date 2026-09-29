-- ============================================================
-- RETROCESO del paso 2: vuelve a las políticas abiertas anteriores.
-- Úsalo SOLO si tras el paso 2 la app deja de mostrar datos. Deja la base
-- como estaba (abierta); las funciones del paso 1 se conservan, no molestan.
-- ============================================================
do $$
declare t text;
begin
  for t in select unnest(array['rentals','sales','expenses','properties','tenants','agents',
                               'distributionConfig','settings','ownerReports'])
  loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('drop policy if exists "sesion leer" on %I', t);
    execute format('drop policy if exists "sesion crear" on %I', t);
    execute format('drop policy if exists "sesion editar" on %I', t);
    execute format('drop policy if exists "admin borrar" on %I', t);
    execute format('drop policy if exists "anon all" on %I', t);
    execute format('create policy "anon all" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;

  drop policy if exists "sesion leer" on "activityLog";
  drop policy if exists "log select" on "activityLog";
  drop policy if exists "log insert" on "activityLog";
  create policy "log select" on "activityLog" for select to anon, authenticated using (true);
  create policy "log insert" on "activityLog" for insert to anon, authenticated with check (true);

  raise notice '↩ Retroceso aplicado: políticas abiertas restauradas.';
end $$;
