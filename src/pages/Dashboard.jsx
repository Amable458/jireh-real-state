import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, Calendar, Bell, FileText, Pencil } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import PageHeader from '../components/PageHeader.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import Modal from '../components/Modal.jsx';
import { usePeriod } from '../store/period.js';
import { useAuth } from '../store/auth.js';
import { useSettings } from '../store/settings.js';
import { monthName } from '../utils/format.js';
import { fmtCur, recCurrency } from '../utils/currency.js';
import { monthlyTotals, yearMonthlySeries } from '../utils/calc.js';
import { ensureTenantCharges } from '../utils/tenantCharges.js';
import { db } from '../db/database.js';
import { useRealtimeTable } from '../hooks/useRealtimeTable.js';

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="card card-body flex items-start gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase font-semibold text-ink-500">{label}</p>
        <p className="text-xl font-bold text-ink-800 truncate">{value}</p>
        {sub && <p className="text-xs text-ink-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const VIEWS = [
  { value: 'DOP', label: 'RD$' },
  { value: 'USD', label: 'US$' },
  { value: 'BOTH', label: 'Ambas' },
  { value: 'CONVERTED', label: 'Convertido a RD$' }
];

export default function Dashboard() {
  const { year, month } = usePeriod();
  const { user, hasRole } = useAuth();
  const { usdToDop, setRate } = useSettings();
  const [totals, setTotals] = useState(null);
  const [series, setSeries] = useState([]);
  const [contractAlerts, setContractAlerts] = useState([]);
  const [pendingRentals, setPendingRentals] = useState([]);
  const [view, setView] = useState('BOTH');
  const [rateModal, setRateModal] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [rateErr, setRateErr] = useState('');

  const canEditRate = hasRole('SuperAdmin', 'Admin');

  const load = async () => {
    await ensureTenantCharges(year, month); // genera rentas pendientes; el pago a propietario nace al cobrar
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
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [year, month]);
  useRealtimeTable(['rentals', 'sales', 'expenses', 'tenants', 'settings'], () => load());

  if (!totals) return <div className="text-ink-400">Cargando...</div>;

  const saveRate = async () => {
    setRateErr('');
    try {
      await setRate(rateInput, user);
      setRateModal(false);
      load();
    } catch (e) {
      setRateErr(e.message);
    }
  };

  // Selección de datos según vista
  const dop = totals.cur.DOP;
  const usd = totals.cur.USD;
  const base = totals; // consolidado en DOP (campos planos)

  const negativeDOP = dop.surplus < 0;
  const negativeUSD = usd.surplus < 0;
  const negativeBase = base.surplus < 0;
  const showDeficit = view === 'CONVERTED' ? negativeBase : view === 'USD' ? negativeUSD : negativeDOP;

  // Tarjetas según la vista (sin comisiones: van en su panel dedicado abajo)
  const renderCards = () => {
    if (view === 'BOTH') {
      return (
        <>
          <StatCard icon={TrendingUp} label="Ingresos RD$" value={fmtCur(dop.totalIncome, 'DOP')} color="bg-emerald-500" />
          <StatCard icon={TrendingUp} label="Ingresos US$" value={fmtCur(usd.totalIncome, 'USD')} color="bg-emerald-600" />
          <StatCard icon={TrendingDown} label="Gastos pagados RD$" value={fmtCur(dop.expensesPaid, 'DOP')} color="bg-red-500"
            sub={dop.expensesAll > dop.expensesPaid ? `Pendiente: ${fmtCur(dop.expensesAll - dop.expensesPaid, 'DOP')}` : undefined} />
          <StatCard icon={TrendingDown} label="Gastos pagados US$" value={fmtCur(usd.expensesPaid, 'USD')} color="bg-red-600"
            sub={usd.expensesAll > usd.expensesPaid ? `Pendiente: ${fmtCur(usd.expensesAll - usd.expensesPaid, 'USD')}` : undefined} />
          <StatCard icon={Wallet} label="Balance RD$" value={fmtCur(dop.surplus, 'DOP')} color={negativeDOP ? 'bg-red-500' : 'bg-ink-900'} />
          <StatCard icon={Wallet} label="Balance US$" value={fmtCur(usd.surplus, 'USD')} color={negativeUSD ? 'bg-red-500' : 'bg-ink-800'} />
        </>
      );
    }
    const d = view === 'USD' ? usd : view === 'CONVERTED' ? base : dop;
    const ccy = view === 'USD' ? 'USD' : 'DOP';
    const neg = d.surplus < 0;
    const suffix = view === 'CONVERTED' ? ' (convertido a RD$)' : '';
    return (
      <>
        <StatCard icon={TrendingUp} label={`Ingresos totales${suffix}`} value={fmtCur(d.totalIncome, ccy)} color="bg-emerald-500" sub={`Rentas: ${fmtCur((d.rentalsPaid || 0) + (d.rentalsPartial || 0), ccy)}`} />
        <StatCard icon={TrendingDown} label={`Gastos pagados${suffix}`} value={fmtCur(d.expensesPaid || 0, ccy)} color="bg-red-500"
          sub={(d.expensesAll || 0) > (d.expensesPaid || 0) ? `Comprometido total: ${fmtCur(d.expensesAll, ccy)}` : 'Sin pendientes'} />
        <StatCard icon={Wallet} label={`Balance neto${suffix}`} value={fmtCur(d.surplus, ccy)} color={neg ? 'bg-red-500' : 'bg-ink-900'} sub={neg ? 'Déficit del mes' : 'Excedente disponible'} />
      </>
    );
  };

  // Resumen de rentas de inquilinos + comisión total (rentas + ventas)
  const rentSummary = (() => {
    const mk = () => ({ rent: 0, comm: 0, count: 0 });
    const s = { DOP: mk(), USD: mk() };
    for (const r of totals.rentals) {
      if (r.commissionAmount == null && r.commissionPercent == null) continue;
      const c = recCurrency(r);
      s[c].rent += Number(r.amount) || 0;
      s[c].comm += Number(r.commissionAmount) || 0;
      s[c].count += 1;
    }
    // Sumar también la comisión de ventas (cierres) a "lo que nos toca"
    for (const v of totals.sales) {
      const c = recCurrency(v);
      s[c].comm += Number(v.commission) || 0;
    }
    return s;
  })();
  const hasCommission = rentSummary.DOP.comm > 0 || rentSummary.USD.comm > 0 || rentSummary.DOP.count > 0 || rentSummary.USD.count > 0;

  // Datos de la gráfica según vista
  const chartData = series.map((s) => {
    const name = monthName(s.month).slice(0, 3);
    if (view === 'BOTH') {
      return { name, 'Ingresos RD$': s.dop.income, 'Gastos RD$': s.dop.expenses, 'Ingresos US$': s.usd.income, 'Gastos US$': s.usd.expenses };
    }
    const d = view === 'USD' ? s.usd : view === 'CONVERTED' ? s.base : s.dop;
    return { name, Ingresos: d.income, Gastos: d.expenses, Excedente: d.surplus };
  });

  const chartCcy = view === 'USD' ? 'USD' : 'DOP';

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${monthName(month)} ${year}`}
        actions={<><HelpButton content={HELP.dashboard} /><PeriodPicker /></>}
      />

      {/* Barra de control de moneda */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="inline-flex rounded-lg border border-ink-200 bg-white p-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${view === v.value ? 'bg-brand-500 text-ink-900 font-semibold' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-600">
          <span>Tasa USD → DOP: <b className="text-ink-900">{usdToDop}</b></span>
          {canEditRate && (
            <button onClick={() => { setRateInput(String(usdToDop)); setRateErr(''); setRateModal(true); }} className="btn-ghost p-1.5" title="Editar tasa">
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>

      {showDeficit && (
        <div className="mb-5 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
          <AlertTriangle className="text-red-600 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-red-800">Mes deficitario</p>
            <p className="text-sm text-red-700">Los gastos superaron a los ingresos. No se aplicará distribución de fondos este mes.</p>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${view === 'BOTH' ? 'lg:grid-cols-4' : 'lg:grid-cols-4'} gap-4 mb-5`}>
        {renderCards()}
      </div>

      {hasCommission && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="card card-body">
            <p className="text-xs uppercase font-semibold text-ink-500 mb-1">Rentas de inquilinos (cobro del mes)</p>
            {rentSummary.DOP.count > 0 && <p className="text-lg font-bold text-ink-900">{fmtCur(rentSummary.DOP.rent, 'DOP')}</p>}
            {rentSummary.USD.count > 0 && <p className="text-lg font-bold text-ink-900">{fmtCur(rentSummary.USD.rent, 'USD')}</p>}
            {rentSummary.DOP.count + rentSummary.USD.count === 0 && <p className="text-lg font-bold text-ink-400">—</p>}
            <p className="text-xs text-ink-500 mt-1">{rentSummary.DOP.count + rentSummary.USD.count} renta(s) — monto total a cobrar a inquilinos</p>
          </div>
          <div className="card card-body">
            <p className="text-xs uppercase font-semibold text-ink-500 mb-1">Comisión — lo que nos toca</p>
            {rentSummary.DOP.comm > 0 && <p className="text-lg font-bold text-emerald-700">{fmtCur(rentSummary.DOP.comm, 'DOP')}</p>}
            {rentSummary.USD.comm > 0 && <p className="text-lg font-bold text-emerald-700">{fmtCur(rentSummary.USD.comm, 'USD')}</p>}
            {rentSummary.DOP.comm === 0 && rentSummary.USD.comm === 0 && <p className="text-lg font-bold text-ink-400">—</p>}
            <p className="text-xs text-ink-500 mt-1">Comisión de rentas (% de inquilinos) + comisión de ventas</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="card card-body lg:col-span-2">
          <h3 className="font-semibold text-ink-700 mb-3">
            Comparativa mensual del año {year}
            {view === 'CONVERTED' && <span className="text-xs font-normal text-ink-400 ml-2">(convertido a RD$)</span>}
            {view === 'BOTH' && <span className="text-xs font-normal text-ink-400 ml-2">(RD$ y US$ por separado)</span>}
          </h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, n) => {
                  const c = String(n).includes('US$') ? 'USD' : chartCcy;
                  return fmtCur(v, c);
                }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {view === 'BOTH' ? (
                  <>
                    <Bar dataKey="Ingresos RD$" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Gastos RD$" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Ingresos US$" fill="#34d399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Gastos US$" fill="#f87171" radius={[4, 4, 0, 0]} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="Ingresos" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Gastos" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Excedente" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card card-body">
          <h3 className="font-semibold text-ink-700 mb-3 flex items-center gap-2">
            <Bell size={18} className="text-amber-500" /> Alertas
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-ink-600 mb-1 flex items-center gap-1">
                <Calendar size={14} /> Contratos por vencer (30 días)
              </p>
              {contractAlerts.length === 0
                ? <p className="text-xs text-ink-400">Ninguno</p>
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
              <p className="font-semibold text-ink-600 mb-1 flex items-center gap-1">
                <AlertTriangle size={14} /> Rentas pendientes este mes
              </p>
              {pendingRentals.length === 0
                ? <p className="text-xs text-ink-400">Sin pendientes</p>
                : (
                  <ul className="space-y-1">
                    {pendingRentals.map((r) => (
                      <li key={r.id} className="flex justify-between gap-2 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                        <span className="truncate">{r.tenantName || `Inquilino #${r.tenantId}`}</span>
                        <span className="text-xs text-red-700 font-medium">{fmtCur(r.amount, recCurrency(r))}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* Editor de tasa */}
      <Modal
        open={rateModal} onClose={() => setRateModal(false)}
        title="Tasa de cambio USD → DOP" size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setRateModal(false)}>Cancelar</button>
          <button className="btn-primary" onClick={saveRate}>Guardar</button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">Define cuántos pesos dominicanos (RD$) equivale 1 dólar (US$). Se usará como tasa por defecto al registrar montos en US$.</p>
          <div>
            <label className="label">1 US$ = ? RD$</label>
            <input type="number" step="0.01" min="0" className="input" value={rateInput} onChange={(e) => setRateInput(e.target.value)} autoFocus />
          </div>
          <p className="text-xs text-ink-400">Cada transacción guarda la tasa usada en su momento, así que cambiar esta tasa global no altera los registros históricos.</p>
          {rateErr && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{rateErr}</div>}
        </div>
      </Modal>
    </div>
  );
}
