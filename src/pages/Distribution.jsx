import { useEffect, useState } from 'react';
import { Save, AlertTriangle, PieChart as PieIcon, Plus, Trash2, Lock, RotateCcw } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import PageHeader from '../components/PageHeader.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import { usePeriod } from '../store/period.js';
import { useAuth } from '../store/auth.js';
import { db, logActivity } from '../db/database.js';
import { fmtMoney, monthName } from '../utils/format.js';
import { monthlyTotals } from '../utils/calc.js';
import { applyDistribution, normalizeConfig, makeCategoryId, SYSTEM_BONUS_ID } from '../utils/distribution.js';

const COLORS = ['#dc2626', '#2563eb', '#059669', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c'];

export default function Distribution() {
  const { year, month } = usePeriod();
  const { user, hasRole } = useAuth();
  const canEdit = hasRole('SuperAdmin', 'Admin');
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState(null);
  const [totals, setTotals] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [deleteIdx, setDeleteIdx] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const c = normalizeConfig(await db.distributionConfig.get('default'));
      setCfg(c); setDraft(c);
      setTotals(await monthlyTotals(year, month));
    })();
  }, [year, month]);

  if (!cfg || !draft || !totals) return null;

  const sum = draft.categories.reduce((s, c) => s + (Number(c.percent) || 0), 0);
  const valid = sum === 100;

  const updatePercent = (idx, value) => {
    const next = [...draft.categories];
    next[idx] = { ...next[idx], percent: Math.max(0, Math.min(100, Number(value) || 0)) };
    setDraft({ ...draft, categories: next });
  };
  const updateName = (idx, name) => {
    if (draft.categories[idx].id === SYSTEM_BONUS_ID) return;
    const next = [...draft.categories];
    next[idx] = { ...next[idx], name };
    setDraft({ ...draft, categories: next });
  };
  const addCategory = () => {
    setDraft({
      ...draft,
      categories: [...draft.categories, { id: makeCategoryId('nueva'), name: 'Nueva categoría', percent: 0 }]
    });
  };
  const removeCategory = (idx) => {
    if (draft.categories[idx].id === SYSTEM_BONUS_ID) return;
    setDraft({ ...draft, categories: draft.categories.filter((_, i) => i !== idx) });
  };

  const save = async () => {
    if (!valid) { setMsg('Los porcentajes deben sumar 100%'); return; }
    if (!draft.categories.every((c) => c.name && c.name.trim())) {
      setMsg('Todas las categorías deben tener nombre'); return;
    }
    const payload = {
      key: 'default',
      categories: draft.categories.map((c) => ({
        id: c.id,
        name: c.name.trim(),
        percent: Number(c.percent) || 0,
        system: c.id === SYSTEM_BONUS_ID
      })),
      updatedAt: new Date().toISOString()
    };
    await db.distributionConfig.put(payload);
    setCfg(payload); setMsg('Configuración guardada');
    await logActivity(user.sub, user.username, 'distribution.config', JSON.stringify(payload.categories));
    setTimeout(() => setMsg(''), 2500);
  };

  const distribution = applyDistribution(totals.surplus, cfg);
  const pieData = distribution.map((d) => ({ name: d.name, value: d.amount }));

  return (
    <div>
      <PageHeader
        title="Distribución de Fondos"
        subtitle="Configuración de porcentajes y aplicación al excedente mensual"
        actions={<><HelpButton content={HELP.distribution} /><PeriodPicker /></>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card card-body">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-ink-700">Configuración de categorías</h3>
            {canEdit && (
              <button className="btn-secondary text-xs py-1" onClick={addCategory}>
                <Plus size={14} /> Añadir
              </button>
            )}
          </div>

          <div className="space-y-3">
            {draft.categories.map((c, i) => {
              const isSystem = c.id === SYSTEM_BONUS_ID;
              return (
                <div key={c.id} className={`p-3 rounded-lg border ${isSystem ? 'bg-red-50/50 border-red-200' : 'bg-ink-50 border-ink-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    {isSystem ? (
                      <div className="flex-1 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
                        {c.name}
                        <Lock size={12} className="text-red-600" />
                        <span className="text-xs text-red-700 font-normal">(sistema, ligado a Bonificaciones)</span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="input py-1 text-sm font-medium"
                        value={c.name}
                        disabled={!canEdit}
                        onChange={(e) => updateName(i, e.target.value)}
                        placeholder="Nombre de la categoría"
                      />
                    )}
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="0" max="100" step="0.5"
                        className="input py-1 w-20 text-sm text-right"
                        value={c.percent}
                        disabled={!canEdit}
                        onChange={(e) => updatePercent(i, e.target.value)}
                      />
                      <span className="text-sm font-semibold text-ink-600">%</span>
                    </div>
                    {canEdit && !isSystem && (
                      <button onClick={() => setDeleteIdx(i)} className="btn-ghost p-1 text-red-600" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    type="range" min="0" max="100" step="1" disabled={!canEdit}
                    value={c.percent || 0}
                    onChange={(e) => updatePercent(i, e.target.value)}
                    className="w-full accent-brand-500"
                  />
                </div>
              );
            })}
          </div>

          <div className={`mt-4 px-3 py-2 rounded-lg text-sm font-medium border ${valid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {valid ? `✓ Total: ${sum}%` : `Total actual: ${sum}% (debe ser 100%)`}
          </div>

          {canEdit && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <button className="btn-primary" onClick={() => setConfirm(true)} disabled={!valid}>
                <Save size={16} /> Guardar cambios
              </button>
              <button className="btn-secondary" onClick={() => setDraft(cfg)}>
                <RotateCcw size={14} /> Restaurar
              </button>
              {msg && <span className="text-sm text-emerald-700">{msg}</span>}
            </div>
          )}
          {!canEdit && <p className="mt-3 text-xs text-ink-500">Solo SuperAdmin / Admin pueden modificar la configuración.</p>}
        </div>

        <div className="card card-body">
          <h3 className="font-semibold text-ink-700 mb-3 flex items-center gap-2">
            <PieIcon size={18} /> Aplicación a {monthName(month)} {year}
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
            <div className="bg-emerald-50 rounded-lg p-3">
              <div className="text-xs text-emerald-700">Ingresos</div>
              <div className="font-bold text-emerald-800">{fmtMoney(totals.totalIncome)}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-xs text-red-700">Gastos</div>
              <div className="font-bold text-red-800">{fmtMoney(totals.expensesAll)}</div>
            </div>
            <div className={`${totals.surplus >= 0 ? 'bg-blue-50' : 'bg-red-100'} rounded-lg p-3`}>
              <div className="text-xs text-ink-700">Excedente</div>
              <div className={`font-bold ${totals.surplus >= 0 ? 'text-blue-800' : 'text-red-800'}`}>{fmtMoney(totals.surplus)}</div>
            </div>
          </div>

          {totals.surplus <= 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
              <AlertTriangle className="text-red-600 mt-0.5" size={18} />
              <div className="text-sm text-red-800">
                <p className="font-semibold">Sin distribución este mes</p>
                <p>Los gastos superan o igualan a los ingresos.</p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMoney(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
                {distribution.map((d, i) => (
                  <div key={d.id} className="flex justify-between items-center bg-ink-50 rounded px-3 py-2">
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="truncate">{d.name}</span>
                      <span className="text-xs text-ink-400">{d.percent}%</span>
                    </span>
                    <span className="font-semibold">{fmtMoney(d.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={save}
        title="Guardar configuración"
        message="¿Confirma actualizar las categorías y porcentajes de distribución? Esta acción se registrará en la bitácora."
      />

      <ConfirmModal
        open={deleteIdx !== null}
        onClose={() => setDeleteIdx(null)}
        onConfirm={() => { removeCategory(deleteIdx); setDeleteIdx(null); }}
        title="Eliminar categoría"
        message={`¿Eliminar la categoría "${deleteIdx !== null ? draft.categories[deleteIdx]?.name : ''}"? Recuerde revisar que los porcentajes sigan sumando 100%.`}
        danger
      />
    </div>
  );
}
