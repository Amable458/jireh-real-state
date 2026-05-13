import { supabase, isConfigured } from './supabaseClient.js';
import { sha256 } from '../utils/crypto.js';

// Tablas del sistema
const TABLES = [
  'users', 'rentals', 'sales', 'expenses', 'properties', 'tenants', 'agents',
  'distributionConfig', 'distributions', 'activityLog', 'settings'
];

// Tablas con PK de tipo texto en vez de bigserial
const STRING_PK_TABLES = new Set(['distributionConfig', 'settings']);

const pkOf = (table) => (STRING_PK_TABLES.has(table) ? 'key' : 'id');

// Escapa los caracteres especiales de LIKE/ILIKE
const escapeLike = (v) => String(v).replace(/[\\%_]/g, (m) => '\\' + m);

function ensureClient() {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Defina VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
}

// --- Builder encadenable: .first() .toArray() .count() .delete() ---
function makeChained(table, applyFilter) {
  return {
    async first() {
      ensureClient();
      const { data, error } = await applyFilter(supabase.from(table).select('*')).limit(1);
      if (error) throw error;
      return data?.[0];
    },
    async toArray() {
      ensureClient();
      const { data, error } = await applyFilter(supabase.from(table).select('*'));
      if (error) throw error;
      return data || [];
    },
    async count() {
      ensureClient();
      const { count, error } = await applyFilter(supabase.from(table).select('*', { count: 'exact', head: true }));
      if (error) throw error;
      return count || 0;
    },
    async delete() {
      ensureClient();
      const { error } = await applyFilter(supabase.from(table).delete());
      if (error) throw error;
    }
  };
}

// --- Tabla con API tipo-Dexie ---
function makeTable(table) {
  const pk = pkOf(table);
  const isStringPk = STRING_PK_TABLES.has(table);

  return {
    _name: table,
    _pk: pk,

    async count() {
      ensureClient();
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },

    async toArray() {
      ensureClient();
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      return data || [];
    },

    async get(key) {
      ensureClient();
      const { data, error } = await supabase.from(table).select('*').eq(pk, key).maybeSingle();
      if (error) throw error;
      return data || undefined;
    },

    async add(obj) {
      ensureClient();
      const ins = { ...obj };
      if (!isStringPk) delete ins.id;
      const { data, error } = await supabase.from(table).insert(ins).select(pk).single();
      if (error) throw error;
      return data[pk];
    },

    async bulkAdd(arr, opts) {
      ensureClient();
      if (!arr || !arr.length) return opts?.allKeys ? [] : undefined;
      const inserts = arr.map((o) => {
        const x = { ...o };
        if (!isStringPk) delete x.id;
        return x;
      });
      const q = supabase.from(table).insert(inserts);
      const { data, error } = opts?.allKeys ? await q.select(pk) : await q;
      if (error) throw error;
      return opts?.allKeys ? data.map((r) => r[pk]) : undefined;
    },

    async update(key, patch) {
      ensureClient();
      const { error } = await supabase.from(table).update(patch).eq(pk, key);
      if (error) throw error;
    },

    async delete(key) {
      ensureClient();
      const { error } = await supabase.from(table).delete().eq(pk, key);
      if (error) throw error;
    },

    async put(obj) {
      ensureClient();
      const { error } = await supabase.from(table).upsert(obj, { onConflict: pk });
      if (error) throw error;
    },

    async clear() {
      ensureClient();
      // Borrar todas las filas (without a WHERE Postgres rechaza)
      const { error } = await supabase.from(table).delete().not(pk, 'is', null);
      if (error) throw error;
    },

    where(criteria) {
      if (typeof criteria === 'string') {
        const field = criteria;
        return {
          equals: (v) => makeChained(table, (q) => q.eq(field, v)),
          equalsIgnoreCase: (v) => makeChained(table, (q) => q.ilike(field, escapeLike(v)))
        };
      }
      const filters = Object.entries(criteria);
      return makeChained(table, (q) => filters.reduce((acc, [f, v]) => acc.eq(f, v), q));
    },

    orderBy(field) {
      let ascending = true;
      let limitN = null;
      const api = {
        reverse() { ascending = false; return api; },
        limit(n) { limitN = n; return api; },
        async toArray() {
          ensureClient();
          let q = supabase.from(table).select('*').order(field, { ascending });
          if (limitN != null) q = q.limit(limitN);
          const { data, error } = await q;
          if (error) throw error;
          return data || [];
        }
      };
      return api;
    }
  };
}

