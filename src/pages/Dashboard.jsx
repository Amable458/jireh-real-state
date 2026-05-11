import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, Calendar, Bell, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import PageHeader from '../components/PageHeader.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { usePeriod } from '../store/period.js';
import { fmtMoney, monthName } from '../utils/format.js';
import { monthlyTotals, yearMonthlySeries } from '../utils/calc.js';
import { db } from '../db/database.js';

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="card card-body flex items-start gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase font-semibold text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { year, month } = usePeriod();
  const [totals, setTotals] = useState(null);
  const [series, setSeries] = useState([]);
  const [contractAlerts, setContractAlerts] = useState([]);
  const [pendingRentals, setPendingRentals] = useState([]);

  useEffect(() => {
    (async () => {
      setTotals(await monthlyTotals(year, month));
      setSeries(await yearMonthlySeries(year));
      const tenants = await db.tenants.toArray();
      const today = new Date();
      const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      setContractAlerts(tenants.filter((t) => {
        if (!t.contractEnd) return false;
        const d = new Date(t.contractEnd);
        return d >= today && d <= in30;
      }));
      const rents = await db.rentals.where({ year, month }).toArray();
      setPendingRentals(rents.filter((r) => r.status !== 'pagado').slice(0, 5));
    })();
  }, [year, month]);

  if (!totals) return <div className="text-slate-400">Cargando...</div>;
  const negative = totals.surplus < 0;
  const chartData = series.map((s) => ({ name: monthName(s.month).slice(0, 3), Ingresos: s.income, Gastos: s.expenses, Excedente: s.surplus }));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${monthName(month)} ${year}`}
        actions={<><HelpButton content={HELP.dashboard} /><PeriodPicker /></>}
      />

      {negative && (
        <div className="mb-5 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
          <AlertTriangle className="text-red-600 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-red-800">Mes deficitario</p>
            <p className="text-sm text-red-700">Los gastos superaron a los ingresos. No se aplicará distribución de fondos este mes.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard icon={TrendingUp} label="Ingresos totales" value={fmtMoney(totals.totalIncome)} color="bg-emerald-500" sub={`Rentas: ${fmtMoney(totals.rentalsPaid + totals.rentalsPartial)}`} />
        <StatCard icon={TrendingDown} label="Gastos totales" value={fmtMoney(totals.expensesAll)} color="bg-red-500" sub={`Pagados: ${fmtMoney(totals.expensesPaid)}`} />
        <StatCard icon={Wallet} label="Balance neto" value={fmtMoney(totals.surplus)} color={negative ? 'bg-red-500' : 'bg-brand-700'} sub={negative ? 'Déficit del mes' : 'Excedente disponible'} />
        <StatCard icon={FileText} label="Comisiones" value={fmtMoney(totals.commissions)} color="bg-amber-500" sub={`${totals.sales.length} venta(s)`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="card card-body lg:col-span-2">
          <h3 className="font-semibold text-slate-700 mb-3">Comparativa mensual del año {year}</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ingresos" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Excedente" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card card-body">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Bell size={18} className="text-amber-500" /> Alertas
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar size={14} /> Contratos por vencer (30 días)
              </p>
              {contractAlerts.length === 0
                ? <p className="text-xs text-slate-400">Ninguno</p>
                : (
                  <ul className="space-y-1">
                    {contractAlerts.map((c) => (
                      <li key={c.id} className="flex justify-between gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        <span className="truncate">{c.name}</span>
                        <span className="text-xs text-amber-700 font-medium">{c.contractEnd}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <div>
              <p className="font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <AlertTriangle size={14} /> Rentas pendientes este mes
              </p>
              {pendingRentals.length === 0
                ? <p className="text-xs text-slate-400">Sin pendientes</p>
                : (
                  <ul className="space-y-1">
                    {pendingRentals.map((r) => (
                      <li key={r.id} className="flex justify-between gap-2 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                        <span className="truncate">{r.tenantName || `Inquilino #${r.tenantId}`}</span>
                        <span className="text-xs text-red-700 font-medium">{fmtMoney(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
