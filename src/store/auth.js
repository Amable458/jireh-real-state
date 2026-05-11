import { create } from 'zustand';
import { db, logActivity } from '../db/database.js';
import { sha256, makeToken, decodeToken } from '../utils/crypto.js';

const STORAGE_KEY = 'jireh_token';

const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { token, expires } = JSON.parse(raw);
    if (Date.now() > expires) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const payload = decodeToken(token);
    return payload ? { token, expires, user: payload } : null;
  } catch {
    return null;
  }
};

const initial = loadFromStorage();

export const useAuth = create((set, get) => ({
  user: initial?.user || null,
  token: initial?.token || null,
  expires: initial?.expires || 0,

  login: async (username, password, remember) => {
    const u = await db.users.where('username').equalsIgnoreCase(username.trim()).first();
    if (!u) return { ok: false, message: 'Usuario no existe' };
    if (u.blocked) return { ok: false, message: 'Usuario bloqueado' };
    const hash = await sha256(password);
    if (hash !== u.passHash) return { ok: false, message: 'Credenciales inválidas' };
    const ttlMs = remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
    const expires = Date.now() + ttlMs;
    const token = await makeToken({
      sub: u.id,
      username: u.username,
      role: u.role,
      fullName: u.fullName || u.username,
      exp: Math.floor(expires / 1000)
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expires }));
    const userInfo = { sub: u.id, username: u.username, role: u.role, fullName: u.fullName || u.username };
    set({ user: userInfo, token, expires });
    await logActivity(u.id, u.username, 'login', '');
    return { ok: true };
  },

  logout: async () => {
    const u = get().user;
    if (u) await logActivity(u.sub, u.username, 'logout', '');
    localStorage.removeItem(STORAGE_KEY);
    set({ user: null, token: null, expires: 0 });
  },

  hasRole: (...roles) => {
    const u = get().user;
    if (!u) return false;
    return roles.includes(u.role);
  }
}));
