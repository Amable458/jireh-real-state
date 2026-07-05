import { fmtCur, recCurrency } from './currency.js';
import { fmtDate, monthName } from './format.js';

// Genera y descarga un recibo PDF para un ingreso pagado.
// jsPDF se importa dinámicamente para no engordar el chunk de Ingresos.
export async function generateReceiptPDF(income) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5' }); // A5 apaisado clásico de recibo
  const W = doc.internal.pageSize.getWidth();

  const ccy = recCurrency(income);
  const brand = [245, 197, 24];   // #f5c518
  const ink = [26, 31, 44];       // #1a1f2c

  // Banda de marca
  doc.setFillColor(...brand);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('JIREH', 10, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('REAL ESTATE', 10, 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RECIBO DE PAGO', W - 10, 12, { align: 'right' });

  // Número y fecha de emisión
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 30;
  doc.text(`Recibo No.: REC-${income.id}`, 10, y);
  doc.text(`Emitido: ${fmtDate(new Date().toISOString().slice(0, 10))}`, W - 10, y, { align: 'right' });

  // Cuerpo
  y += 10;
  const row = (label, value) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ink);
    doc.text(label, 10, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(String(value || '—'), 55, y);
    y += 7;
  };

  row('Recibido de:', income.tenantName || income.propertyName || 'Cliente');
  if (income.propertyName) row('Propiedad:', income.propertyName);
  row('Concepto:', income.category || 'Renta');
  row('Periodo:', `${monthName(income.month)} ${income.year}`);
  row('Fecha de pago:', fmtDate(income.date));
  if (ccy === 'USD' && income.exchangeRate) row('Tasa aplicada:', `1 US$ = RD$${income.exchangeRate}`);
  if (income.notes) {
    const clean = String(income.notes).slice(0, 120);
    row('Nota:', clean);
  }

  // Monto destacado
  y += 4;
  doc.setFillColor(247, 248, 250);
  doc.roundedRect(10, y - 6, W - 20, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ink);
  doc.setFontSize(11);
  doc.text('MONTO RECIBIDO', 14, y + 3);
  doc.setFontSize(14);
  doc.text(fmtCur(income.amount, ccy), W - 14, y + 3, { align: 'right' });

  // Estado
  y += 20;
  doc.setFontSize(10);
  doc.setTextColor(5, 150, 105);
  doc.text('✓ PAGADO', 10, y);

  // Firma
  y += 22;
  doc.setDrawColor(150, 150, 150);
  doc.line(W - 70, y, W - 10, y);
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Firma autorizada — Jireh Real Estate', W - 40, y + 5, { align: 'center' });

  const safeName = (income.tenantName || 'cliente').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Recibo_REC-${income.id}_${safeName}.pdf`);
}
