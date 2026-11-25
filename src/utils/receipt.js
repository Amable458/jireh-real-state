import { db } from '../db/database.js';
import { fmtCur, recCurrency } from './currency.js';
import { fmtDate, monthName, todayISO } from './format.js';

// ============================================================
// Recibos de pago para inquilinos.
// Cada recibo se guarda en la tabla `receipts` con una COPIA de los datos
// (inquilino, propiedad, monto), así al reimprimirlo sale idéntico aunque
// después se edite el ingreso. Es distinto del Reporte a Propietario (ese
// muestra el descuento de administración; el recibo no).
// ============================================================

export const PAYMENT_METHODS = ['Transferencia', 'Efectivo', 'Cheque', 'Depósito', 'Tarjeta', 'Otro'];

// La fuente estándar de jsPDF (WinAnsi) no soporta ciertos caracteres
// Unicode. Los reemplazamos por equivalentes seguros.
export const pdfSafe = (s) => String(s ?? '')
  .replace(/[−–—]/g, '-')  // signo menos / guiones largos → guión normal
  .replace(/✓/g, '')       // checkmark
  .replace(/[↻→]/g, '-')   // flechas
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'");

// Logo de public/logo.png como data URL (jsPDF no puede leer una URL directa).
// Si falla (offline, ruta cambiada) el PDF sale igual, con la marca en texto.
export async function loadLogo() {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Número visible del recibo. Los que no se pudieron guardar (migración
// pendiente) llevan una P de «provisional».
export const receiptNumber = (r) =>
  r?.id ? `REC-${String(r.id).padStart(5, '0')}` : (r?.number || 'REC-P');

// Lo efectivamente cobrado de un ingreso: todo si está pagado, el abono si es parcial.
export function receivedAmount(income) {
  if (!income) return 0;
  if (income.status === 'pagado') return round2(income.amount);
  if (income.status === 'parcial') return round2(income.paid);
  return 0;
}

// ---------- Monto en letras (es-DO) ----------
const UNI = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function menorMil(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  let out = CEN[c];
  if (r) {
    const t = r < 30 ? UNI[r] : DEC[Math.floor(r / 10)] + (r % 10 ? ' y ' + UNI[r % 10] : '');
    out = out ? `${out} ${t}` : t;
  }
  return out;
}

// «uno» delante de un sustantivo se apocopa: veintiún mil, un millón, treinta y un pesos
const apocope = (t) => t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

function enteroEnLetras(n) {
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'un millón' : `${apocope(enteroEnLetras(millones))} millones`);
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocope(menorMil(miles))} mil`);
  if (resto) partes.push(menorMil(resto));
  return partes.join(' ');
}

export function montoEnLetras(amount, currency) {
  const v = round2(amount);
  const entero = Math.floor(v);
  const cent = Math.round((v - entero) * 100);
  const moneda = currency === 'USD'
    ? (entero === 1 ? 'dólar estadounidense' : 'dólares estadounidenses')
    : (entero === 1 ? 'peso dominicano' : 'pesos dominicanos');
  // «1,000,000 de pesos»: tras millón/millones exactos va «de»
  const num = apocope(enteroEnLetras(entero));
  const de = /mill(ón|ones)$/.test(num) ? ' de' : '';
  const txt = `${num}${de} ${moneda} con ${String(cent).padStart(2, '0')}/100`;
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// ---------- Crear o reutilizar el recibo de un cobro ----------
// Un ingreso puede tener varios recibos (abono parcial y luego el resto).
// Si ya está todo lo cobrado cubierto por recibos, se reutiliza el último
// (reimpresión) en vez de emitir otro número.
export async function ensureReceipt(income, { method = '', user, paymentDate } = {}) {
  const received = receivedAmount(income);
  const ccy = recCurrency(income);
  const base = {
    rentalId: income.id ?? null,
    tenantId: income.tenantId ?? null,
    propertyId: income.propertyId ?? null,
    tenantName: income.tenantName || '',
    propertyName: income.propertyName || '',
    year: income.year ?? null,
    month: income.month ?? null,
    currency: ccy,
    exchangeRate: ccy === 'USD' ? (income.exchangeRate ?? null) : null,
    paymentDate: paymentDate || income.date || todayISO(),
    method: method || '',
    notes: income.notes || '',
    createdBy: user?.fullName || user?.username || ''
  };

  let existing = [];
  try {
    existing = income.id ? await db.receipts.where({ rentalId: income.id }).toArray() : [];
  } catch (err) {
    return { receipt: provisional(base, income, received), saved: false, error: err };
  }
  existing.sort((a, b) => a.id - b.id);
  const covered = round2(existing.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const pending = round2(received - covered);

  if (existing.length && pending <= 0) {
    return { receipt: existing[existing.length - 1], saved: true, reused: true };
  }

  const amount = existing.length ? pending : received;
  const record = {
    ...base,
    amount,
    concept: conceptOf(income, amount),
    createdAt: new Date().toISOString()
  };
  try {
    const id = await db.receipts.add(record);
    return { receipt: { ...record, id }, saved: true };
  } catch (err) {
    return { receipt: provisional(base, income, amount), saved: false, error: err };
  }
}

function conceptOf(income, amount) {
  const cat = income.category || 'Renta';
  const partial = round2(amount) < round2(income.amount);
  return partial ? `${cat} (abono)` : cat;
}

function provisional(base, income, amount) {
  return { ...base, id: null, number: `REC-P${income.id ?? ''}`, amount, concept: conceptOf(income, amount), createdAt: new Date().toISOString() };
}

// Detalle del periodo: «Renta de noviembre 2026»
const periodo = (r) => (r.month && r.year ? `${monthName(r.month).toLowerCase()} ${r.year}` : '');

// Fecha de emisión en hora local (toISOString es UTC: de noche en RD ya sería mañana)
const emitido = (r) => fmtDate((r.createdAt ? new Date(r.createdAt) : new Date()).toLocaleDateString('en-CA'));

// ---------- PDF ----------
export async function buildReceiptDoc(r) {
  const mod = await import('jspdf');
  const jsPDF = mod.jsPDF || mod.default;
  const logo = await loadLogo();
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  const brand = [245, 197, 24];
  const ink = [26, 31, 44];
  const mute = [95, 100, 112];
  const ccy = r.currency === 'USD' ? 'USD' : 'DOP';

  // Banda de marca con el logo en su proporción real
  doc.setFillColor(...brand);
  doc.rect(0, 0, W, 24, 'F');
  if (logo) {
    try {
      const { width: iw, height: ih } = doc.getImageProperties(logo);
      const boxW = 38, boxH = 16;
      const k = Math.min(boxW / iw, boxH / ih);
      doc.addImage(logo, 'PNG', M, 4 + (boxH - ih * k) / 2, iw * k, ih * k);
    } catch { /* sin logo */ }
  } else {
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('JIREH', M, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('REAL ESTATE', M, 17);
  }
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('RECIBO DE PAGO', W - M, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`No. ${receiptNumber(r)}`, W - M, 17.5, { align: 'right' });

  // Monto destacado arriba a la derecha
  let y = 34;
  doc.setFillColor(247, 248, 250);
  doc.roundedRect(W - M - 62, y - 6, 62, 14, 2, 2, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...mute);
  doc.text('MONTO', W - M - 59, y - 1);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...ink);
  doc.text(fmtCur(r.amount, ccy), W - M - 3, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...mute);
  doc.text(`Fecha: ${fmtDate(r.paymentDate)}`, M, y - 1);

  // Cuerpo en forma de recibo tradicional
  y += 14;
  const labelW = 34;
  const row = (label, value) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ink);
    doc.text(label, M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 54, 62);
    const lines = doc.splitTextToSize(pdfSafe(value || '-'), W - 2 * M - labelW);
    doc.text(lines, M + labelW, y);
    doc.setDrawColor(225, 228, 234);
    const bottom = y + (lines.length - 1) * 4.6 + 2;
    doc.line(M + labelW, bottom, W - M, bottom);
    y = bottom + 6;
  };
  row('Recibimos de:', r.tenantName || 'Cliente');
  row('La suma de:', montoEnLetras(r.amount, ccy));
  row('Por concepto de:', [r.concept, periodo(r)].filter(Boolean).join(' de '));
  if (r.propertyName) row('Propiedad:', r.propertyName);
  if (r.method) row('Forma de pago:', r.method);
  if (ccy === 'USD' && r.exchangeRate) row('Tasa aplicada:', `1 US$ = RD$${r.exchangeRate}`);
  if (r.notes) row('Nota:', String(r.notes).slice(0, 160));

  // Firma
  const sy = Math.max(y + 10, doc.internal.pageSize.getHeight() - 18);
  doc.setDrawColor(150, 150, 150);
  doc.line(W - M - 62, sy, W - M, sy);
  doc.setFontSize(8); doc.setTextColor(...mute);
  doc.text('Recibido por - Jireh Real Estate', W - M - 31, sy + 4.5, { align: 'center' });
  if (r.createdBy) doc.text(pdfSafe(r.createdBy), W - M - 31, sy - 2, { align: 'center' });
  doc.setFontSize(7);
  doc.text(`Emitido el ${emitido(r)}`, M, sy + 4.5);

  return doc;
}

const fileName = (r) => {
  const who = (r.tenantName || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  return `Recibo_${receiptNumber(r)}_${who}.pdf`;
};

export async function downloadReceiptPDF(r) {
  const doc = await buildReceiptDoc(r);
  doc.save(fileName(r));
}

// ---------- Impresión directa ----------
// HTML en un iframe oculto: imprime igual en Safari, Chrome y Edge (un PDF
// dentro de un iframe no se puede imprimir de forma fiable en Safari).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function receiptHTML(r) {
  const ccy = r.currency === 'USD' ? 'USD' : 'DOP';
  const filas = [
    ['Recibimos de', r.tenantName || 'Cliente'],
    ['La suma de', montoEnLetras(r.amount, ccy)],
    ['Por concepto de', [r.concept, periodo(r)].filter(Boolean).join(' de ')],
    r.propertyName && ['Propiedad', r.propertyName],
    r.method && ['Forma de pago', r.method],
    ccy === 'USD' && r.exchangeRate && ['Tasa aplicada', `1 US$ = RD$${r.exchangeRate}`],
    r.notes && ['Nota', String(r.notes).slice(0, 160)]
  ].filter(Boolean);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(receiptNumber(r))}</title>
<style>
  @page { size: A5 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html { color-scheme: light; } body { background: #fff; margin: 0; font-family: Helvetica, Arial, sans-serif; color: #1a1f2c; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hoja { width: 210mm; height: 148mm; padding: 0 12mm 10mm; display: flex; flex-direction: column; }
  .banda { background: #f5c518; margin: 0 -12mm; padding: 4mm 12mm; display: flex; align-items: center; justify-content: space-between; height: 24mm; }
  .banda img { max-height: 16mm; max-width: 38mm; }
  .titulo { text-align: right; } .titulo b { font-size: 15pt; display: block; } .titulo span { font-size: 9pt; }
  .cab { display: flex; justify-content: space-between; align-items: center; margin: 6mm 0 4mm; font-size: 9pt; color: #5f6470; }
  .monto { background: #f7f8fa; border-radius: 2mm; padding: 2mm 3mm; min-width: 62mm; text-align: right; }
  .monto small { display: block; text-align: left; font-size: 7.5pt; }
  .monto b { font-size: 14pt; color: #1a1f2c; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  td { padding: 2.2mm 0; vertical-align: top; }
  td:first-child { width: 34mm; font-weight: bold; }
  td:last-child { border-bottom: 0.3mm solid #e1e4ea; color: #32363e; }
  .pie { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; font-size: 7.5pt; color: #5f6470; }
  .firma { width: 62mm; text-align: center; }
  .firma div { border-top: 0.3mm solid #969696; padding-top: 1.5mm; margin-top: 1mm; }
</style></head><body><div class="hoja">
  <div class="banda"><img src="/logo.png" alt="Jireh Real Estate" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'JIREH'}))">
    <div class="titulo"><b>RECIBO DE PAGO</b><span>No. ${esc(receiptNumber(r))}</span></div></div>
  <div class="cab"><span>Fecha: ${esc(fmtDate(r.paymentDate))}</span>
    <div class="monto"><small>MONTO</small><b>${esc(fmtCur(r.amount, ccy))}</b></div></div>
  <table>${filas.map(([k, v]) => `<tr><td>${esc(k)}:</td><td>${esc(v)}</td></tr>`).join('')}</table>
  <div class="pie"><span>Emitido el ${esc(emitido(r))}</span>
    <div class="firma">${esc(r.createdBy || '')}<div>Recibido por - Jireh Real Estate</div></div></div>
</div></body></html>`;
}

export function printReceipt(r) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const done = () => { setTimeout(() => frame.remove(), 1000); resolve(); };
    frame.onload = () => {
      const win = frame.contentWindow;
      const img = frame.contentDocument.querySelector('img');
      const go = () => { try { win.focus(); win.print(); } finally { done(); } };
      // Espera al logo para que salga en la hoja impresa
      if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
    };
    frame.srcdoc = receiptHTML(r);
  });
}
