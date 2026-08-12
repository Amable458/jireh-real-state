import { db } from '../db/database.js';
import { getBonusPercent } from './distribution.js';
import { recCurrency, toBase, DEFAULT_RATE } from './currency.js';

async function getGlobalRate() {
  try {
    const s = await db.settings.get('app');
    return Number(s?.usdToDop) || DEFAULT_RATE;
  } catch {
    return DEFAULT_RATE;
  }
}

function blankAgg() {
  return {
    rentalsPaid: 0, rentalsPartial: 0, rentalsPending: 0,
    // salesVolume = precio de las propiedades vendidas. Es un indicador de
    // actividad comercial, NO un ingreso (ver nota en totalIncome).
    salesVolume: 0,
    // commissions = lo que realmente factura la inmobiliaria por esas ventas.
    commissions: 0,
    expensesAll: 0, expensesPaid: 0,
    totalIncome: 0, surplus: 0
  };
}

// ------------------------------------------------------------------
// Agrega registros ya filtrados por periodo. Función pura: no toca la BD,
// así el resumen mensual y el anual comparten exactamente la misma lógica.
// ------------------------------------------------------------------
function aggregate(rentals, sales, expenses, rate) {
  const cur = { DOP: blankAgg(), USD: blankAgg() }; // montos en su moneda nativa
  const base = blankAgg();                          // todo convertido a DOP

  for (const r of rentals) {
    const c = recCurrency(r);
    if (r.status === 'pagado') {
      cur[c].rentalsPaid += Number(r.amount) || 0;
      base.rentalsPaid += toBase(r.amount, r, rate);
    } else if (r.status === 'parcial') {
      cur[c].rentalsPartial += Number(r.paid) || 0;
      base.rentalsPartial += toBase(r.paid, r, rate);
    } else {
      cur[c].rentalsPending += Number(r.amount) || 0;
      base.rentalsPending += toBase(r.amount, r, rate);
    }
  }

  for (const s of sales) {
    const c = recCurrency(s);
    cur[c].salesVolume += Number(s.price) || 0;
    cur[c].commissions += Number(s.commission) || 0;
    base.salesVolume += toBase(s.price, s, rate);
    base.commissions += toBase(s.commission, s, rate);
  }

  for (const e of expenses) {
    const c = recCurrency(e);
    cur[c].expensesAll += Number(e.monthly) || 0;
    base.expensesAll += toBase(e.monthly, e, rate);
    if (e.status === 'pagado') {
      cur[c].expensesPaid += Number(e.monthly) || 0;
      base.expensesPaid += toBase(e.monthly, e, rate);
    }
  }

  // ----------------------------------------------------------------
  // INGRESO REAL DE LA INMOBILIARIA — las rentas y las ventas NO se tratan
  // igual, y la diferencia es intencional:
  //
  // • Rentas: entra el monto COMPLETO porque el dinero sí pasa por nosotros.
  //   Cobramos al inquilino y después le pagamos al propietario; ese pago se
  //   registra como gasto automático al momento de cobrar
  //   (ver tenantCharges.createOwnerPayment). Neto = nuestra comisión.
  //
  // • Ventas: entra SOLO la comisión. El precio de la propiedad va del
  //   comprador al vendedor directamente y nunca toca nuestras cuentas, así
  //   que contarlo como ingreso inflaba el dashboard, la distribución de
  //   fondos y las bonificaciones. El reparto con colegas ya se descuenta
  //   aparte como gasto (ver saleColegas.syncSaleColegaPayables).
  //
  // salesVolume queda disponible como dato informativo de volumen vendido.
  // ----------------------------------------------------------------
  for (const c of ['DOP', 'USD']) {
    cur[c].totalIncome = cur[c].rentalsPaid + cur[c].rentalsPartial + cur[c].commissions;
    // Balance real: solo cuenta lo que YA se pagó. Un gasto pendiente (ej.
    // recién generado a inicio de mes) no debe descuadrar el balance hasta
    // que efectivamente se pague.
    cur[c].surplus = cur[c].totalIncome - cur[c].expensesPaid;
  }
  base.totalIncome = base.rentalsPaid + base.rentalsPartial + base.commissions;
  base.surplus = base.totalIncome - base.expensesPaid;

  // Campos planos = consolidado a DOP (compatibilidad con Distribución y Bonificaciones)
  return { rentals, sales, expenses, rate, cur, ...base };
}

