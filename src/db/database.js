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

export async function initDB() {
  await db.open();
  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.bulkAdd([
      {
        username: 'superadmin',
        passHash: await sha256('SuperAdmin2024!'),
        role: 'SuperAdmin',
        fullName: 'Super Administrador',
        blocked: 0,
        createdAt: new Date().toISOString()
      },
      {
        username: 'admin',
        passHash: await sha256('Admin2024!'),
        role: 'Admin',
        fullName: 'Administrador',
        blocked: 0,
        createdAt: new Date().toISOString()
      },
      {
        username: 'usuario1',
        passHash: await sha256('User2024!'),
        role: 'Operativo',
        fullName: 'Usuario Operativo',
        blocked: 0,
        createdAt: new Date().toISOString()
      }
    ]);
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
