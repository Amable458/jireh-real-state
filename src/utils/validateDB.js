import { db, rpcListUsers, rpcUserCount } from '../db/database.js';
import { normalizeConfig, SYSTEM_BONUS_ID } from './distribution.js';

// Audita la base de datos local y devuelve un reporte de inconsistencias.
export async function validateDB() {
  const issues = [];
  const stats = {};

  // 1) Tablas y conteos (users via RPC porque tiene RLS strict)
  const tables = ['rentals', 'sales', 'expenses', 'properties', 'tenants', 'agents', 'distributionConfig', 'distributions', 'activityLog', 'settings'];
  try {
    stats.users = await rpcUserCount();
  } catch (e) {
    issues.push({ level: 'error', table: 'users', message: `No se pudo contar usuarios: ${e.message}` });
    stats.users = -1;
  }
  for (const t of tables) {
    try {
      stats[t] = await db.table(t).count();
    } catch (e) {
      issues.push({ level: 'error', table: t, message: `No se pudo leer la tabla: ${e.message}` });
      stats[t] = -1;
    }
  }

  // 2) Usuarios (via RPC, no expone passHash)
  const users = await rpcListUsers();
  if (users.length === 0) {
    issues.push({ level: 'error', table: 'users', message: 'No hay usuarios en la BD. Use "Restablecer usuarios por defecto" en el login.' });
  }
  const superAdmins = users.filter((u) => u.role === 'SuperAdmin' && !u.blocked);
  if (superAdmins.length === 0) {
    issues.push({ level: 'error', table: 'users', message: 'No hay ningún SuperAdmin activo. Se perderá acceso a configuración.' });
  }
  users.forEach((u) => {
    if (!['SuperAdmin', 'Admin', 'Operativo'].includes(u.role)) issues.push({ level: 'warning', table: 'users', message: `Usuario "${u.username}" con rol desconocido: ${u.role}` });
  });

  // 3) Configuración de distribución
  const cfgRaw = await db.distributionConfig.get('default');
  if (!cfgRaw) {
    issues.push({ level: 'error', table: 'distributionConfig', message: 'Falta la configuración de distribución por defecto.' });
  } else {
    const cfg = normalizeConfig(cfgRaw);
    const sum = cfg.categories.reduce((s, c) => s + (Number(c.percent) || 0), 0);
    if (Math.abs(sum - 100) > 0.001) {
      issues.push({ level: 'warning', table: 'distributionConfig', message: `Los porcentajes suman ${sum}% (deberían sumar 100%).` });
    }
    if (!cfg.categories.some((c) => c.id === SYSTEM_BONUS_ID)) {
      issues.push({ level: 'error', table: 'distributionConfig', message: 'Falta la categoría protegida "Bonos equipo".' });
    }
  }

  // 4) Integridad referencial
  const properties = await db.properties.toArray();
  const tenants = await db.tenants.toArray();
  const agents = await db.agents.toArray();
  const propIds = new Set(properties.map((p) => p.id));
  const tenantIds = new Set(tenants.map((t) => t.id));
  const agentIds = new Set(agents.map((a) => a.id));

  const rentals = await db.rentals.toArray();
  let orphanRentalProps = 0, orphanRentalTenants = 0, orphanRentalAgents = 0;
  rentals.forEach((r) => {
    if (r.propertyId && !propIds.has(r.propertyId)) orphanRentalProps++;
    if (r.tenantId && !tenantIds.has(r.tenantId)) orphanRentalTenants++;
    if (r.agentId && !agentIds.has(r.agentId)) orphanRentalAgents++;
  });
  if (orphanRentalProps) issues.push({ level: 'warning', table: 'rentals', message: `${orphanRentalProps} renta(s) referencian propiedades eliminadas.` });
  if (orphanRentalTenants) issues.push({ level: 'warning', table: 'rentals', message: `${orphanRentalTenants} renta(s) referencian inquilinos eliminados.` });
  if (orphanRentalAgents) issues.push({ level: 'warning', table: 'rentals', message: `${orphanRentalAgents} renta(s) referencian agentes eliminados.` });

  const sales = await db.sales.toArray();
  let orphanSaleProps = 0, orphanSaleAgents = 0;
  sales.forEach((s) => {
    if (s.propertyId && !propIds.has(s.propertyId)) orphanSaleProps++;
    if (s.agentId && !agentIds.has(s.agentId)) orphanSaleAgents++;
  });
  if (orphanSaleProps) issues.push({ level: 'warning', table: 'sales', message: `${orphanSaleProps} venta(s) referencian propiedades eliminadas.` });
  if (orphanSaleAgents) issues.push({ level: 'warning', table: 'sales', message: `${orphanSaleAgents} venta(s) referencian agentes eliminados.` });

  // 5) Inquilinos sin propiedad
  const orphanTenants = tenants.filter((t) => t.propertyId && !propIds.has(t.propertyId)).length;
  if (orphanTenants) issues.push({ level: 'warning', table: 'tenants', message: `${orphanTenants} inquilino(s) con propertyId apuntando a propiedades inexistentes.` });

  // 6) Validez de campos numéricos
  let badRentals = 0;
  rentals.forEach((r) => {
    if (typeof r.amount !== 'number' || isNaN(r.amount)) badRentals++;
    if (!r.year || !r.month) badRentals++;
  });
  if (badRentals) issues.push({ level: 'warning', table: 'rentals', message: `${badRentals} renta(s) con montos o período inválidos.` });

  let badExpenses = 0;
  const expenses = await db.expenses.toArray();
  expenses.forEach((e) => {
    if (typeof e.monthly !== 'number' || isNaN(e.monthly)) badExpenses++;
    if (!e.year || !e.month) badExpenses++;
  });
  if (badExpenses) issues.push({ level: 'warning', table: 'expenses', message: `${badExpenses} gasto(s) con montos o período inválidos.` });

  // 7) Cuotas Q1+Q2 vs Mensual
  let mismatchedExpenses = 0;
  expenses.forEach((e) => {
    const sum = (Number(e.q1) || 0) + (Number(e.q2) || 0);
    if (Math.abs(sum - (Number(e.monthly) || 0)) > 0.5) mismatchedExpenses++;
  });
  if (mismatchedExpenses) issues.push({ level: 'info', table: 'expenses', message: `${mismatchedExpenses} gasto(s) donde Q1+Q2 difiere del monto mensual (puede ser intencional).` });

  // 8) Estado del navegador
  const storage = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;

  return {
    ok: issues.filter((i) => i.level === 'error').length === 0,
    stats,
    issues,
    storage,
    timestamp: new Date().toISOString()
  };
}

