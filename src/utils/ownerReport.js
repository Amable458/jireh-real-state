import { fmtCur } from './currency.js';
import { fmtDate } from './format.js';
import { pdfSafe } from './receipt.js';

// ============================================================
// Reporte de gastos de propiedad — PDF para el propietario.
// Replica la plantilla Excel de la empresa: banda amarilla con logo,
// "Datos del Residente", "Periodo de Gastos", renta a la fecha y la
// tabla de gastos con Total Acumulado. Cierra con el neto a entregar.
// ============================================================

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Otro'];

export const emptyItem = () => ({ date: '', method: 'Efectivo', description: '', paidTo: 'Jireh Real State', amount: '' });

export const normalizeItems = (items) =>
  (Array.isArray(items) ? items : []).map((i) => ({
    date: i?.date || '',
    method: i?.method || 'Efectivo',
    description: i?.description || '',
    paidTo: i?.paidTo || '',
    amount: Number(i?.amount) || 0
  }));

export const itemsTotal = (items) => normalizeItems(items).reduce((s, i) => s + i.amount, 0);

// Logo de public/logo.png como data URL (jsPDF no puede leer una URL directa).
// Si falla (offline, ruta cambiada) el PDF sale igual, con la marca en texto.
async function loadLogo() {
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

// Construye el documento sin descargarlo (útil para pruebas y vista previa).
export async function buildOwnerReportDoc(report) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);
  const logo = await loadLogo();

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 12; // margen
  const brand = [245, 197, 24];   // #f5c518
  const brandSoft = [255, 247, 214];
  const ink = [26, 31, 44];       // #1a1f2c
  const line = [200, 204, 212];
  const ccy = report.currency === 'USD' ? 'USD' : 'DOP';
  const items = normalizeItems(report.items);
  const total = itemsTotal(items);
  const rent = Number(report.rentAmount) || 0;

  // ---------- Banda superior ----------
  doc.setFillColor(...brand);
  doc.rect(0, 0, W, 30, 'F');
  if (logo) {
    try {
      // Encaja el logo en una caja de 42×20 mm respetando su proporción real,
      // en vez de estirarlo a un tamaño fijo.
      const { width: iw, height: ih } = doc.getImageProperties(logo);
      const boxW = 42, boxH = 20;
      const k = Math.min(boxW / iw, boxH / ih);
      const w = iw * k, h = ih * k;
      doc.addImage(logo, 'PNG', M, 5 + (boxH - h) / 2, w, h);
    } catch { /* sin logo */ }
  } else {
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('JIREH', M, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('REAL ESTATE', M, 20);
  }
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Reporte de Gastos', W / 2, 14, { align: 'center' });
  doc.setFontSize(11);
  doc.text('Datos del Residente', W / 2, 23, { align: 'center' });

  // ---------- Cajas de datos ----------
  let y = 30;
  const boxH = 9;
  const full = W - 2 * M;
  const half = full / 2;
  const field = (label, value, x, w) => {
    doc.setDrawColor(...line);
    doc.rect(x, y, w, boxH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink);
    doc.text(label, x + 2, y + 6);
    // Medir con la negrita todavía activa: es más ancha que la normal y
    // medirla después hacía que el valor se montara sobre la etiqueta.
    const lx = x + 2 + doc.getTextWidth(label) + 3;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
    doc.text(pdfSafe(value || ''), lx, y + 6, { maxWidth: x + w - lx - 2 });
  };

  field('Nombre del Propietario:', report.ownerName, M, half);
  field('Nombre del inquilino:', report.tenantName, M + half, half);
  y += boxH;
  field('Direccion:', report.address, M, full); y += boxH;
  field('No. de Apartamento:', report.apartmentNo, M, full); y += boxH;
  field('Nombre del Residencial:', report.residentialName, M, full); y += boxH;

  // ---------- Periodo ----------
  doc.setFillColor(...brand);
  doc.rect(M, y, full, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink);
  doc.text('Periodo de Gastos', W / 2, y + 5.7, { align: 'center' });
  y += 8;
  field('Desde:', fmtDate(report.periodFrom), M, half);
  field('Fecha de Pago:', fmtDate(report.paymentDate), M + half, half);
  y += boxH;
  field('Hasta:', fmtDate(report.periodTo), M, half);
  field('Cuenta a depositar:', report.depositAccount, M + half, half);
  y += boxH + 4;

  // ---------- Renta a la fecha ----------
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ink);
  doc.text('TOTAL A LA FECHA MONTO DE RENTA:', W - M - 40, y + 4, { align: 'right' });
  doc.setFontSize(11);
  doc.text(fmtCur(rent, ccy), W - M, y + 4, { align: 'right' });
  y += 8;

  // ---------- Tabla de gastos ----------
  let acc = 0;
  const body = items.map((i) => {
    acc += i.amount;
    return [
      fmtDate(i.date) || '',
      pdfSafe(i.method),
      pdfSafe(i.description),
      pdfSafe(i.paidTo),
      fmtCur(i.amount, ccy),
      fmtCur(acc, ccy)
    ];
  });
  // Filas vacias para que quede espacio de escritura, como en la plantilla
  const blanks = Math.max(0, 8 - body.length);
  for (let k = 0; k < blanks; k++) body.push(['', '', '', '', '', '']);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Fecha de Pago', 'Forma de Pago', 'Descripcion', 'Pagado a:', 'Importe Pagado', 'Total Acumulado']],
    body,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, lineColor: line, lineWidth: 0.2, textColor: [40, 40, 40], minCellHeight: 7 },
    headStyles: { fillColor: brand, textColor: ink, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 26 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 34 },
      4: { cellWidth: 27, halign: 'right' },
      5: { cellWidth: 30, halign: 'right', fillColor: brandSoft, fontStyle: 'bold' }
    }
  });
  y = doc.lastAutoTable.finalY + 6;

  // ---------- Resumen ----------
  const net = rent - total;
  const sumW = 92;
  const sx = W - M - sumW;
  const sumRow = (label, value, bold = false, color = ink) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 10.5 : 9.5);
    doc.setTextColor(...color);
    doc.text(label, sx, y);
    doc.text(value, W - M, y, { align: 'right' });
    y += 6.5;
  };
  doc.setFillColor(247, 248, 250);
  doc.roundedRect(sx - 4, y - 5, sumW + 4, 27, 2, 2, 'F');
  sumRow('Total gastado en la propiedad', fmtCur(total, ccy));
  sumRow('Renta cobrada a la fecha', fmtCur(rent, ccy));
  doc.setDrawColor(...line); doc.line(sx, y - 3.5, W - M, y - 3.5);
  sumRow(
    net >= 0 ? 'Neto a entregar al propietario' : 'Saldo a favor de Jireh',
    fmtCur(Math.abs(net), ccy),
    true,
    net >= 0 ? [5, 150, 105] : [185, 28, 28]
  );

  // ---------- Notas ----------
  if (report.notes) {
    y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink);
    doc.text('Notas:', M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(pdfSafe(report.notes), full - 16);
    doc.text(lines, M + 14, y);
    y += lines.length * 4.5 + 2;
  }

  // ---------- Firma y pie ----------
  const H = doc.internal.pageSize.getHeight();
  const fy = Math.max(y + 18, H - 30);
  doc.setDrawColor(150, 150, 150);
  doc.line(M, fy, M + 65, fy);
  doc.line(W - M - 65, fy, W - M, fy);
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text('Recibido por el propietario', M + 32.5, fy + 5, { align: 'center' });
  doc.text('Jireh Real Estate', W - M - 32.5, fy + 5, { align: 'center' });
  doc.setFontSize(7.5);
  const stamp = `Generado el ${fmtDate(new Date().toISOString().slice(0, 10))}` + (report.id ? ` - Reporte No. RP-${report.id}` : '');
  doc.text(stamp, W / 2, H - 8, { align: 'center' });

  return doc;
}

// Genera y descarga el PDF.
export async function generateOwnerReportPDF(report) {
  const doc = await buildOwnerReportDoc(report);
  const who = (report.ownerName || report.residentialName || 'propietario').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  const per = report.periodFrom ? `_${String(report.periodFrom).slice(0, 7)}` : '';
  doc.save(`Reporte_Gastos_${who}${per}.pdf`);
}
