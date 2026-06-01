// ============================================================
// Soporte de doble moneda — DOP (base) y USD
// ============================================================

export const CURRENCIES = [
  { value: 'DOP', label: 'RD$ Pesos Dominicanos', symbol: 'RD$' },
  { value: 'USD', label: 'US$ Dólares', symbol: 'US$' }
];

export const DEFAULT_RATE = 60; // USD -> DOP fallback

const nf = new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const curSymbol = (currency) => (currency === 'USD' ? 'US$' : 'RD$');

// Formatea un monto con el símbolo de su moneda. Ej: RD$12,500.00 / US$250.00
export const fmtCur = (n, currency = 'DOP') => `${curSymbol(currency)}${nf.format(Number(n) || 0)}`;

// Normaliza la moneda de un registro (compat: registros viejos sin campo = DOP)
export const recCurrency = (rec) => (rec?.currency === 'USD' ? 'USD' : 'DOP');

// Tasa usada por un registro (la histórica almacenada, o la global como fallback)
export const recRate = (rec, globalRate) =>
  Number(rec?.exchangeRate) || Number(globalRate) || DEFAULT_RATE;

// Convierte el monto de un registro a la moneda base (DOP)
export const toBase = (amount, rec, globalRate) =>
  recCurrency(rec) === 'USD'
    ? (Number(amount) || 0) * recRate(rec, globalRate)
    : (Number(amount) || 0);

// Convierte un monto USD suelto a DOP
export const usdToDop = (amount, rate) => (Number(amount) || 0) * (Number(rate) || DEFAULT_RATE);