// Limpia referencias huérfanas en rentas y ventas (deja agentName/propertyName como texto plano)
export async function repairOrphans() {
  const [properties, tenants, agents] = await Promise.all([
    db.properties.toArray(), db.tenants.toArray(), db.agents.toArray()
  ]);
  const propIds = new Set(properties.map((p) => p.id));
  const tenantIds = new Set(tenants.map((t) => t.id));
  const agentIds = new Set(agents.map((a) => a.id));

  let fixed = 0;
  const rentals = await db.rentals.toArray();
  for (const r of rentals) {
    const patch = {};
    if (r.propertyId && !propIds.has(r.propertyId)) { patch.propertyId = null; fixed++; }
    if (r.tenantId && !tenantIds.has(r.tenantId)) { patch.tenantId = null; fixed++; }
    if (r.agentId && !agentIds.has(r.agentId)) { patch.agentId = null; fixed++; }
    if (Object.keys(patch).length) await db.rentals.update(r.id, patch);
  }

  const sales = await db.sales.toArray();
  for (const s of sales) {
    const patch = {};
    if (s.propertyId && !propIds.has(s.propertyId)) { patch.propertyId = null; fixed++; }
    if (s.agentId && !agentIds.has(s.agentId)) { patch.agentId = null; fixed++; }
    if (Object.keys(patch).length) await db.sales.update(s.id, patch);
  }

  return { fixed };
}
