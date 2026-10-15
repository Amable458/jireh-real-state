-- ============================================================
-- GASTOS POR QUINCENAS: estado y fecha de pago de cada quincena.
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra datos.
-- ============================================================
--
-- Antes un gasto tenía un solo estado (pendiente | pagado): al pagar la 1ª
-- quincena el gasto entero quedaba pagado. Ahora cada quincena con monto tiene
-- su propio estado, y el estado del gasto se deriva:
--   ninguna pagada → pendiente · una de dos → parcial · todas → pagado
--
-- Las columnas NO tienen valor por defecto a propósito: un gasto sin estado por
-- quincena (null) se interpreta con su `status` de siempre. Así cualquier
-- registro que solo escriba `status` sigue funcionando igual que antes.

alter table expenses add column if not exists "q1Paid" boolean;
alter table expenses add column if not exists "q2Paid" boolean;
alter table expenses add column if not exists "q1PaidAt" date;
alter table expenses add column if not exists "q2PaidAt" date;
alter table expenses add column if not exists "revisarQuincenas" boolean not null default false;

-- El estado de un gasto admitía solo pagado | pendiente: se añade «parcial»
-- (una quincena pagada y la otra no), igual que ya existe en ingresos.
alter table expenses drop constraint if exists expenses_status_check;
alter table expenses add constraint expenses_status_check
  check (status in ('pagado', 'pendiente', 'parcial'));

-- Relleno de lo existente (solo filas que aún no tienen estado por quincena)
update expenses set
  "q1Paid"   = case when status = 'pagado' then coalesce(q1, 0) > 0 or (coalesce(q1,0) = 0 and coalesce(q2,0) = 0) else false end,
  "q2Paid"   = case when status = 'pagado' then coalesce(q2, 0) > 0 else false end,
  "q1PaidAt" = case when status = 'pagado' and (coalesce(q1,0) > 0 or (coalesce(q1,0) = 0 and coalesce(q2,0) = 0)) then "paymentDate" end,
  "q2PaidAt" = case when status = 'pagado' and coalesce(q2, 0) > 0 then "paymentDate" end
where "q1Paid" is null and "q2Paid" is null;

-- Decisión del usuario (15-oct-2026): junio–septiembre quedan pagados
-- completos; los gastos DIVIDIDOS de octubre 2026 marcados como pagados quedan
-- «a confirmar» para revisar qué quincena se pagó realmente. No cambian los
-- totales hasta que alguien los confirme.
update expenses set "revisarQuincenas" = true
where year = 2026 and month = 10
  and status = 'pagado'
  and coalesce(q1, 0) > 0 and coalesce(q2, 0) > 0
  and "revisarQuincenas" = false;

do $$
declare n_rev int; n_par int;
begin
  select count(*) into n_rev from expenses where "revisarQuincenas";
  select count(*) into n_par from expenses where coalesce(q1,0) > 0 and coalesce(q2,0) > 0;
  raise notice '✓ Quincenas: % gastos divididos en dos quincenas; % marcados «a confirmar».', n_par, n_rev;
end $$;
