import { create } from 'zustand';
import {
  logActivity, rpcLogin, rpcLogout, rpcValidateSession, setSessionContext
} from '../db/database.js';

const STORAGE_KEY = 'jireh_session';

// Carga sesión almacenada. Prefiere sessionStorage; localStorage solo para "Recordarme".
const loadFromStorage = () => {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (!data?.token || !data?.user) continue;
      if (data.expires && Date.now() > data.expires) {
        store.removeItem(STORAGE_KEY);
        continue;
      }
      return data;
    } catch { /* ignore */ }
  }
  return null;
};

const persist = (data, remember) => {
  const store = remember ? localStorage : sessionStorage;
  (remember ? sessionStorage : localStorage).removeItem(STORAGE_KEY);
  store.setItem(STORAGE_KEY, JSON.stringify(data));
};

const clearAllStorage = () => {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
};

const initial = loadFromStorage();
if (initial) setSessionContext(initial.token, initial.user);

export const useAuth = create((set, get) => ({
  user: initial?.user || null,
  token: initial?.token || null,
  expires: initial?.expires || 0,
  ready: !initial, // si no hay token, ready=true. Si hay, esperamos validar.

  // Llamar al montar la app: valida la sesión actual con el servidor
  hydrate: async () => {
    const t = get().token;
    if (!t) { set({ ready: true }); return; }
    try {
      const valid = await rpcValidateSession(t);
      if (!valid) {
        clearAllStorage();
        setSessionContext(null, null);
        set({ user: null, token: null, expires: 0, ready: true });
        return;
      }
      const userInfo = {
        sub: valid.user_id,
        username: valid.username,
        role: valid.role,
        fullName: valid.fullName || valid.username
      };
      setSessionContext(t, userInfo);
      set({ user: userInfo, ready: true });
    } catch (e) {
      console.warn('[Jireh] Sesión inválida al hidratar:', e.message);
      clearAllStorage();
      setSessionContext(null, null);
      set({ user: null, token: null, expires: 0, ready: true });
    }
  },

  login: async (username, password, remember) => {
    let row;
    try {
      row = await rpcLogin(username.trim(), password, remember);
    } catch (e) {
      const msg = e?.message || 'Error desconocido';
      return { ok: false, message: msg };
    }
    if (!row || !row.token) return { ok: false, message: 'Credenciales inválidas' };

    const userInfo = {
      sub: row.user_id,
      username: row.username,
      role: row.role,
      fullName: row.fullName || row.username
    };
    const expires = new Date(row.expires_at).getTime();
    persist({ token: row.token, user: userInfo, expires }, !!remember);
    setSessionContext(row.token, userInfo);
    set({ user: userInfo, token: row.token, expires, ready: true });
    await logActivity(userInfo.sub, userInfo.username, 'login', remember ? 'remember=true' : '');
    return { ok: true };
  },

  logout: async () => {
    const { user, token } = get();
    if (user) await logActivity(user.sub, user.username, 'logout', '');
    if (token) await rpcLogout(token);
    clearAllStorage();
    setSessionContext(null, null);
    set({ user: null, token: null, expires: 0, ready: true });
  },

  hasRole: (...roles) => {
    const u = get().user;
    return !!u && roles.includes(u.role);
  }
}));
