import { create } from 'zustand';
import { db, logActivity } from '../db/database.js';
import { DEFAULT_RATE } from '../utils/currency.js';
import { DEFAULT_CONTRACT_FEES, normalizeFees } from '../utils/contractFees.js';

export const DEFAULT_ADMIN_BONUS = 500;

export const useSettings = create((set, get) => ({
  usdToDop: DEFAULT_RATE,
  contractFees: DEFAULT_CONTRACT_FEES,
  adminBonusPerTenant: DEFAULT_ADMIN_BONUS,
  loaded: false,

  load: async () => {
    try {
      const s = await db.settings.get('app');
      set({
        usdToDop: Number(s?.usdToDop) || DEFAULT_RATE,
        contractFees: normalizeFees(s?.contractFees),
        adminBonusPerTenant: Number(s?.adminBonusPerTenant) || DEFAULT_ADMIN_BONUS,
        loaded: true
      });
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
  },

  setContractFees: async (fees, user) => {
    const clean = normalizeFees(fees);
    if (!clean.every((f) => f.label.trim())) throw new Error('Cada concepto debe tener un nombre');
    const s = (await db.settings.get('app')) || { key: 'app' };
    await db.settings.put({ ...s, key: 'app', contractFees: clean });
    set({ contractFees: clean });
    if (user) await logActivity(user.sub, user.username, 'settings.contractFees', `n=${clean.length}`);
  },

  setAdminBonusPerTenant: async (amount, user) => {
    const value = Number(amount);
    if (!(value >= 0)) throw new Error('El monto debe ser un número mayor o igual a 0');
    const s = (await db.settings.get('app')) || { key: 'app' };
    await db.settings.put({ ...s, key: 'app', adminBonusPerTenant: value });
    set({ adminBonusPerTenant: value });
    if (user) await logActivity(user.sub, user.username, 'settings.adminBonus', `perTenant=${value}`);
  }
}));
