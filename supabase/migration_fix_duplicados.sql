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
