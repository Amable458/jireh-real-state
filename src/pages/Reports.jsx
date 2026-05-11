import { useEffect, useState } from 'react';
import { FileText, FileSpreadsheet, Filter } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import PageHeader from '../components/PageHeader.jsx';
import { db } from '../db/database.js';
import { fmtMoney, fmtDate, monthsList, monthName, yearsList } from '../utils/format.js';
import { monthlyTotals, calcBonuses } from '../utils/calc.js';
import { applyDistribution } from '../utils/distribution.js';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';

export default function Reports() {
  const now = new Date();
  const [mode, setMode] = useState('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [fromY, setFromY] = useState(now.getFullYear());
  const [fromM, setFromM] = useState(1);
  const [toY, setToY] = useState(now.getFullYear());
  const [toM, setToM] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);

  const buildPeriods = () => {
    if (mode === 'year') return monthsList.map((m) => ({ year, month: m.value }));
    if (mode === 'month') return [{ year, month }];
    const out = [];
    let y = fromY, m = fromM;
    while (y < toY || (y === toY && m <= toM)) {
      out.push({ year: y, month: m });
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  };

  const generate = async () => {
    const periods = buildPeriods();
    const cfg = await db.distributionConfig.get('default');
    const months = [];
    for (const p of periods) {
      const t = await monthlyTotals(p.year, p.month);
      const b = await calcBonuses(p.year, p.month);
      const dist = applyDistribution(t.surplus, cfg);
      months.push({ ...p, totals: t, bonuses: b, distribution: dist });
    }
    const totalIncome = months.reduce((s, x) => s + x.totals.totalIncome, 0);
    const totalExpenses = months.reduce((s, x) => s + x.totals.expensesAll, 0);
    const totalSurplus = totalIncome - totalExpenses;
    setData({ months, totalIncome, totalExpenses, totalSurplus });
  };

  useEffect(() => { generate(); }, []); // eslint-disable-line

  const periodLabel = () => {
    if (mode === 'month') return `${monthName(month)} ${year}`;
    if (mode === 'year') return `Año ${year}`;
    return `${monthName(fromM)} ${fromY} – ${monthName(toM)} ${toY}`;
  };

  const exportPDF = () => {
    if (!data) return;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Jireh Real State — Reporte', 14, 16);
    doc.setFontSize(10); doc.text(`Periodo: ${periodLabel()}`, 14, 23);
    doc.text(`Generado: ${new Date().toLocaleString('es-DO')}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [['Mes', 'Ingresos', 'Gastos', 'Excedente', 'Comisiones']],
      body: data.months.map((m) => [
        `${monthName(m.month)} ${m.year}`,
        fmtMoney(m.totals.totalIncome),
        fmtMoney(m.totals.expensesAll),
        fmtMoney(m.totals.surplus),
        fmtMoney(m.totals.commissions)
      ]),
      foot: [['TOTAL', fmtMoney(data.totalIncome), fmtMoney(data.totalExpenses), fmtMoney(data.totalSurplus), '']],
      headStyles: { fillColor: [29, 78, 216] },
      footStyles: { fillColor: [226, 232, 240], textColor: 30 }
    });

    for (const m of data.months) {
      if (m.totals.rentals.length === 0 && m.totals.sales.length === 0 && m.totals.expenses.length === 0) continue;
      doc.addPage();
      doc.setFontSize(13); doc.text(`Detalle: ${monthName(m.month)} ${m.year}`, 14, 14);

      if (m.totals.rentals.length) {
        autoTable(doc, {
          startY: 20,
          head: [['Fecha', 'Propiedad', 'Inquilino', 'Agente', 'Monto', 'Estado']],
          body: m.totals.rentals.map((r) => [fmtDate(r.date), r.propertyName || '', r.tenantName || '', r.agentName || '', fmtMoney(r.amount), r.status]),
          headStyles: { fillColor: [5, 150, 105] },
          didDrawPage: () => doc.text('Rentas', 14, 18)
        });
      }
      if (m.totals.sales.length) {
        autoTable(doc, {
          head: [['Fecha', 'Propiedad', 'Comprador', 'Agente', 'Precio', 'Comisión']],
          body: m.totals.sales.map((r) => [fmtDate(r.date), r.propertyName || '', r.buyer || '', r.agentName || '', fmtMoney(r.price), fmtMoney(r.commission)]),
          headStyles: { fillColor: [37, 99, 235] }
        });
      }
      if (m.totals.expenses.length) {
        autoTable(doc, {
          head: [['Descripción', 'Mensual', 'Q1', 'Q2', 'Pago', 'Estado']],
          body: m.totals.expenses.map((r) => [r.description, fmtMoney(r.monthly), fmtMoney(r.q1), fmtMoney(r.q2), fmtDate(r.paymentDate), r.status]),
          headStyles: { fillColor: [220, 38, 38] }
        });
      }
      if (m.bonuses.byAgent.length) {
        autoTable(doc, {
          head: [['Agente', 'Cierres', 'Monto generado', 'Bonificación']],
          body: m.bonuses.byAgent.map((b) => [b.agentName, b.count, fmtMoney(b.amount), fmtMoney(b.bonus)]),
          headStyles: { fillColor: [245, 158, 11] }
        });
      }
    }

    doc.save(`Reporte_Jireh_${Date.now()}.pdf`);
  };

  const exportXLSX = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const summary = [['Mes', 'Año', 'Ingresos', 'Gastos', 'Excedente', 'Comisiones']];
    data.months.forEach((m) => summary.push([monthName(m.month), m.year, m.totals.totalIncome, m.totals.expensesAll, m.totals.surplus, m.totals.commissions]));
    summary.push(['TOTAL', '', data.totalIncome, data.totalExpenses, data.totalSurplus, '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Resumen');

    const allRentals = []; const allSales = []; const allExpenses = []; const allBonuses = []; const allDist = [];
    data.months.forEach((m) => {
      m.totals.rentals.forEach((r) => allRentals.push({ Año: m.year, Mes: monthName(m.month), Fecha: r.date, Propiedad: r.propertyName, Inquilino: r.tenantName, Agente: r.agentName, Monto: r.amount, Pagado: r.paid, Estado: r.status }));
      m.totals.sales.forEach((r) => allSales.push({ Año: m.year, Mes: monthName(m.month), Fecha: r.date, Propiedad: r.propertyName, Comprador: r.buyer, Agente: r.agentName, Precio: r.price, Comisión: r.commission }));
      m.totals.expenses.forEach((r) => allExpenses.push({ Año: m.year, Mes: monthName(m.month), Descripción: r.description, Mensual: r.monthly, Q1: r.q1, Q2: r.q2, FechaPago: r.paymentDate, Estado: r.status }));
      m.bonuses.byAgent.forEach((b) => allBonuses.push({ Año: m.year, Mes: monthName(m.month), Agente: b.agentName, Cierres: b.count, MontoGenerado: b.amount, Bonificación: b.bonus }));
      if (m.totals.surplus > 0) {
        const row = { Año: m.year, Mes: monthName(m.month), Excedente: m.totals.surplus };
        m.distribution.forEach((d) => { row[`${d.name} (${d.percent}%)`] = d.amount; });
        allDist.push(row);
      }
    });

    if (allRentals.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRentals), 'Rentas');
    if (allSales.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allSales), 'Ventas');
    if (allExpenses.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allExpenses), 'Gastos');
    if (allBonuses.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allBonuses), 'Bonificaciones');
    if (allDist.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allDist), 'Distribución');

    XLSX.writeFile(wb, `Reporte_Jireh_${Date.now()}.xlsx`);
  };

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Filtros por mes, rango o año. Exportación a PDF y Excel."
        actions={<HelpButton content={HELP.reports} />}
      />

      <div className="card card-body mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-slate-500" />
          <span className="font-semibold text-slate-700">Filtros</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Modo</label>
            <select className="input w-40" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="month">Mes específico</option>
              <option value="year">Año completo</option>
              <option value="range">Rango de meses</option>
            </select>
          </div>

          {mode === 'month' && (<>
            <div><label className="label">Año</label>
              <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearsList(5, 1).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div><label className="label">Mes</label>
              <select className="input w-36" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {monthsList.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </>)}

          {mode === 'year' && (
            <div><label className="label">Año</label>
              <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearsList(5, 1).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {mode === 'range' && (<>
            <div><label className="label">Desde</label>
              <div className="flex gap-2">
                <select className="input w-24" value={fromY} onChange={(e) => setFromY(Number(e.target.value))}>{yearsList(5, 1).map((y) => <option key={y} value={y}>{y}</option>)}</select>
                <select className="input w-32" value={fromM} onChange={(e) => setFromM(Number(e.target.value))}>{monthsList.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
              </div>
            </div>
            <div><label className="label">Hasta</label>
              <div className="flex gap-2">
                <select className="input w-24" value={toY} onChange={(e) => setToY(Number(e.target.value))}>{yearsList(5, 1).map((y) => <option key={y} value={y}>{y}</option>)}</select>
                <select className="input w-32" value={toM} onChange={(e) => setToM(Number(e.target.value))}>{monthsList.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
              </div>
            </div>
          </>)}

          <div className="flex gap-2 ml-auto">
            <button className="btn-primary" onClick={generate}>Generar</button>
            <button className="btn-danger" onClick={exportPDF} disabled={!data}><FileText size={16} /> PDF</button>
            <button className="btn-success" onClick={exportXLSX} disabled={!data}><FileSpreadsheet size={16} /> Excel</button>
          </div>
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="card card-body"><p className="text-xs text-slate-500 uppercase font-semibold">Ingresos</p><p className="text-xl font-bold text-emerald-700">{fmtMoney(data.totalIncome)}</p></div>
            <div className="card card-body"><p className="text-xs text-slate-500 uppercase font-semibold">Gastos</p><p className="text-xl font-bold text-red-700">{fmtMoney(data.totalExpenses)}</p></div>
            <div className="card card-body"><p className="text-xs text-slate-500 uppercase font-semibold">Excedente</p><p className={`text-xl font-bold ${data.totalSurplus >= 0 ? 'text-brand-700' : 'text-red-700'}`}>{fmtMoney(data.totalSurplus)}</p></div>
          </div>

          <div className="card card-body">
            <h3 className="font-semibold text-slate-700 mb-3">Detalle por mes — {periodLabel()}</h3>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Mes</th><th className="text-right">Ingresos</th><th className="text-right">Gastos</th><th className="text-right">Excedente</th><th className="text-right">Comisiones</th><th className="text-right">Pool bonos</th></tr></thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={`${m.year}-${m.month}`}>
                      <td className="font-medium">{monthName(m.month)} {m.year}</td>
                      <td className="text-right">{fmtMoney(m.totals.totalIncome)}</td>
                      <td className="text-right">{fmtMoney(m.totals.expensesAll)}</td>
                      <td className={`text-right font-semibold ${m.totals.surplus >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtMoney(m.totals.surplus)}</td>
                      <td className="text-right">{fmtMoney(m.totals.commissions)}</td>
                      <td className="text-right">{fmtMoney(m.bonuses.pool)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