// --- Objeto principal `db` ---
export const db = TABLES.reduce((acc, t) => {
  acc[t] = makeTable(t);
  return acc;
}, {
  tables: [],
  table(name) { return this[name]; },
  // Supabase no soporta transacciones desde el cliente.
  // Ejecuta secuencialmente; para atomicidad real, usar RPC en Postgres.
  async transaction(_mode, _tables, fn) { return fn(); }
});
db.tables = TABLES.map((t) => db[t]);

// =================================================================
// USUARIOS POR DEFECTO + INIT
// =================================================================

export const DEFAULT_USERS = [
  { username: 'superadmin', password: 'SuperAdmin2024!', role: 'SuperAdmin', fullName: 'Super Administrador' },
  { username: 'admin',      password: 'Admin2024!',      role: 'Admin',      fullName: 'Administrador' },
  { username: 'usuario1',   password: 'User2024!',       role: 'Operativo',  fullName: 'Usuario Operativo' }
];

export async function ensureDefaultUsers() {
  if (!isConfigured) return [];
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
        blocked: 0
      });
      created.push(u.username);
    }
  }
  return created;
}

export async function initDB() {
  if (!isConfigured) {
    throw new Error('Supabase no está configurado. Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.');
  }

  // Test conexión y permisos
  const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
  if (error) {
    console.error('[Jireh] Error al conectar con Supabase:', error);
    throw new Error('No se pudo conectar a Supabase: ' + error.message + '. ¿Ejecutaste el schema.sql?');
  }

  const created = await ensureDefaultUsers();
  if (created.length) console.info('[Jireh] Usuarios por defecto creados:', created.join(', '));

  // Seed agentes si está vacío
  if ((await db.agents.count()) === 0) {
    await db.agents.bulkAdd([
      { name: 'María Reyes', active: 1 },
      { name: 'Carlos Peña', active: 1 },
      { name: 'Ana Jiménez', active: 1 }
    ]);
  }

  // Seed configuración de distribución
  if (!(await db.distributionConfig.get('default'))) {
    await db.distributionConfig.put({
      key: 'default',
      categories: [
        { id: 'bonosEquipo',   name: 'Bonos equipo',    percent: 25, system: true },
        { id: 'ahorro',         name: 'Ahorro',          percent: 30 },
        { id: 'gastosOficina',  name: 'Gastos oficina',  percent: 25 },
        { id: 'administracion', name: 'Administración',  percent: 20 }
      ]
    });
  }

  // Seed settings
  if (!(await db.settings.get('app'))) {
    await db.settings.put({
      key: 'app',
      companyName: 'Jireh Real State',
      currency: 'DOP',
      contractAlertDays: 30
    });
  }
}

// =================================================================
// BITÁCORA
// =================================================================

export async function logActivity(userId, username, action, detail = '') {
  try {
    await db.activityLog.add({
      ts: new Date().toISOString(),
      userId, username, action, detail
    });
  } catch (e) {
    console.warn('[Jireh] No se pudo registrar actividad:', e.message);
  }
}

// =================================================================
// EXPORT / IMPORT
// =================================================================

export async function exportAll() {
  const out = { exportedAt: new Date().toISOString(), version: 2, data: {} };
  for (const t of TABLES) out.data[t] = await db[t].toArray();
  return out;
}

export async function importAll(payload) {
  if (!payload?.data) throw new Error('Archivo inválido');
  for (const t of TABLES) {
    if (payload.data[t] !== undefined) {
      try { await db[t].clear(); } catch { /* tabla vacía */ }
      if (payload.data[t].length) {
        await db[t].bulkAdd(payload.data[t]);
      }
    }
  }
}
