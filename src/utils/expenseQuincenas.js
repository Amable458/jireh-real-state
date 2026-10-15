// ============================================================
// Gastos pagados por quincenas.
//
// Un gasto puede dividirse en Quincena 1 (día 15) y Quincena 2 (día 30). Cada
// quincena con monto tiene su propio estado (q1Paid / q2Paid) y fecha de pago
// (q1PaidAt / q2PaidAt). El `status` del gasto se DERIVA de ellas y se sigue
// guardando, porque varias partes del sistema lo leen:
//
//   ninguna pagada            → 'pendiente'
//   una de dos pagada         → 'parcial'
//   todas las que tienen monto → 'pagado'
//
// Toda suma de «pagado / pendiente» debe pasar por aquí. Antes se usaba
// `status === 'pagado' ? mensual : 0`, y al pagar solo la 1ª quincena el gasto
// entero aparecía pagado.
//
// Compatibilidad: si q1Paid/q2Paid vienen null (la migración aún no se corrió,
// o registros viejos), se usa el `status` guardado: el resultado es idéntico al
// comportamiento anterior.
// ============================================================

const num = (v) => Number(v) || 0;
const r2 = (n) => Math.round(n * 100) / 100;

// ¿Este gasto ya tiene el estado por quincena?
export const tieneEstadoPorQuincena = (e) => e?.q1Paid != null || e?.q2Paid != null;

// Quincenas con monto. Si Q1 y Q2 están en 0 (gastos viejos o de un solo pago),
// el gasto completo es una única parte (n = 0).
export function partes(e) {
  const q1 = num(e?.q1), q2 = num(e?.q2);
  const legacyPaid = e?.status === 'pagado';
  const por = tieneEstadoPorQuincena(e);
  const out = [];
  if (q1 > 0) out.push({ n: 1, monto: q1, pagada: por ? !!e.q1Paid : legacyPaid, fecha: e?.q1PaidAt || null });
  if (q2 > 0) out.push({ n: 2, monto: q2, pagada: por ? !!e.q2Paid : legacyPaid, fecha: e?.q2PaidAt || null });
  if (!out.length) {
    out.push({ n: 0, monto: num(e?.monthly), pagada: por ? !!(e.q1Paid || e.q2Paid) : legacyPaid, fecha: e?.q1PaidAt || e?.q2PaidAt || null });
  }
  return out;
}

export const esDividido = (e) => num(e?.q1) > 0 && num(e?.q2) > 0;

export function estadoDerivado(e) {
  const p = partes(e);
  const pagadas = p.filter((x) => x.pagada).length;
  if (pagadas === 0) return 'pendiente';
  if (pagadas === p.length) return 'pagado';
  return 'parcial';
}

// Monto pagado. Totalmente pagado cuenta el MENSUAL (así los totales de los
// meses ya cerrados no cambian aunque Q1 + Q2 no cuadre con el mensual);
// parcial cuenta solo la(s) quincena(s) pagada(s), sin pasarse del mensual.
export function montoPagado(e) {
  const est = estadoDerivado(e);
  if (est === 'pagado') return num(e?.monthly);
  if (est === 'pendiente') return 0;
  const pagado = partes(e).filter((x) => x.pagada).reduce((s, x) => s + x.monto, 0);
  return r2(Math.min(pagado, num(e?.monthly)));
}

export const montoPendiente = (e) => r2(Math.max(0, num(e?.monthly) - montoPagado(e)));

// La quincena que pagará el botón ✓ (la primera sin pagar), o null.
export const siguientePendiente = (e) => partes(e).find((x) => !x.pagada) || null;

// ¿Q1 + Q2 cuadran con el mensual? (si no se dividió, no aplica)
export function cuadraConMensual(e) {
  const q1 = num(e?.q1), q2 = num(e?.q2);
  if (q1 === 0 && q2 === 0) return true;
  return Math.abs(q1 + q2 - num(e?.monthly)) < 0.01;
}

// Nombre corto de una quincena para mostrar
export const nombreQuincena = (n) => (n === 1 ? '1ª quincena' : n === 2 ? '2ª quincena' : 'pago');
export const diaQuincena = (n) => (n === 1 ? 15 : n === 2 ? 30 : null);

// Texto del estado para la tabla: «Pagado», «Pendiente», «1ª pagada · falta 2ª»
export function etiquetaEstado(e) {
  const est = estadoDerivado(e);
  if (est !== 'parcial') return est === 'pagado' ? 'Pagado' : 'Pendiente';
  const p = partes(e);
  const pag = p.find((x) => x.pagada), falta = p.find((x) => !x.pagada);
  return `${pag.n}ª pagada · falta ${falta.n}ª`;
}

// Cambios a guardar al pagar unas quincenas. `cuales` = [1], [2], [1,2] o [0].
// Devuelve el parche con los flags, las fechas y el `status` resultante.
export function parchePago(e, cuales, fecha) {
  const hoy = fecha || new Date().toISOString().slice(0, 10);
  const p = partes(e);
  const marcar = new Set(cuales);
  const patch = {};
  // Base: lo que ya estaba pagado se conserva
  let q1 = p.find((x) => x.n === 1)?.pagada ?? false;
  let q2 = p.find((x) => x.n === 2)?.pagada ?? false;
  let q1At = e?.q1PaidAt || null, q2At = e?.q2PaidAt || null;
  if (p.length === 1 && p[0].n === 0) {
    // Gasto de un solo pago sin quincenas: se marca con q1
    if (marcar.has(0) || marcar.has(1)) { q1 = true; q1At = q1At || hoy; }
  } else {
    if (marcar.has(1) && !q1) { q1 = true; q1At = hoy; }
    if (marcar.has(2) && !q2) { q2 = true; q2At = hoy; }
  }
  patch.q1Paid = q1; patch.q2Paid = q2; patch.q1PaidAt = q1 ? q1At : null; patch.q2PaidAt = q2 ? q2At : null;
  patch.status = estadoDerivado({ ...e, ...patch });
  patch.revisarQuincenas = false;
  return patch;
}

// Estado por quincena para un gasto recién creado o copiado (nada pagado)
export const sinPagar = () => ({ q1Paid: false, q2Paid: false, q1PaidAt: null, q2PaidAt: null, revisarQuincenas: false, status: 'pendiente' });
