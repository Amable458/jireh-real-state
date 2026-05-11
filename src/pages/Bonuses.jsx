import { useEffect, useState } from 'react';
import { Award, AlertTriangle } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import DataTable from '../components/DataTable.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { usePeriod } from '../store/period.js';
import { fmtMoney, monthName } from '../utils/format.js';
import { calcBonuses } from '../utils/calc.js';

export default function Bonuses() {
  const { year, month } = usePeriod();
  const [data, setData] = useState(null);

  useEffect(() => { (async () => setData(await calcBonuses(year, month)))(); }, [year, month]);

  if (!data) return null;

  const columns = [
    { key: 'agentName', label: 'Agente' },
    { key: 'count', label: 'Rentas cerradas', render: (r) => r.count },
    { key: 'amount', label: 'Monto generado', render: (r) => fmtMoney(r.amount) },
    { key: 'bonus', label: 'Bonificación', render: (r) => <span className="font-bold text-emerald-700">{fmtMoney(r.bonus)}</span> }
  ];

  return (
    <div>
      <PageHeader
        title="Bonificaciones"
        subtitle={`${monthName(month)} ${year} — pool calculado del excedente mensual`}
        actions={<><HelpButton content={HELP.bonuses} /><PeriodPicker /></>}
      />

      {data.surplus <= 0 ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-5">
          <AlertTriangle className="text-red-600 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-red-800">Sin pool de bonificaciones</p>
            <p className="text-sm text-red-700">El mes cerró sin excedente positivo, no se generan bonificaciones.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div className="card card-body">
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase font-semibold"><Award size={14} /> Pool total</div>
            <p className="text-2xl font-bold text-emerald-700">{fmtMoney(data.pool)}</p>
          </div>
          <div className="card card-body">
            <p className="text-xs text-slate-500 uppercase font-semibold">Rentas cerradas</p>
            <p className="text-2xl font-bold text-brand-700">{data.totalRentals}</p>
          </div>
          <div className="card card-body">
            <p className="text-xs text-slate-500 uppercase font-semibold">Agentes con cierres</p>
            <p className="text-2xl font-bold text-slate-800">{data.byAgent.length}</p>
          </div>
        </div>
      )}

      <div className="card card-body">
        <DataTable columns={columns} rows={data.byAgent} emptyText="Sin cierres registrados este mes" />
      </div>
    </div>
  );
}
