import { db } from '../db/database.js';
import { fmtCur } from './currency.js';

// ============================================================
// Generación mensual a partir del catálogo de Inquilinos.
//
// Modelo:
//  1) INGRESO de renta (pendiente) → se genera cada mes.
//     Idempotente por (tenantId, mes): un inquilino = una renta/mes.
//  2) GASTO "pago a propietario" → NO se genera junto con la renta.
//     Solo nace cuando la renta se marca PAGADA (ya cobré, ahora le
//     debo al dueño). Eso se maneja con onRentalStatusChange().
//
//  cleanupOwnerPayments() elimina gastos de propietario cuya renta
//  esté pendiente o ya no exista (limpia generaciones viejas/huérfanas).
// ============================================================

const OWNER_KEY = (tenantId) => `tenant_owner_${tenantId}`;
const RENT_KEY = (tenantId) => `tenant_${tenantId}`;

// 1) Genera los ingresos de renta pendientes del mes
export async function ensureTenantIncomes(year, month) {
  try {
    const [current, tenants, properties] = await Promise.all([
      db.rentals.where({ year, month }).toArray(),
      db.tenants.toArray(),
      db.properties.toArray()
    ]);
    // Idempotencia robusta: si ya hay una renta de ese inquilino este mes
    // (sin importar su recurringKey o estado), no se genera otra.
    const existingTenantIds = new Set(
      current.filter((r) => (r.kind || 'renta') === 'renta' && r.tenantId).map((r) => r.tenantId)
    );
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const lastDay = monthEnd.getDate();

    const toCreate = [];
    for (const t of tenants) {
      const rent = Number(t.monthlyRent) || 0;
      const pct = Number(t.commissionPercent) || 0;
      if (rent <= 0 || pct <= 0) continue;
      if (existingTenantIds.has(t.id)) continue;
      if (t.contractStart && new Date(`${t.contractStart}T00:00:00`) > monthEnd) continue;
      if (t.contractEnd && new Date(`${t.contractEnd}T00:00:00`) < monthStart) continue;

      const day = Math.min(Math.max(Number(t.collectionDay) || 1, 1), lastDay);
      const ccy = t.currency === 'USD' ? 'USD' : 'DOP';
      const rate = ccy === 'USD' ? (t.exchangeRate ?? null) : null;
      const commissionAmount = Math.round(rent * pct) / 100;
      const property = properties.find((p) => p.id === t.propertyId);
      toCreate.push({
        year, month, kind: 'renta', category: 'Renta',
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        propertyId: t.propertyId ?? null, propertyName: t.propertyName || property?.name || '',
        tenantId: t.id, tenantName: t.name || '',
        agentId: null, agentName: '',
        amount: rent, paid: 0, status: 'pendiente',
        commissionPercent: pct, commissionAmount,
        currency: ccy, exchangeRate: rate,
        notes: `Renta de ${t.name} — nuestra comisión ${pct}% = ${fmtCur(commissionAmount, ccy)}`,
        recurring: 0, recurringKey: RENT_KEY(t.id),
        createdAt: new Date().toISOString()
      });
    }
    if (toCreate.length) {
      try { await db.rentals.bulkAdd(toCreate); }
      catch (e) { console.warn('[Jireh] Generación de cobros de inquilinos:', e.message); }
    }
  } catch (e) {
    console.warn('[Jireh] ensureTenantIncomes:', e.message);
  }
}

// 2) Elimina gastos de propietario cuya renta no esté pagada (o no exista).
//    NO crea gastos — la creación es por evento (al marcar la renta pagada).
export async function cleanupOwnerPayments(year, month) {
  try {
    const [rentals, expenses] = await Promise.all([
      db.rentals.where({ year, month }).toArray(),
      db.expenses.where({ year, month }).toArray()
    ]);
    const paidTenantIds = new Set(
      rentals.filter((r) => r.tenantId && r.status === 'pagado').map((r) => r.tenantId)
    );
    const ownerExpenses = expenses.filter((e) => (e.recurringKey || '').startsWith('tenant_owner_'));
    for (const e of ownerExpenses) {
      const tenantId = Number((e.recurringKey || '').replace('tenant_owner_', ''));
      if (!paidTenantIds.has(tenantId)) {
        try { await db.expenses.delete(e.id); }
        catch (err) { console.warn('[Jireh] Limpieza pago propietario:', err.message); }
      }
    }
  } catch (e) {
    console.warn('[Jireh] cleanupOwnerPayments:', e.message);
  }
}

