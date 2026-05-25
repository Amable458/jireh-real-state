import { supabase, isConfigured } from './supabaseClient.js';

// Tablas del sistema
const TABLES = [
  'users', 'rentals', 'sales', 'expenses', 'properties', 'tenants', 'agents',
  'distributionConfig', 'activityLog', 'settings'
];
const STRING_PK_TABLES = new Set(['distributionConfig', 'settings']);

const pkOf = (table) => (STRING_PK_TABLES.has(table) ? 'key' : 'id');
const escapeLike = (v) => String(v).replace(/[\\%_]/g, (m) => '\\' + m);

function ensureClient() {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Defina VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
}

// --- Builder encadenable ---
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

function makeTable(table) {
  const pk = pkOf(table);
  const isStringPk = STRING_PK_TABLES.has(table);
  return {
    _name: table, _pk: pk,
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
      let ascending = true, limitN = null;
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

export const db = TABLES.reduce((acc, t) => { acc[t] = makeTable(t); return acc; }, {
  tables: [],
  table(name) { return this[name]; },
  async transaction(_mode, _tables, fn) { return fn(); }
});
db.tables = TABLES.map((t) => db[t]);

// =================================================================
// AUTH RPCs — basadas en token de sesión server-side
// =================================================================

export async function rpcLogin(username, password, remember = false) {
  const { data, error } = await supabase.rpc('auth_login', {
    p_username: username,
    p_password: password,
    p_remember: !!remember
  });
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

export async function rpcLogout(token) {
  if (!token) return;
  try { await supabase.rpc('auth_logout', { p_token: token }); } catch { /* best-effort */ }
}

export async function rpcValidateSession(token) {
  if (!token) return null;
  const { data, error } = await supabase.rpc('auth_validate', { p_token: token });
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

export async function rpcEnsureDefaultUsers() {
  const { data, error } = await supabase.rpc('auth_ensure_default_users');
  if (error) throw error;
  return data || [];
}

export async function rpcUserCount() {
  const { data, error } = await supabase.rpc('auth_user_count');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function rpcListUsers(token) {
  const { data, error } = await supabase.rpc('auth_list_users', { p_token: token });
  if (error) throw error;
  return data || [];
}

export async function rpcCreateUser(token, username, password, role, fullName) {
  const { data, error } = await supabase.rpc('auth_create_user', {
    p_token: token, p_username: username, p_password: password,
    p_role: role, p_full_name: fullName
  });
  if (error) throw error;
  return data;
}

export async function rpcUpdateUser(token, targetId, username, fullName, role) {
  const { error } = await supabase.rpc('auth_update_user', {
    p_token: token, target_id: targetId,
    p_username: username, p_full_name: fullName, p_role: role
  });
  if (error) throw error;
}

export async function rpcChangePassword(token, targetId, newPassword) {
  const { error } = await supabase.rpc('auth_change_password', {
    p_token: token, target_id: targetId, new_password: newPassword
  });
  if (error) throw error;
}

export async function rpcToggleBlock(token, targetId) {
  const { data, error } = await supabase.rpc('auth_toggle_block', {
    p_token: token, target_id: targetId
  });
  if (error) throw error;
  return data;
}

export async function rpcExportUsers(token) {
  const { data, error } = await supabase.rpc('auth_admin_export_users', { p_token: token });
  if (error) throw error;
  return data || [];
}

export async function rpcImportUsers(token, payload) {
  const { data, error } = await supabase.rpc('auth_admin_import_users', { p_token: token, payload });
  if (error) throw error;
  return data || 0;
}

export async function rpcPurgeLog(token, daysKeep = 90) {
  const { data, error } = await supabase.rpc('purge_activity_log', { p_token: token, p_days_keep: daysKeep });
  if (error) throw error;
  return data || 0;
}

// Compatibilidad
export const DEFAULT_USERS = [
  { username: 'superadmin', role: 'SuperAdmin' },
  { username: 'admin',      role: 'Admin' },
  { username: 'usuario1',   role: 'Operativo' }
];
export const ensureDefaultUsers = rpcEnsureDefaultUsers;

export async function initDB() {
  if (!isConfigured) {
    throw new Error('Supabase no está configurado. Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.');
  }
  try {
    await rpcUserCount();
  } catch (error) {
    console.error('[Jireh] Error al conectar con Supabase:', error);
    throw new Error('No se pudo conectar a Supabase: ' + (error.message || 'error desconocido') + '. ¿Ejecutaste schema.sql y security.sql?');
  }
  const created = await rpcEnsureDefaultUsers();
  if (created.length) console.info('[Jireh] Usuarios por defecto creados:', created.join(', '));

  if ((await db.agents.count()) === 0) {
    await db.agents.bulkAdd([
      { name: 'María Reyes', active: 1 },
      { name: 'Carlos Peña', active: 1 },
      { name: 'Ana Jiménez', active: 1 }
    ]);
  }
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
  if (!(await db.settings.get('app'))) {
    await db.settings.put({
      key: 'app', companyName: 'Jireh Real Estate', currency: 'DOP', contractAlertDays: 30
    });
  }
}

// Helper para logging desde el cliente. Se intentará leer el token actual.
let _currentToken = null;
let _currentUser = null;
export function setSessionContext(token, user) {
  _currentToken = token;
  _currentUser = user;
}
export function getSessionContext() {
  return { token: _currentToken, user: _currentUser };
}

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

// Export/Import — el actorId/token se necesita para tabla users (RLS strict)
export async function exportAll(token) {
  const out = { exportedAt: new Date().toISOString(), version: 3, data: {} };
  for (const t of TABLES) {
    if (t === 'users') {
      out.data.users = token ? await rpcExportUsers(token) : [];
    } else {
      out.data[t] = await db[t].toArray();
    }
  }
  return out;
}

export async function importAll(payload, token) {
  if (!payload?.data) throw new Error('Archivo inválido');
  for (const t of TABLES) {
    if (payload.data[t] === undefined) continue;
    if (t === 'users') {
      if (token && payload.data.users.length) await rpcImportUsers(token, payload.data.users);
      continue;
    }
    try { await db[t].clear(); } catch { /* tabla vacía */ }
    if (payload.data[t].length) await db[t].bulkAdd(payload.data[t]);
  }
}
