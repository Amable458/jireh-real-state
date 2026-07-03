import { db } from '../db/database.js';
import { fmtCur } from './currency.js';

// ============================================================
// Bono mensual de administración por inquilino: cada colaborador
// asignado como "administrador/responsable" de un inquilino recibe
// un monto fijo (config: settings.adminBonusPerTenant) por cada
// inquilino que administra ese mes.
//
// Se genera UN gasto pendiente por colaborador (no uno por inquilino),
// recalculado automáticamente mientras esté pendiente: si sube o baja
// la cantidad de inquilinos asignados, el monto total se ajusta solo.
// Una vez marcado PAGADO, se deja de tocar (es historial real).
// ============================================================

const KEY = (managerId) => `admin_bonus_${managerId}`;
const PREFIX = 'admin_bonus_';

// Cuenta, para un mes dado, cuántos inquilinos activos (dentro de la
// ventana de contrato) tiene asignados cada managerId.
function countActiveTenantsByManager(tenants, year, month) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const byManager = new Map(); // managerId -> { count, managerName }

  for (const t of tenants) {
    if (!t.managerId) continue;
    if (t.contractStart && new Date(`${t.contractStart}T00:00:00`) > monthEnd) continue;
    if (t.contractEnd && new Date(`${t.contractEnd}T00:00:00`) < monthStart) continue;
    const cur = byManager.get(t.managerId) || { count: 0, managerName: t.managerName || '' };
    cur.count += 1;
    if (!cur.managerName && t.managerName) cur.managerName = t.managerName;
    byManager.set(t.managerId, cur);
  }
  return byManager;
}

// Genera/actualiza/elimina el gasto pendiente de bono por colaborador,
// según cuántos inquilinos administra activamente este mes.
export async function ensureAdminBonuses(year, month) {
  try {
    const [tenants, expenses] = await Promise.all([
      db.tenants.toArray(),
      db.expenses.where({ year, month }).toArray()
    ]);

    const s = await db.settings.get('app');
    const perTenant = Number(s?.adminBonusPerTenant) || 0;

    const byManager = countActiveTenantsByManager(tenants, year, month);
    const existingByKey = new Map(
      expenses.filter((e) => (e.recurringKey || '').startsWith(PREFIX)).map((e) => [e.recurringKey, e])
    );

    // Crear / actualizar / eliminar por cada colaborador con historial este mes
    const managerIds = new Set([...byManager.keys(), ...Array.from(existingByKey.keys(), (k) => Number(k.replace(PREFIX, '')))]);

    for (const managerId of managerIds) {
      const key = KEY(managerId);
      const existing = existingByKey.get(key);
      const info = byManager.get(managerId);
      const count = info?.count || 0;
      const amount = Math.round(count * perTenant * 100) / 100;

      if (existing && existing.status === 'pagado') continue; // historial: no tocar

      if (count === 0 || perTenant <= 0 || amount <= 0) {
        // Ya no administra a nadie (o no hay tarifa) → eliminar pendiente
        if (existing) {
          try { await db.expenses.delete(existing.id); } catch (e) { console.warn('[Jireh] adminBonus delete:', e.message); }
        }
        continue;
      }

      const managerName = info?.managerName || existing?.managerName || 'Colaborador';
      const description = `Bono administración — ${managerName} (${count} inquilino${count === 1 ? '' : 's'} administrado${count === 1 ? '' : 's'})`;
      const notes = `${count} × ${fmtCur(perTenant, 'DOP')} por inquilino administrado`;

      if (!existing) {
        try {
          await db.expenses.add({
            year, month,
            description, monthly: amount,
            q1: amount, q2: 0,
            paymentDate: `${year}-${String(month).padStart(2, '0')}-01`,
            status: 'pendiente',
            currency: 'DOP', exchangeRate: null,
            recurring: 0, recurringKey: key,
            notes,
            createdAt: new Date().toISOString()
          });
        } catch (e) { console.warn('[Jireh] adminBonus create:', e.message); }
      } else if (existing.monthly !== amount || existing.description !== description) {
        // Recalcula mientras siga pendiente (ej. cambió el # de inquilinos o la tarifa)
        try {
          await db.expenses.update(existing.id, {
            description, monthly: amount, q1: amount, q2: 0, notes
          });
        } catch (e) { console.warn('[Jireh] adminBonus update:', e.message); }
      }
    }
  } catch (e) {
    console.warn('[Jireh] ensureAdminBonuses:', e.message);
  }
}
