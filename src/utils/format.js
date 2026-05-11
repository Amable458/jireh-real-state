export const fmtMoney = (n) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2
  }).format(v);
};

export const fmtNumber = (n) =>
  new Intl.NumberFormat('es-DO').format(Number(n) || 0);

export const fmtDate = (d) => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtDateTime = (d) => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
};

export const monthName = (m) => [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
][m - 1] || '';

export const monthsList = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: monthName(i + 1)
}));

export const yearsList = (back = 5, forward = 1) => {
  const now = new Date().getFullYear();
  const out = [];
  for (let y = now - back; y <= now + forward; y++) out.push(y);
  return out;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