// Crea el gasto "pago a propietario" para una renta que acaba de cobrarse.
// Idempotente por recurringKey tenant_owner_<id> + índice único en BD.
export async function createOwnerPayment(rental) {
  try {
    if (!rental?.tenantId) return;
    const commission = rental.commissionAmount != null
      ? Number(rental.commissionAmount)
      : (Number(rental.amount) || 0) * (Number(rental.commissionPercent) || 0) / 100;
    const ownerAmount = Math.round(((Number(rental.amount) || 0) - commission) * 100) / 100;
    if (ownerAmount <= 0) return;

    const key = OWNER_KEY(rental.tenantId);
    const existing = await db.expenses.where({ year: rental.year, month: rental.month }).toArray();
    if (existing.some((e) => e.recurringKey === key)) return; // ya existe

    const properties = await db.properties.toArray();
    const property = properties.find((p) => p.id === rental.propertyId);
    const ownerName = (property?.owner || '').trim();
    const ccy = rental.currency === 'USD' ? 'USD' : 'DOP';
    const day = Number(String(rental.date || '').slice(8, 10)) || 1;

    await db.expenses.add({
      year: rental.year, month: rental.month,
      description: `Pago a propietario${ownerName ? ` ${ownerName}` : ''} — ${property?.name || rental.propertyName || `renta ${rental.tenantName}`}`,
      monthly: ownerAmount,
      q1: day <= 15 ? ownerAmount : 0,
      q2: day > 15 ? ownerAmount : 0,
      paymentDate: rental.date,
      status: 'pendiente',
      currency: ccy, exchangeRate: rental.exchangeRate ?? null,
      recurring: 0, recurringKey: key,
      notes: `Renta ${fmtCur(rental.amount, ccy)} − comisión ${fmtCur(commission, ccy)} — inquilino ${rental.tenantName}`,
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[Jireh] createOwnerPayment:', e.message);
  }
}

// Elimina el gasto de propietario de una renta (cuando deja de estar pagada)
export async function removeOwnerPayment(rental) {
  try {
    if (!rental?.tenantId) return;
    const key = OWNER_KEY(rental.tenantId);
    const existing = await db.expenses.where({ year: rental.year, month: rental.month }).toArray();
    for (const e of existing) {
      if (e.recurringKey === key) {
        try { await db.expenses.delete(e.id); } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.warn('[Jireh] removeOwnerPayment:', e.message);
  }
}

// Reacciona al cambio de estado de una renta de inquilino.
export async function onRentalStatusChange(rental, prevStatus) {
  if (!rental?.tenantId) return;
  const nowPaid = rental.status === 'pagado';
  const wasPaid = prevStatus === 'pagado';
  if (nowPaid && !wasPaid) await createOwnerPayment(rental);
  else if (!nowPaid && wasPaid) await removeOwnerPayment(rental);
}

// Elimina rentas auto-generadas (y sus pagos a propietario) de inquilinos
// que YA NO existen. Solo borra las PENDIENTES — las pagadas son historial real.
export async function cleanupOrphanRentals(year, month) {
  try {
    const [rentals, tenants] = await Promise.all([
      db.rentals.where({ year, month }).toArray(),
      db.tenants.toArray()
    ]);
    const tenantIds = new Set(tenants.map((t) => t.id));
    for (const r of rentals) {
      const key = r.recurringKey || '';
      if (!key.startsWith('tenant_') || key.startsWith('tenant_owner_')) continue;
      const tid = Number(key.replace('tenant_', ''));
      if (tenantIds.has(tid)) continue;       // el inquilino aún existe
      if (r.status === 'pagado') continue;    // renta pagada = historial, se conserva
      try {
        await db.rentals.delete(r.id);
        await removeOwnerPayment({ ...r, tenantId: tid });
      } catch (err) { console.warn('[Jireh] Limpieza renta huérfana:', err.message); }
    }
  } catch (e) {
    console.warn('[Jireh] cleanupOrphanRentals:', e.message);
  }
}

// Borra en cascada las rentas pendientes y pagos a propietario de un inquilino
// que se está eliminando. Las rentas pagadas se conservan como historial.
export async function deleteTenantCharges(tenantId) {
  try {
    const key = RENT_KEY(tenantId);
    const ownerKey = OWNER_KEY(tenantId);
    const [rentals, expenses] = await Promise.all([
      db.rentals.where('recurringKey').equals(key).toArray(),
      db.expenses.where('recurringKey').equals(ownerKey).toArray()
    ]);
    for (const r of rentals) {
      if (r.status !== 'pagado') { try { await db.rentals.delete(r.id); } catch { /* ignore */ } }
    }
    for (const e of expenses) {
      try { await db.expenses.delete(e.id); } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn('[Jireh] deleteTenantCharges:', e.message);
  }
}

// Wrapper para las páginas: limpia huérfanas, genera pendientes, limpia pagos.
export async function ensureTenantCharges(year, month) {
  await cleanupOrphanRentals(year, month);
  await ensureTenantIncomes(year, month);
  await cleanupOwnerPayments(year, month);
}
