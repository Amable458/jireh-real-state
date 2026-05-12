import Dexie from 'dexie';
import { sha256 } from '../utils/crypto.js';

export const db = new Dexie('JirehRealState');

db.version(1).stores({
  users: '++id, &username, role, blocked',
  rentals: '++id, year, month, propertyId, tenantId, agentId, status, date',
  sales: '++id, year, month, propertyId, agentId, date',
  expenses: '++id, year, month, status, recurring',
  properties: '++id, name, type',
  tenants: '++id, name, propertyId, contractEnd',
  agents: '++id, name, active',
  distributionConfig: 'key',
  distributions: '++id, &ymKey, year, month',
  activityLog: '++id, ts, userId, action',
  settings: 'key'
});

// Usuarios por defecto (centralizados para auto-reparación)
export const DEFAULT_USERS = [
  { username: 'superadmin', password: 'SuperAdmin2024!', role: 'SuperAdmin', fullName: 'Super Administrador' },
  { username: 'admin',      password: 'Admin2024!',      role: 'Admin',      fullName: 'Administrador' },
  { username: 'usuario1',   password: 'User2024!',       role: 'Operativo',  fullName: 'Usuario Operativo' }
];

// Asegura que los usuarios por defecto existan (idempotente). Devuelve los creados.
export async function ensureDefaultUsers() {
  const created = [];
  for (const u of DEFAULT_USERS) {
    const existing = await db.users.where('username').equalsIgnoreCase(u.username).first();
    if (!existing) {
      const passHash = await sha256(u.password);
      await db.users.add({
        username: u.username,
        passHash,
        role: u.role,
        fullName: u.fullName,
        blocked: 0,
        createdAt: new Date().toISOString()
      });
      created.push(u.username);
    }
  }
  return created;
}

export async function initDB() {
  try {
    await db.open();
  } catch (err) {
    // Diagnóstico claro si IndexedDB no está disponible (Safari privado, ITP, etc.)
    console.error('[Jireh] No se pudo abrir IndexedDB:', err);
    throw new Error('Tu navegador bloqueó el almacenamiento local (IndexedDB). Intenta en modo normal (no privado) o con otro navegador.');
  }
  const created = await ensureDefaultUsers();
  if (created.length) {
    console.info('[Jireh] Usuarios por defecto creados:', created.join(', '));
  }

  const cfg = await db.distributionConfig.get('default');
  if (!cfg) {
    await db.distributionConfig.put({
      key: 'default',
      ahorro: 30,
      gastosOficina: 25,
      bonosEquipo: 25,
      administracion: 20,
      updatedAt: new Date().toISOString()
    });
  }

  const agentCount = await db.agents.count();
  if (agentCount === 0) {
    await db.agents.bulkAdd([
      { name: 'María Reyes', active: 1, createdAt: new Date().toISOString() },
      { name: 'Carlos Peña', active: 1, createdAt: new Date().toISOString() },
      { name: 'Ana Jiménez', active: 1, createdAt: new Date().toISOString() }
    ]);
  }

  const settings = await db.settings.get('app');
  if (!settings) {
    await db.settings.put({
      key: 'app',
      companyName: 'Jireh Real State',
      currency: 'DOP',
      contractAlertDays: 30
    });
  }
}

export async function logActivity(userId, username, action, detail = '') {
  await db.activityLog.add({
    ts: new Date().toISOString(),
    userId,
    username,
    action,
    detail
  });
}

export async function exportAll() {
  const tables = ['users', 'rentals', 'sales', 'expenses', 'properties', 'tenants', 'agents', 'distributionConfig', 'distributions', 'activityLog', 'settings'];
  const out = { exportedAt: new Date().toISOString(), version: 1, data: {} };
  for (const t of tables) out.data[t] = await db[t].toArray();
  return out;
}

export async function importAll(payload) {
  if (!payload?.data) throw new Error('Archivo inválido');
  await db.transaction('rw', db.tables, async () => {
    for (const t of Object.keys(payload.data)) {
      if (db.table(t)) {
        await db.table(t).clear();
        if (payload.data[t].length) await db.table(t).bulkAdd(payload.data[t]);
      }
    }
  });
}
