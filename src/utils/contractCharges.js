import { db } from '../db/database.js';
import { fmtCur } from './currency.js';
import { normalizeFees, CONTRATO_CATEGORY } from './contractFees.js';

// ============================================================
// Cuentas por pagar del "Contrato de renta".
// Al COBRAR un ingreso de categoría "Contrato de renta", se generan
// gastos pendientes (uno por concepto del desglose). El residual
// (monto − suma) es el ingreso real de la empresa.
//
// Espejo del patrón de "pago a propietario" (tenantCharges.js).
// recurringKey = contract_<incomeId>_<index> → índice único en BD.
// ============================================================

const CONTRACT_PREFIX = 'contract_';
const CONTRACT_KEY = (incomeId, index) => `${CONTRACT_PREFIX}${incomeId}_${index}`;

export const isContractIncome = (rec) =>
  (rec?.kind || 'renta') === 'otro' && rec?.category === CONTRATO_CATEGORY;

// Crea las cuentas por pagar de un contrato ya cobrado. Idempotente.
export async function createContractPayables(income, fees) {
  try {
    if (!income?.id) return;
    const list = normalizeFees(fees);
    if (list.length === 0) return;

    const existing = await db.expenses.where({ year: income.year, month: income.month }).toArray();
    const existingKeys = new Set(existing.filter((e) => e.recurringKey).map((e) => e.recurringKey));
    const ccy = income.currency === 'USD' ? 'USD' : 'DOP';
    const day = Number(String(income.date || '').slice(8, 10)) || 1;

    const toCreate = [];
    list.forEach((f, i) => {
      const amount = Number(f.amount) || 0;
      if (amount <= 0) return;
      const key = CONTRACT_KEY(income.id, i);
      if (existingKeys.has(key)) return;
      toCreate.push({
        year: income.year, month: income.month,
        description: `Contrato — ${f.label}`,
        monthly: amount,
        q1: day <= 15 ? amount : 0,
        q2: day > 15 ? amount : 0,
        paymentDate: income.date,
        status: 'pendiente',
        currency: ccy, exchangeRate: income.exchangeRate ?? null,
        recurring: 0, recurringKey: key,
        notes: `Cuenta por pagar de contrato — ${income.category}${income.propertyName ? ` (${income.propertyName})` : ''}`,
        createdAt: new Date().toISOString()
      });
    });
    for (const e of toCreate) {
      try { await db.expenses.add(e); }
      catch (err) { console.warn('[Jireh] createContractPayables:', err.message); }
    }
  } catch (e) {
    console.warn('[Jireh] createContractPayables:', e.message);
  }
}

// Elimina todas las cuentas por pagar de un ingreso de contrato
export async function removeContractPayables(income) {
  try {
    if (!income?.id) return;
    const prefix = `${CONTRACT_PREFIX}${income.id}_`;
    const existing = await db.expenses.where({ year: income.year, month: income.month }).toArray();
    for (const e of existing) {
      if ((e.recurringKey || '').startsWith(prefix)) {
        try { await db.expenses.delete(e.id); } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.warn('[Jireh] removeContractPayables:', e.message);
  }
}

// Reacciona al cambio de estado del ingreso de contrato
export async function onContractIncomeStatusChange(income, prevStatus, fees) {
  const nowPaid = income.status === 'pagado';
  const wasPaid = prevStatus === 'pagado';
  if (nowPaid && !wasPaid) await createContractPayables(income, fees);
  else if (!nowPaid && wasPaid) await removeContractPayables(income);
}

// Limpia cuentas por pagar cuyo ingreso ya no exista o no esté pagado.
export async function cleanupContractPayables(year, month) {
  try {
    const [rentals, expenses] = await Promise.all([
      db.rentals.where({ year, month }).toArray(),
      db.expenses.where({ year, month }).toArray()
    ]);
    const paidContractIds = new Set(
      rentals.filter((r) => r.category === CONTRATO_CATEGORY && r.status === 'pagado').map((r) => r.id)
    );
    const payables = expenses.filter((e) => (e.recurringKey || '').startsWith(CONTRACT_PREFIX));
    for (const e of payables) {
      // recurringKey = contract_<incomeId>_<index>
      const incomeId = Number((e.recurringKey || '').split('_')[1]);
      if (!paidContractIds.has(incomeId)) {
        try { await db.expenses.delete(e.id); }
        catch (err) { console.warn('[Jireh] Limpieza cuenta por pagar contrato:', err.message); }
      }
    }
  } catch (e) {
    console.warn('[Jireh] cleanupContractPayables:', e.message);
  }
}
