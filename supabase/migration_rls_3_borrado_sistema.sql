-- ============================================================
-- SEGURIDAD — PASO 3: permitir que el SISTEMA limpie lo que él mismo genera.
-- Correr después del paso 2. Idempotente.
-- ============================================================
--
-- El paso 2 dejó el borrado solo a SuperAdmin/Admin. Pero la app también
-- borra automáticamente, en nombre de quien esté conectado:
--   · al desmarcar una renta pagada → quita el "pago a propietario" generado
--   · al quitar un colega de una venta → quita su cuenta por pagar
--   · la limpieza mensual → rentas huérfanas, bonos que ya no aplican
-- Con un usuario Operativo esos borrados se rechazaban EN SILENCIO (RLS no da
-- error: borra 0 filas) y quedaban gastos pendientes sin sentido.
--
-- Regla: cualquier sesión válida puede borrar SOLO registros generados por el
-- sistema (identificados por su recurringKey). Lo que registra una persona
-- sigue siendo borrable únicamente por SuperAdmin/Admin.

drop policy if exists "admin borrar" on expenses;
create policy "admin borrar" on expenses for delete to anon, authenticated
  using (
    (select jireh_session_role()) in ('SuperAdmin', 'Admin')
    or (
      (select jireh_session_role()) is not null
      and (
           "recurringKey" like 'tenant\_owner\_%'   -- pago a propietario
        or "recurringKey" like 'admin\_bonus\_%'    -- bono de administración
        or "recurringKey" like 'contract\_%'        -- desglose de contrato de renta
        or "recurringKey" like 'sale\_colega\_%'    -- reparto de comisión a colegas
      )
    )
  );

drop policy if exists "admin borrar" on rentals;
create policy "admin borrar" on rentals for delete to anon, authenticated
  using (
    (select jireh_session_role()) in ('SuperAdmin', 'Admin')
    or (
      (select jireh_session_role()) is not null
      -- renta automática de inquilino, y solo si no está pagada
      and "recurringKey" like 'tenant\_%'
      and "recurringKey" not like 'tenant\_owner\_%'
      and coalesce(status, '') <> 'pagado'
    )
  );

do $$ begin
  raise notice '✓ Paso 3 aplicado: el sistema puede limpiar sus propios registros; lo manual sigue solo para Admin/SuperAdmin.';
end $$;
