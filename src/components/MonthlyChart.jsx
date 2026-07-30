import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmtCur } from '../utils/currency.js';

// Recharts pesa ~400 kB. Vive en su propio componente para poder cargarlo
// bajo demanda: así las tarjetas del dashboard pintan sin esperarlo.
export default function MonthlyChart({ data, view, chartCcy }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#7e8799' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
        <YAxis
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 12, fill: '#7e8799' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          cursor={{ fill: 'rgba(245, 197, 24, 0.08)' }}
          contentStyle={{
            borderRadius: 12,
            border: '1px solid #eef0f4',
            boxShadow: '0 4px 8px rgba(16,19,28,0.05), 0 16px 40px -8px rgba(16,19,28,0.18)',
            fontSize: 12
          }}
          formatter={(v, n) => {
            const c = String(n).includes('US$') ? 'USD' : chartCcy;
            return fmtCur(v, c);
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        {view === 'BOTH' ? (
          <>
            <Bar dataKey="Ingresos RD$" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Gastos RD$" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Ingresos US$" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Gastos US$" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </>
        ) : (
          <>
            <Bar dataKey="Ingresos" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="Gastos" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="Excedente" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
