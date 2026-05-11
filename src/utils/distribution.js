// Categoría del sistema (no se puede eliminar ni renombrar)
export const SYSTEM_BONUS_ID = 'bonosEquipo';
export const SYSTEM_BONUS_NAME = 'Bonos equipo';

// Categorías por defecto si la base está vacía
const DEFAULT_CATEGORIES = [
  { id: SYSTEM_BONUS_ID, name: SYSTEM_BONUS_NAME, percent: 25, system: true },
  { id: 'ahorro', name: 'Ahorro', percent: 30 },
  { id: 'gastosOficina', name: 'Gastos oficina', percent: 25 },
  { id: 'administracion', name: 'Administración', percent: 20 }
];

// Convierte formato antiguo {ahorro, gastosOficina, bonosEquipo, administracion}
// al nuevo {categories: [...]}. Garantiza que bonosEquipo siempre exista.
export function normalizeConfig(cfg) {
  if (!cfg) return { key: 'default', categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })) };
  if (Array.isArray(cfg.categories) && cfg.categories.length > 0) {
    const cats = cfg.categories.map((c) => ({
      id: c.id,
      name: c.name,
      percent: Number(c.percent) || 0,
      system: c.id === SYSTEM_BONUS_ID || !!c.system
    }));
    if (!cats.some((c) => c.id === SYSTEM_BONUS_ID)) {
      cats.unshift({ id: SYSTEM_BONUS_ID, name: SYSTEM_BONUS_NAME, percent: 25, system: true });
    }
    return { ...cfg, categories: cats };
  }
  // Migración desde formato plano
  const cats = [];
  cats.push({ id: SYSTEM_BONUS_ID, name: SYSTEM_BONUS_NAME, percent: Number(cfg.bonosEquipo) || 0, system: true });
  if (cfg.ahorro !== undefined)        cats.push({ id: 'ahorro',         name: 'Ahorro',         percent: Number(cfg.ahorro) || 0 });
  if (cfg.gastosOficina !== undefined) cats.push({ id: 'gastosOficina',  name: 'Gastos oficina', percent: Number(cfg.gastosOficina) || 0 });
  if (cfg.administracion !== undefined) cats.push({ id: 'administracion', name: 'Administración', percent: Number(cfg.administracion) || 0 });
  return { ...cfg, categories: cats };
}

export function makeCategoryId(name) {
  const base = String(name || 'categoria')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'categoria';
  return `${base}_${Math.random().toString(36).slice(2, 7)}`;
}

// Aplica los porcentajes al excedente. Devuelve [{ id, name, percent, amount, system }]
export function applyDistribution(surplus, cfg) {
  const n = normalizeConfig(cfg);
  if (!n || surplus <= 0) return n.categories.map((c) => ({ ...c, amount: 0 }));
  return n.categories.map((c) => ({ ...c, amount: (surplus * (Number(c.percent) || 0)) / 100 }));
}

export function getBonusPercent(cfg) {
  const n = normalizeConfig(cfg);
  const b = n.categories.find((c) => c.id === SYSTEM_BONUS_ID);
  return Number(b?.percent) || 0;
}
