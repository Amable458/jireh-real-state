import { db } from '../db/database.js';
import { getBonusPercent } from './distribution.js';

export async function monthlyTotals(year, month) {
  const [rentals, sales, expenses] = await Promise.all([
    db.rentals.where({ year, month }).toArray(),
    db.sales.where({ year, month }).toArray(),
    db.expenses.where({ year, month }).toArray()
  ]);
  const rentalsPaid = rentals.filter((r) => r.status === 'pagado').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const rentalsPartial = rentals.filter((r) => r.status === 'parcial').reduce((s, r) => s + (Number(r.paid) || 0), 0);
  const rentalsPending = rentals.filter((r) => r.status === 'pendiente').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const salesAmount = sales.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const commissions = sales.reduce((s, r) => s + (Number(r.commission) || 0), 0);
  const expensesPaid = expenses.filter((e) => e.status === 'pagado').reduce((s, e) => s + (Number(e.monthly) || 0), 0);
  const expensesAll = expenses.reduce((s, e) => s + (Number(e.monthly) || 0), 0);
  const totalIncome = rentalsPaid + rentalsPartial + salesAmount;
  const surplus = totalIncome - expensesAll;
  return {
    rentals, sales, expenses,
    rentalsPaid, rentalsPartial, rentalsPending,
    salesAmount, commissions,
    expensesPaid, expensesAll,
    totalIncome, surplus
  };
}

export async function yearMonthlySeries(year) {
  const result = [];
  for (let m = 1; m <= 12; m++) {
    const t = await monthlyTotals(year, m);
    result.push({ month: m, income: t.totalIncome, expenses: t.expensesAll, surplus: t.surplus });
  }
  return result;
}

export async function calcBonuses(year, month) {
  const cfg = await db.distributionConfig.get('default');
  const t = await monthlyTotals(year, month);
  const bonusPercent = getBonusPercent(cfg);
  if (!cfg || t.surplus <= 0) return { pool: 0, totalRentals: 0, byAgent: [], surplus: t.surplus, bonusPercent };
  const pool = (t.surplus * bonusPercent) / 100;
  const closed = t.rentals.filter((r) => r.status === 'pagado' || r.status === 'parcial');
  const byAgentMap = new Map();
  for (const r of closed) {
    if (!r.agentId) continue;
    const cur = byAgentMap.get(r.agentId) || { agentId: r.agentId, count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(r.amount) || 0;
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

// Re-export para compatibilidad
export { applyDistribution } from './distribution.js';
