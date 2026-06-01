import { create } from 'zustand';
import { db, logActivity } from '../db/database.js';
import { DEFAULT_RATE } from '../utils/currency.js';

export const useSettings = create((set, get) => ({
  usdToDop: DEFAULT_RATE,
  loaded: false,

  load: async () => {
    try {
      const s = await db.settings.get('app');
      set({ usdToDop: Number(s?.usdToDop) || DEFAULT_RATE, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setRate: async (rate, user) => {
    const value = Number(rate);
    if (!value || value <= 0) throw new Error('La tasa debe ser un número mayor que 0');
    const s = (await db.settings.get('app')) || { key: 'app' };
    await db.settings.put({ ...s, key: 'app', usdToDop: value });
    set({ usdToDop: value });
    if (user) await logActivity(user.sub, user.username, 'settings.rate', `usdToDop=${value}`);
  }
}));