export async function monthlyTotals(year, month) {
  const [rentals, sales, expenses, rate] = await Promise.all([
    db.rentals.where({ year, month }).toArray(),
    db.sales.where({ year, month }).toArray(),
    db.expenses.where({ year, month }).toArray(),
    getGlobalRate()
  ]);
  return aggregate(rentals, sales, expenses, rate);
}

// ------------------------------------------------------------------
// Totales de los 12 meses del año en 3 consultas + 1 lectura de tasa.
// Antes esto se resolvía llamando monthlyTotals() doce veces, lo que
// disparaba ~52 consultas secuenciales a Supabase cada vez que se abría el
// dashboard. Ahora se trae el año completo y se agrupa por mes en memoria.
// ------------------------------------------------------------------
export async function yearTotals(year) {
  const [rentals, sales, expenses, rate] = await Promise.all([
    db.rentals.where({ year }).toArray(),
    db.sales.where({ year }).toArray(),
    db.expenses.where({ year }).toArray(),
    getGlobalRate()
  ]);

  const bucket = (rows) => {
    const months = Array.from({ length: 12 }, () => []);
    for (const r of rows) {
      const i = (Number(r.month) || 0) - 1;
      if (i >= 0 && i < 12) months[i].push(r);
    }
    return months;
  };

  const rentalsBy = bucket(rentals);
  const salesBy = bucket(sales);
  const expensesBy = bucket(expenses);

  return Array.from({ length: 12 }, (_, i) =>
    aggregate(rentalsBy[i], salesBy[i], expensesBy[i], rate)
  );
}

export function seriesFromYear(months) {
  return months.map((t, i) => ({
    month: i + 1,
    // "expenses" en la gráfica = gastos PAGADOS, para que coincida con
    // el excedente (Ingresos - Gastos pagados = Excedente).
    dop: { income: t.cur.DOP.totalIncome, expenses: t.cur.DOP.expensesPaid, surplus: t.cur.DOP.surplus },
    usd: { income: t.cur.USD.totalIncome, expenses: t.cur.USD.expensesPaid, surplus: t.cur.USD.surplus },
    base: { income: t.totalIncome, expenses: t.expensesPaid, surplus: t.surplus }
  }));
}

export async function yearMonthlySeries(year) {
  return seriesFromYear(await yearTotals(year));
}

// ------------------------------------------------------------------
// Parte pura del cálculo de bonificaciones: recibe los totales ya
// calculados en vez de volver a pedirlos. Permite que Reportes procese
// doce meses con una sola lectura del año en vez de una por mes.
// ------------------------------------------------------------------
export function bonusesFrom(t, cfg, agents) {
  const bonusPercent = getBonusPercent(cfg);
  // El pool se calcula sobre el excedente consolidado en DOP
  if (!cfg || t.surplus <= 0) return { pool: 0, totalRentals: 0, byAgent: [], surplus: t.surplus, bonusPercent };
  const pool = (t.surplus * bonusPercent) / 100;
  // Solo rentas reales (no "otros" ingresos) cuentan como cierres de agente
  const closed = t.rentals.filter((r) =>
    (r.kind || 'renta') === 'renta' && (r.status === 'pagado' || r.status === 'parcial')
  );
  const byAgentMap = new Map();
  for (const r of closed) {
    if (!r.agentId) continue;
    const cur = byAgentMap.get(r.agentId) || { agentId: r.agentId, count: 0, amount: 0 };
    cur.count += 1;
    // Monto generado convertido a DOP para comparar peras con peras
    cur.amount += toBase(r.amount, r, t.rate);
    byAgentMap.set(r.agentId, cur);
  }
  const totalRentals = Array.from(byAgentMap.values()).reduce((s, x) => s + x.count, 0);
  const byAgent = Array.from(byAgentMap.values()).map((x) => {
    const a = agents.find((g) => g.id === x.agentId);
    const bonus = totalRentals > 0 ? (pool * x.count) / totalRentals : 0;
    return { ...x, agentName: a?.name || 'Desconocido', bonus };
  });
  return { pool, totalRentals, byAgent, surplus: t.surplus, bonusPercent };
}

export async function calcBonuses(year, month) {
  const [cfg, t, agents] = await Promise.all([
    db.distributionConfig.get('default'),
    monthlyTotals(year, month),
    db.agents.toArray()
  ]);
  return bonusesFrom(t, cfg, agents);
}

export { applyDistribution } from './distribution.js';
