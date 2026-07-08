import { db } from '../db/database.js';
import { fmtCur } from './currency.js';

// ============================================================
// Reparto de comisión de una venta entre colegas.
// Cada colega recibe un % de la comisión → se genera un gasto
// pendiente (cuenta por pagar) en la moneda de la venta.
// El residual (comisión − suma de colegas) queda para la inmobiliaria.
//
// recurringKey = sale_colega_<saleId>_<colegaId>  (índice único en BD)
// ============================================================

const PREFIX = 'sale_colega_';
const KEY = (saleId, colegaId) => `${PREFIX}${saleId}_${colegaId}`;

export const makeColegaId = () => `c_${Math.random().toString(36).slice(2, 8)}`;

export const normalizeColegas = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && c.name != null)
    .map((c) => ({
      id: c.id || makeColegaId(),
      name: String(c.name || ''),
      percent: Number(c.percent) || 0
    }));
};

export const colegasTotalPercent = (list) =>
  normalizeColegas(list).reduce((s, c) => s + (Number(c.percent) || 0), 0);

export const colegasTotalAmount = (list, commission) =>
  normalizeColegas(list).reduce((s, c) => s + Math.round((Number(commission) || 0) * (Number(c.percent) || 0)) / 100, 0);

// Sincroniza las cuentas por pagar a colegas de una venta.
// Crea/actualiza pendientes; respeta las ya pagadas; elimina las de
// colegas removidos (solo si están pendientes).
export async function syncSaleColegaPayables(sale) {
  try {
    if (!sale?.id) return;
    const colegas = normalizeColegas(sale.colegas);
    const commission = Number(sale.commission) || 0;
    const ccy = sale.currency === 'USD' ? 'USD' : 'DOP';
    const day = Number(String(sale.date || '').slice(8, 10)) || 1;

    const existing = await db.expenses.where({ year: sale.year, month: sale.month }).toArray();
    const mine = existing.filter((e) => (e.recurringKey || '').startsWith(`${PREFIX}${sale.id}_`));
    const byKey = new Map(mine.map((e) => [e.recurringKey, e]));
    const wantedKeys = new Set();

    for (const c of colegas) {
      const amount = Math.round(commission * (Number(c.percent) || 0)) / 100;
      if (amount <= 0) continue;
      const key = KEY(sale.id, c.id);
      wantedKeys.add(key);
      const ex = byKey.get(key);
      const description = `Comisión colega — ${c.name}${sale.propertyName ? ` (${sale.propertyName})` : ''}`;
      const notes = `${c.percent}% de comisión ${fmtCur(commission, ccy)} — venta a ${sale.buyer || ''}`;
      if (!ex) {
        try {
          await db.expenses.add({
            year: sale.year, month: sale.month,
            description, monthly: amount,
            q1: day <= 15 ? amount : 0, q2: day > 15 ? amount : 0,
            paymentDate: sale.date, status: 'pendiente',
            currency: ccy, exchangeRate: sale.exchangeRate ?? null,
            recurring: 0, recurringKey: key, notes,
            createdAt: new Date().toISOString()
          });
        } catch (e) { console.warn('[Jireh] colega add:', e.message); }
      } else if (ex.status !== 'pagado' && (Number(ex.monthly) !== amount || ex.description !== description)) {
        try {
          await db.expenses.update(ex.id, {
            description, monthly: amount,
            q1: day <= 15 ? amount : 0, q2: day > 15 ? amount : 0, notes
          });
        } catch (e) { console.warn('[Jireh] colega update:', e.message); }
      }
    }
    // Eliminar cuentas de colegas removidos (solo pendientes)
    for (const e of mine) {
      if (!wantedKeys.has(e.recurringKey) && e.status !== 'pagado') {
        try { await db.expenses.delete(e.id); } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.warn('[Jireh] syncSaleColegaPayables:', e.message);
  }
}

// Elimina todas las cuentas por pagar a colegas de una venta
export async function removeSaleColegaPayables(sale) {
  try {
    if (!sale?.id) return;
    const prefix = `${PREFIX}${sale.id}_`;
    const existing = await db.expenses.where({ year: sale.year, month: sale.month }).toArray();
    for (const e of existing) {
      if ((e.recurringKey || '').startsWith(prefix)) {
        try { await db.expenses.delete(e.id); } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.warn('[Jireh] removeSaleColegaPayables:', e.message);
  }
}

// Limpia cuentas por pagar cuya venta ya no exista
export async function cleanupOrphanSaleColegas(year, month) {
  try {
    const [sales, expenses] = await Promise.all([
      db.sales.where({ year, month }).toArray(),
      db.expenses.where({ year, month }).toArray()
    ]);
    const saleIds = new Set(sales.map((s) => s.id));
    const payables = expenses.filter((e) => (e.recurringKey || '').startsWith(PREFIX));
    for (const e of payables) {
      const saleId = Number((e.recurringKey || '').split('_')[2]);
      if (!saleIds.has(saleId)) {
        try { await db.expenses.delete(e.id); } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.warn('[Jireh] cleanupOrphanSaleColegas:', e.message);
  }
}
