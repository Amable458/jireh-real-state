import { create } from 'zustand';
import { logActivity, rpcLogin } from '../db/database.js';
import { makeToken, decodeToken } from '../utils/crypto.js';

const STORAGE_KEY = 'jireh_token';

// Usa sessionStorage para sesiones cortas (8h) y localStorage solo si "recordarme"
const loadFromStorage = () => {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) continue;
      const { token, expires } = JSON.parse(raw);
      if (Date.now() > expires) { store.removeItem(STORAGE_KEY); continue; }
      const payload = decodeToken(token);
      if (payload) return { token, expires, user: payload, store };
    } catch { /* ignore */ }
  }
  return null;
};

const initial = loadFromStorage();

export const useAuth = create((set, get) => ({
  user: initial?.user || null,
  token: initial?.token || null,
  expires: initial?.expires || 0,

  login: async (username, password, remember) => {
    let row;
    try {
      row = await rpcLogin(username.trim(), password);
    } catch (e) {
      return { ok: false, message: 'Error de servidor: ' + (e.message || 'desconocido') };
    }
    if (!row) return { ok: false, message: 'Credenciales inválidas o usuario bloqueado' };

    const ttlMs = remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
    const expires = Date.now() + ttlMs;
    const token = await makeToken({
      sub: row.id,
      username: row.username,
      role: row.role,
      fullName: row.fullName || row.username,
      exp: Math.floor(expires / 1000)
    });

    const store = remember ? localStorage : sessionStorage;
    // Limpia el otro store por si quedó algo
    (remember ? sessionStorage : localStorage).removeItem(STORAGE_KEY);
    store.setItem(STORAGE_KEY, JSON.stringify({ token, expires }));

    const userInfo = { sub: row.id, username: row.username, role: row.role, fullName: row.fullName || row.username };
    set({ user: userInfo, token, expires });
    await logActivity(row.id, row.username, 'login', remember ? 'remember=true' : '');
    return { ok: true };
  },

  logout: async () => {
    const u = get().user;
    if (u) await logActivity(u.sub, u.username, 'logout', '');
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    set({ user: null, token: null, expires: 0 });
  },

  hasRole: (...roles) => {
    const u = get().user;
    if (!u) return false;
    return roles.includes(u.role);
  }
}));
