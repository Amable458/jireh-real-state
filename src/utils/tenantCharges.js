import { db } from '../db/database.js';
import { fmtCur } from './currency.js';

// ============================================================
// Genera, a partir del catálogo de Inquilinos, el par mensual:
//   1) INGRESO  — cobro de la renta completa (pendiente)
//   2) GASTO    — pago al propietario = renta − comisión (pendiente)
//
// Reglas:
//  - Solo inquilinos con renta > 0 y % comisión > 0, dentro de la
//    ventana del contrato.
//  - Idempotente por mes: claves tenant_<id> (ingreso) y
//    tenant_owner_<id> (gasto), con índices únicos en BD.
//  - El gasto se crea SOLO junto con el ingreso del mes. Si el usuario
//    elimina el gasto después, NO se regenera (mientras el ingreso siga
//    existiendo). Si elimina el ingreso, el par se regenera.
// ============================================================
export async function ensureTenantCharges(year, month) {
  try {
    const [currentIncomes, currentExpenses, tenants, properties] = await Promise.all([
      db.rentals.where({ year, month }).toArray(),
      db.expenses.where({ year, month }).toArray(),
      db.tenants.toArray(),
      db.properties.toArray()
    ]);
    const incomeKeys = new Set(currentIncomes.filter((r) => r.recurringKey).map((r) => r.recurringKey));
    const expenseKeys = new Set(currentExpenses.filter((e) => e.recurringKey).map((e) => e.recurringKey));
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const lastDay = monthEnd.getDate();

    const incomes = [];
    const ownerExpenses = [];

    for (const t of tenants) {
      const rent = Number(t.monthlyRent) || 0;
      const pct = Number(t.commissionPercent) || 0;
      if (rent <= 0 || pct <= 0) continue;                 // sin % configurado → no genera
      if (incomeKeys.has(`tenant_${t.id}`)) continue;      // par ya generado este mes
      if (t.contractStart && new Date(`${t.contractStart}T00:00:00`) > monthEnd) continue;
      if (t.contractEnd && new Date(`${t.contractEnd}T00:00:00`) < monthStart) continue;

      const day = Math.min(Math.max(Number(t.collectionDay) || 1, 1), lastDay);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const ccy = t.currency === 'USD' ? 'USD' : 'DOP';
      const rate = ccy === 'USD' ? (t.exchangeRate ?? null) : null;
      const commissionAmount = Math.round(rent * pct) / 100;
      const ownerAmount = Math.round((rent - commissionAmount) * 100) / 100;
      const property = properties.find((p) => p.id === t.propertyId);
      const ownerName = (property?.owner || '').trim();
      const now = new Date().toISOString();

      incomes.push({
        year, month, kind: 'renta', category: 'Renta',
        date: dateStr,
        propertyId: t.propertyId ?? null, propertyName: t.propertyName || property?.name || '',
        tenantId: t.id, tenantName: t.name || '',
        agentId: null, agentName: '',
        amount: rent, paid: 0, status: 'pendiente',        // a cobrar: la renta completa
        commissionPercent: pct, commissionAmount,           // lo nuestro: la comisión
        currency: ccy, exchangeRate: rate,
        notes: `Renta de ${t.name} — nuestra comisión ${pct}% = ${fmtCur(commissionAmount, ccy)}`,
        recurring: 0, recurringKey: `tenant_${t.id}`,
        createdAt: now
      });

      if (ownerAmount > 0 && !expenseKeys.has(`tenant_owner_${t.id}`)) {
        ownerExpenses.push({
          year, month,
          description: `Pago a propietario${ownerName ? ` ${ownerName}` : ''} — ${property?.name || t.propertyName || `renta ${t.name}`}`,
          monthly: ownerAmount,
          q1: day <= 15 ? ownerAmount : 0,
          q2: day > 15 ? ownerAmount : 0,
          paymentDate: dateStr,
          status: 'pendiente',
          currency: ccy, exchangeRate: rate,
          recurring: 0, recurringKey: `tenant_owner_${t.id}`,
          notes: `Renta ${fmtCur(rent, ccy)} − comisión ${pct}% (${fmtCur(commissionAmount, ccy)}) — inquilino ${t.name}`,
          createdAt: now
        });
      }
    }

    if (incomes.length) {
      try { await db.rentals.bulkAdd(incomes); }
      catch (e) { console.warn('[Jireh] Generación de cobros de inquilinos:', e.message); }
    }
    // Uno por uno: un conflicto puntual (índice único) no bloquea al resto
    for (const ex of ownerExpenses) {
      try { await db.expenses.add(ex); }
      catch (e) { console.warn('[Jireh] Generación de pago a propietario:', e.message); }
    }
  } catch (e) {
    console.warn('[Jireh] ensureTenantCharges:', e.message);
  }
}
