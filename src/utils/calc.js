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
    salesAmount: 0, commissions: 0,
    expensesAll: 0, expensesPaid: 0,
    totalIncome: 0, surplus: 0
  };
}

export async function monthlyTotals(year, month) {
  const [rentals, sales, expenses] = await Promise.all([
    db.rentals.where({ year, month }).toArray(),
    db.sales.where({ year, month }).toArray(),
    db.expenses.where({ year, month }).toArray()
  ]);
  const rate = await getGlobalRate();

  const cur = { DOP: blankAgg(), USD: blankAgg() };  // montos en su moneda nativa
  const base = blankAgg();                            // todo convertido a DOP

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
    cur[c].salesAmount += Number(s.price) || 0;
    cur[c].commissions += Number(s.commission) || 0;
    base.salesAmount += toBase(s.price, s, rate);
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

  for (const c of ['DOP', 'USD']) {
    cur[c].totalIncome = cur[c].rentalsPaid + cur[c].rentalsPartial + cur[c].salesAmount;
    // Balance real: solo cuenta lo que YA se pagó. Un gasto pendiente (ej.
    // recién generado a inicio de mes) no debe descuadrar el balance hasta
    // que efectivamente se pague.
    cur[c].surplus = cur[c].totalIncome - cur[c].expensesPaid;
  }
  base.totalIncome = base.rentalsPaid + base.rentalsPartial + base.salesAmount;
  base.surplus = base.totalIncome - base.expensesPaid;

  // Campos planos = consolidado a DOP (compatibilidad con Distribución y Bonificaciones)
  return {
    rentals, sales, expenses, rate,
    cur,
    ...base
  };
}

export async function yearMonthlySeries(year) {
  const result = [];
  for (let m = 1; m <= 12; m++) {
    const t = await monthlyTotals(year, m);
    result.push({
      month: m,
      // "expenses" en la gráfica = gastos PAGADOS, para que coincida con
      // el excedente (Ingresos - Gastos pagados = Excedente).
      dop: { income: t.cur.DOP.totalIncome, expenses: t.cur.DOP.expensesPaid, surplus: t.cur.DOP.surplus },
      usd: { income: t.cur.USD.totalIncome, expenses: t.cur.USD.expensesPaid, surplus: t.cur.USD.surplus },
      base: { income: t.totalIncome, expenses: t.expensesPaid, surplus: t.surplus }
    });
  }
  return result;
}

export async function calcBonuses(year, month) {
  const cfg = await db.distributionConfig.get('default');
  const t = await monthlyTotals(year, month);
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
  const agents = await db.agents.toArray();
  const byAgent = Array.from(byAgentMap.values()).map((x) => {
    const a = agents.find((g) => g.id === x.agentId);
    const bonus = totalRentals > 0 ? (pool * x.count) / totalRentals : 0;
    return { ...x, agentName: a?.name || 'Desconocido', bonus };
  });
  return { pool, totalRentals, byAgent, surplus: t.surplus, bonusPercent };
}

export { applyDistribution } from './distribution.js';
