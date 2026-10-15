import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, Copy, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { usePeriod } from '../store/period.js';
import { useAuth } from '../store/auth.js';
import { db, logActivity, getDataVersion } from '../db/database.js';
import { useRealtimeTable } from '../hooks/useRealtimeTable.js';
import { useSettings } from '../store/settings.js';
import { fmtDate, todayISO } from '../utils/format.js';
import { fmtCur, recCurrency } from '../utils/currency.js';
import { ensureTenantCharges } from '../utils/tenantCharges.js';
import { isAutoExpense } from '../utils/autoExpense.js';
import CurrencyFields from '../components/CurrencyFields.jsx';
import { toast } from '../store/toast.js';
import MoneyInput, { isBadMoney } from '../components/MoneyInput.jsx';
import {
  partes, estadoDerivado, etiquetaEstado, montoPagado, montoPendiente, siguientePendiente,
  parchePago, cuadraConMensual, nombreQuincena, diaQuincena
} from '../utils/expenseQuincenas.js';

const empty = () => ({
  description: '', monthly: '', q1: '', q2: '',
  paymentDate: todayISO(), recurring: 1, notes: '',
  currency: 'DOP', exchangeRate: '',
  q1Paid: false, q2Paid: false, q1PaidAt: '', q2PaidAt: ''
});

// Campos del estado por quincena (existen solo después de migration_quincenas.sql)
const CAMPOS_QUINCENA = ['q1Paid', 'q2Paid', 'q1PaidAt', 'q2PaidAt', 'revisarQuincenas'];
const faltaMigracion = (err) => /q1Paid|q2Paid|q1PaidAt|q2PaidAt|revisarQuincenas|expenses_status_check|schema cache/i.test(err?.message || '');
const sinCamposQuincena = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !CAMPOS_QUINCENA.includes(k)));

// Montos de cada quincena a partir de lo escrito en el formulario.
// Vacías las dos → mitad y mitad. Una escrita → la otra completa el mensual.
function montosQuincenas(form) {
  const m = Number(form.monthly) || 0;
  const v1 = form.q1 === '' ? null : Number(form.q1) || 0;
  const v2 = form.q2 === '' ? null : Number(form.q2) || 0;
  if (v1 == null && v2 == null) return { q1: m / 2, q2: m / 2 };
  if (v1 == null) return { q1: Math.max(0, m - v2), q2: v2 };
  if (v2 == null) return { q1: v1, q2: Math.max(0, m - v1) };
  return { q1: v1, q2: v2 };
}

// Chip de estado de una quincena en la tabla
function ChipQuincena({ r, n }) {
  const monto = Number(r[`q${n}`]) || 0;
  const ccy = recCurrency(r);
  if (monto <= 0) return <span className="text-ink-300">—</span>;
  const p = partes(r).find((x) => x.n === n);
  return (
    <div className="leading-snug whitespace-nowrap">
      <div>{fmtCur(monto, ccy)}</div>
      {p?.pagada ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 size={12} aria-hidden="true" /> Pagada{p.fecha ? ` ${fmtDate(p.fecha)}` : ''}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
          <Circle size={12} aria-hidden="true" /> Pendiente
        </span>
      )}
    </div>
  );
}

export default function Expenses() {
  const { year, month } = usePeriod();
  const { user, hasRole } = useAuth();
  // Borrar: solo Admin/SuperAdmin (la BD lo exige también)
  const canDelete = hasRole('SuperAdmin', 'Admin');
  const { usdToDop } = useSettings();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [curFilter, setCurFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all | conPendiente | pendiente | parcial | pagado
  const [pay, setPay] = useState({ open: false, row: null });
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);

  const ensureRecurring = async () => {
    const current = await db.expenses.where({ year, month }).toArray();
    // Solo cuenta lo que registró una persona. Los gastos que genera el propio
    // sistema (pago a propietario, bono de administración, desglose de
    // contrato, reparto a colegas) NO significan que el mes ya esté trabajado:
    // darlos por manuales impedía copiar los recurrentes del mes anterior.
    const manual = current.filter((e) => !isAutoExpense(e));
    if (manual.length > 0) return;
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const previous = await db.expenses.where({ year: prev.y, month: prev.m }).toArray();
    const recurring = previous.filter((e) => e.recurring);
    if (recurring.length === 0) return;
    const cloned = recurring.map(({ id, ...e }) => {
      const c = {
        ...e, year, month, status: 'pendiente',
        paymentDate: `${year}-${String(month).padStart(2, '0')}-15`,
        createdAt: new Date().toISOString()
      };
      // El mes nuevo empieza con todas las quincenas sin pagar. Solo se tocan
      // los campos que existen (antes de la migración no vienen en el registro).
      if ('q1Paid' in e) c.q1Paid = false;
      if ('q2Paid' in e) c.q2Paid = false;
      if ('q1PaidAt' in e) c.q1PaidAt = null;
      if ('q2PaidAt' in e) c.q2PaidAt = null;
      if ('revisarQuincenas' in e) c.revisarQuincenas = false;
      return c;
    });
    try { await db.expenses.bulkAdd(cloned); }
    catch (e) { console.warn('[Jireh] Copia de gastos recurrentes:', e.message); }
    await logActivity(user.sub, user.username, 'expenses.autocopy', `${cloned.length} de ${prev.y}-${prev.m}`);
  };

  // Solo relee y pinta. Barato.
  const refresh = async () => {
    setRows(await db.expenses.where({ year, month }).toArray());
  };

  // Al abrir el módulo o cambiar de periodo: pinta ya, genera lo que falte
  // (recurrentes, cargos del mes) y repinta solo si se escribió algo.
  const load = async () => {
    await refresh(); // pinta de inmediato con lo que ya hay
    const v = getDataVersion();
    await ensureRecurring();
    await ensureTenantCharges(year, month); // genera rentas pendientes y limpia pagos a propietario huérfanos
    if (getDataVersion() !== v) await refresh();
  };

  useEffect(() => { load(); }, [year, month]);
  // Un cambio en otro dispositivo solo debe refrescar la vista: regenerar aquí
  // repetía toda la generación en cada evento.
  useRealtimeTable('expenses', () => refresh());

  // Guarda con respaldo: si la migración de quincenas aún no se corrió, guarda
  // sin esos campos (comportamiento anterior). Un pago PARCIAL no se puede
  // representar sin la migración: en ese caso se avisa en vez de mentir.
  const guardar = async (id, payload) => {
    try {
      if (id) { await db.expenses.update(id, payload); return id; }
      return await db.expenses.add(payload);
    } catch (err) {
      if (!faltaMigracion(err)) throw err;
      if (payload.status === 'parcial') {
        throw new Error('Para registrar el pago de una sola quincena falta ejecutar supabase/migration_quincenas.sql en Supabase.');
      }
      const legacy = sinCamposQuincena(payload);
      if (id) { await db.expenses.update(id, legacy); return id; }
      return await db.expenses.add(legacy);
    }
  };

  const onAdd = () => {
    setEditId(null); setSaveErr('');
    setForm({ ...empty(), paymentDate: `${year}-${String(month).padStart(2, '0')}-15` });
    setOpen(true);
  };
  const onEdit = (r) => {
    setEditId(r.id); setSaveErr('');
    const p = partes(r);
    const q1p = p.find((x) => x.n === 1 || x.n === 0);
    const q2p = p.find((x) => x.n === 2);
    setForm({
      ...empty(), ...r,
      monthly: r.monthly ?? '', q1: r.q1 ?? '', q2: r.q2 ?? '',
      currency: r.currency || 'DOP', exchangeRate: r.exchangeRate ?? '',
      q1Paid: !!q1p?.pagada, q2Paid: !!q2p?.pagada,
      q1PaidAt: q1p?.fecha || '', q2PaidAt: q2p?.fecha || ''
    });
    setOpen(true);
  };

  // Montos de quincena calculados en vivo (para mostrar las casillas de pago)
  const fq = montosQuincenas(form);
  const sumaNoCuadra = Number(form.monthly) > 0 && Math.abs(fq.q1 + fq.q2 - Number(form.monthly)) > 0.009;

  const save = async (e) => {
    e?.preventDefault?.();
    setSaveErr('');
    if (!String(form.description || '').trim()) { setSaveErr('Escribe la descripción del gasto.'); return; }
    if (['monthly', 'q1', 'q2'].some((k) => isBadMoney(form[k]))) { setSaveErr('Hay un monto que no es válido. Escribe solo números, por ejemplo 17,500.'); return; }
    const monthly = Number(form.monthly) || 0;
    if (monthly <= 0) { setSaveErr('Escribe el monto mensual.'); return; }
    const { q1, q2 } = fq;
    if (sumaNoCuadra) {
      setSaveErr(`Quincena 1 + Quincena 2 = ${fmtCur(q1 + q2, form.currency)}, pero el mensual es ${fmtCur(monthly, form.currency)}. Deben sumar lo mismo.`);
      return;
    }
    const currency = form.currency === 'USD' ? 'USD' : 'DOP';
    const exchangeRate = currency === 'USD' ? (Number(form.exchangeRate) || usdToDop) : null;
    const hoy = todayISO();
    const q1Paid = q1 > 0 && !!form.q1Paid;
    const q2Paid = q2 > 0 && !!form.q2Paid;
    const quincenas = {
      q1Paid, q2Paid,
      q1PaidAt: q1Paid ? (form.q1PaidAt || hoy) : null,
      q2PaidAt: q2Paid ? (form.q2PaidAt || hoy) : null,
      revisarQuincenas: false
    };
    const payload = {
      year, month,
      description: form.description.trim(),
      monthly, q1, q2,
      paymentDate: form.paymentDate,
      currency, exchangeRate,
      recurring: form.recurring ? 1 : 0,
      notes: form.notes || '',
      ...quincenas,
      status: estadoDerivado({ monthly, q1, q2, ...quincenas })
    };
    setSaving(true);
    try {
      if (editId) {
        await guardar(editId, payload);
        await logActivity(user.sub, user.username, 'expense.update', `id=${editId}`);
      } else {
        const id = await guardar(null, { ...payload, createdAt: new Date().toISOString() });
        await logActivity(user.sub, user.username, 'expense.create', `id=${id}`);
      }
      setOpen(false);
      await load();
    } catch (ex) {
      setSaveErr(ex?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await db.expenses.delete(id);
    await logActivity(user.sub, user.username, 'expense.delete', `id=${id}`);
    load();
  };

  // Paga una o varias quincenas. `cuales`: [1], [2], [1,2] o [0] (pago único).
  const pagar = async (row, cuales) => {
    if (payingRef.current) return;
    payingRef.current = true; setPaying(true);
    try {
      const patch = parchePago(row, cuales);
      await guardar(row.id, patch);
      const det = cuales.includes(0) ? 'completo' : cuales.map((n) => `q${n}`).join('+');
      await logActivity(user.sub, user.username, 'expense.paid', `id=${row.id} ${det}`);
      toast.success(patch.status === 'pagado' ? 'Gasto pagado completo.' : `${nombreQuincena(cuales[0])} pagada. Queda pendiente la otra.`);
      setPay({ open: false, row: null });
      await load();
    } catch (ex) {
      toast.error(ex?.message || 'Error al registrar el pago');
    } finally {
      payingRef.current = false; setPaying(false);
    }
  };

  const visibleRows = useMemo(() =>
    rows.filter((r) => {
      if (curFilter !== 'all' && recCurrency(r) !== curFilter) return false;
      if (statusFilter === 'all') return true;
      const est = estadoDerivado(r);
      if (statusFilter === 'conPendiente') return est !== 'pagado';
      return est === statusFilter;
    }),
    [rows, curFilter, statusFilter]
  );

  // Tarjetas: total y, por quincena, cuánto se ha pagado y cuánto falta
  const totals = useMemo(() => {
    const mk = () => ({ monthly: 0, paid: 0, pending: 0, q1: 0, q1Paid: 0, q2: 0, q2Paid: 0 });
    const t = { DOP: mk(), USD: mk() };
    for (const r of rows) {
      const c = recCurrency(r);
      t[c].monthly += Number(r.monthly) || 0;
      t[c].paid += montoPagado(r);
      t[c].pending += montoPendiente(r);
      for (const p of partes(r)) {
        const k = p.n === 2 ? 'q2' : 'q1';
        t[c][k] += p.monto;
        if (p.pagada) t[c][`${k}Paid`] += p.monto;
      }
    }
    return t;
  }, [rows]);

  // Avisos: gastos marcados «a confirmar» y gastos cuyas quincenas no cuadran
  const aConfirmar = rows.filter((r) => r.revisarQuincenas);
  const noCuadran = rows.filter((r) => !cuadraConMensual(r));

  const columns = [
    { key: 'description', label: 'Descripción' },
    { key: 'currency', label: 'Moneda', render: (r) => (
      <span className={recCurrency(r) === 'USD' ? 'badge-warning' : 'badge-slate'}>{recCurrency(r)}</span>
    )},
    { key: 'monthly', label: 'Mensual', render: (r) => fmtCur(r.monthly, recCurrency(r)), cellClassName: 'font-medium' },
    { key: 'q1', label: 'Quincena 1 (15)', render: (r) => <ChipQuincena r={r} n={1} /> },
    { key: 'q2', label: 'Quincena 2 (30)', render: (r) => <ChipQuincena r={r} n={2} /> },
    { key: 'paymentDate', label: 'Pago', render: (r) => fmtDate(r.paymentDate) },
    { key: 'status', label: 'Estado', accessor: (r) => estadoDerivado(r), render: (r) => {
      const est = estadoDerivado(r);
      const cls = est === 'pagado' ? 'badge-success' : est === 'parcial' ? 'badge-info' : 'badge-warning';
      return (
        <div className="flex flex-col items-start gap-1">
          <span className={cls}>{etiquetaEstado(r)}</span>
          {est !== 'pagado' && montoPagado(r) > 0 && (
            <span className="text-[11px] text-ink-500 whitespace-nowrap">Falta {fmtCur(montoPendiente(r), recCurrency(r))}</span>
          )}
          {r.revisarQuincenas && <span className="badge-danger">Confirmar quincenas</span>}
        </div>
      );
    }},
    { key: 'recurring', label: 'Recurrente', render: (r) => r.recurring ? <span className="badge-info">Sí</span> : <span className="badge-slate">No</span> },
    { key: 'actions', label: '', sortable: false, render: (r) => {
      const sig = siguientePendiente(r);
      return (
        <div className="flex gap-1 justify-end">
          {sig && (
            <button onClick={() => setPay({ open: true, row: r })}
              title={sig.n === 0 ? 'Marcar como pagado' : `Pagar ${nombreQuincena(sig.n)}`}
              className="btn-ghost p-1.5 text-emerald-600"><CheckCircle2 size={14} /></button>
          )}
          <button onClick={() => onEdit(r)} title="Editar" className="btn-ghost p-1.5"><Edit2 size={14} /></button>
          {canDelete && (
            <button onClick={() => setConfirm({ open: true, id: r.id })} title="Eliminar" className="btn-ghost p-1.5 text-red-600"><Trash2 size={14} /></button>
          )}
        </div>
      );
    }}
  ];

  // Datos de la ventana de pago
  const pr = pay.row;
  const prSig = pr ? siguientePendiente(pr) : null;
  const prPendientes = pr ? partes(pr).filter((x) => !x.pagada) : [];
  const prCcy = pr ? recCurrency(pr) : 'DOP';

  const tarjeta = (label, dop, usd, sub) => (
    <div className="card card-body">
      <p className="text-xs text-ink-500 uppercase font-semibold mb-1">{label}</p>
      {dop}
      {usd}
      {sub}
    </div>
  );
  const quincenaCard = (k, label) => {
    const d = totals.DOP, u = totals.USD;
    return tarjeta(
      label,
      <p className="text-lg font-bold text-ink-900 tnum">{fmtCur(d[k], 'DOP')}</p>,
      u[k] > 0 ? <p className="text-sm font-semibold text-ink-900 opacity-80 tnum">{fmtCur(u[k], 'USD')}</p> : null,
      <div className="mt-1.5 space-y-0.5 text-xs tnum">
        <p className="text-emerald-700">Pagado {fmtCur(d[`${k}Paid`], 'DOP')}{u[k] > 0 ? ` · ${fmtCur(u[`${k}Paid`], 'USD')}` : ''}</p>
        <p className="text-amber-700">Falta {fmtCur(d[k] - d[`${k}Paid`], 'DOP')}{u[k] > 0 ? ` · ${fmtCur(u[k] - u[`${k}Paid`], 'USD')}` : ''}</p>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Gastos Mensuales"
        subtitle="Los gastos recurrentes se copian automáticamente al cambiar de mes"
        actions={<>
          <HelpButton content={HELP.expenses} />
          <PeriodPicker />
          <button className="btn-primary" onClick={onAdd}><Plus size={16} /> Nuevo gasto</button>
        </>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {tarjeta('Total mensual',
          <p className="text-lg font-bold text-ink-900 tnum">{fmtCur(totals.DOP.monthly, 'DOP')}</p>,
          totals.USD.monthly > 0 ? <p className="text-sm font-semibold text-ink-900 opacity-80 tnum">{fmtCur(totals.USD.monthly, 'USD')}</p> : null,
          <p className="mt-1.5 text-xs text-emerald-700 tnum">Pagado {fmtCur(totals.DOP.paid, 'DOP')}{totals.USD.monthly > 0 ? ` · ${fmtCur(totals.USD.paid, 'USD')}` : ''}</p>)}
        {quincenaCard('q1', 'Quincena 1 (15)')}
        {quincenaCard('q2', 'Quincena 2 (30)')}
        {tarjeta('Pendiente por pagar',
          <p className="text-lg font-bold text-red-700 tnum">{fmtCur(totals.DOP.pending, 'DOP')}</p>,
          totals.USD.pending > 0 ? <p className="text-sm font-semibold text-red-700 opacity-80 tnum">{fmtCur(totals.USD.pending, 'USD')}</p> : null,
          null)}
      </div>

      {(aConfirmar.length > 0 || noCuadran.length > 0) && (
        <div className="mb-5 rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-600/20 px-4 py-3 space-y-2" role="status">
          {aConfirmar.length > 0 && (
            <div className="text-sm text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Confirma qué quincena se pagó ({aConfirmar.length})</p>
              <p className="text-xs mt-0.5">Estos gastos se marcaron como pagados antes de existir el pago por quincenas. Ábrelos y marca solo las quincenas que realmente se pagaron.</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {aConfirmar.map((r) => (
                  <button key={r.id} onClick={() => onEdit(r)} className="btn-secondary px-2.5 py-1 text-xs">{r.description}</button>
                ))}
              </div>
            </div>
          )}
          {noCuadran.length > 0 && (
            <div className="text-sm text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Quincenas que no suman el mensual ({noCuadran.length})</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {noCuadran.map((r) => (
                  <button key={r.id} onClick={() => onEdit(r)} className="btn-secondary px-2.5 py-1 text-xs">
                    {r.description}: {fmtCur(r.q1, recCurrency(r))} + {fmtCur(r.q2, recCurrency(r))} ≠ {fmtCur(r.monthly, recCurrency(r))}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card card-body">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-500">Moneda:</span>
            <select className="input py-1.5 w-36" value={curFilter} onChange={(e) => setCurFilter(e.target.value)}>
              <option value="all">Todas</option>
              <option value="DOP">Solo RD$</option>
              <option value="USD">Solo US$</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-500">Estado:</span>
            <select className="input py-1.5 w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="conPendiente">Con algo por pagar</option>
              <option value="pendiente">Sin pagar nada</option>
              <option value="parcial">Parcial (una quincena)</option>
              <option value="pagado">Pagado completo</option>
            </select>
          </div>
        </div>
        <DataTable columns={columns} rows={visibleRows} />
      </div>

      <Modal
        open={open} onClose={() => !saving && setOpen(false)}
        title={editId ? 'Editar gasto' : 'Nuevo gasto'}
        size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </>}
      >
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {saveErr && (
            <div className="md:col-span-2 bg-red-50 ring-1 ring-inset ring-red-600/20 text-red-700 text-sm rounded-lg px-3 py-2" role="alert">{saveErr}</div>
          )}
          <div className="md:col-span-2">
            <label className="label">Descripción</label>
            <input className="input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <CurrencyFields
            currency={form.currency}
            exchangeRate={form.exchangeRate}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div>
            <label className="label">Monto mensual ({form.currency === 'USD' ? 'US$' : 'RD$'})</label>
            <MoneyInput className="input" required value={form.monthly} onChange={(v) => setForm({ ...form, monthly: v })} />
          </div>
          <div>
            <label className="label">Fecha de pago</label>
            <input type="date" className="input" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
          </div>

          {/* Quincenas: monto + si ya se pagó y cuándo */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2].map((n) => {
              const monto = fq[`q${n}`];
              const pagada = !!form[`q${n}Paid`];
              return (
                <div key={n} className={`rounded-xl p-3 ring-1 ring-inset ${pagada && monto > 0 ? 'bg-emerald-50/60 ring-emerald-600/20' : 'bg-ink-50/60 ring-ink-200'}`}>
                  <label className="label">Quincena {n} (día {diaQuincena(n)})</label>
                  <MoneyInput className="input" value={form[`q${n}`]}
                    placeholder={form[`q${n === 1 ? 2 : 1}`] === '' ? '(auto = mensual / 2)' : '(auto = mensual − la otra)'}
                    onChange={(v) => setForm({ ...form, [`q${n}`]: v })} />
                  <p className="text-[11px] text-ink-500 mt-1 tnum">Se guardará: {fmtCur(monto, form.currency)}</p>
                  {monto > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-ink-800 font-medium">
                        <input type="checkbox" className="w-4 h-4 rounded accent-emerald-600" checked={pagada}
                          onChange={(e) => setForm({ ...form, [`q${n}Paid`]: e.target.checked, [`q${n}PaidAt`]: e.target.checked ? (form[`q${n}PaidAt`] || todayISO()) : '' })} />
                        Pagada
                      </label>
                      {pagada && (
                        <input type="date" className="input !w-auto py-1 text-xs" value={form[`q${n}PaidAt`] || ''}
                          onChange={(e) => setForm({ ...form, [`q${n}PaidAt`]: e.target.value })} aria-label={`Fecha de pago de la quincena ${n}`} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {sumaNoCuadra && (
              <p className="md:col-span-2 text-xs text-red-700">
                Quincena 1 + Quincena 2 = {fmtCur(fq.q1 + fq.q2, form.currency)} y el mensual es {fmtCur(Number(form.monthly) || 0, form.currency)}: deben sumar lo mismo.
              </p>
            )}
          </div>

          <div className="md:col-span-2 flex items-end">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={!!form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked ? 1 : 0 })} />
              <Copy size={14} className="text-ink-500" /> Gasto recurrente (auto-copiar al siguiente mes)
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </form>
      </Modal>

      {/* ---------- Pagar: la siguiente quincena, o las dos ---------- */}
      <Modal
        open={pay.open}
        onClose={() => !paying && setPay({ open: false, row: null })}
        title={prSig && prSig.n !== 0 ? `Pagar ${nombreQuincena(prSig.n)}` : 'Marcar como pagado'}
        size="sm"
        footer={pr && prSig ? <>
          <button className="btn-secondary" onClick={() => setPay({ open: false, row: null })} disabled={paying}>Cancelar</button>
          {prPendientes.length > 1 && (
            <button className="btn-secondary" disabled={paying} onClick={() => pagar(pr, prPendientes.map((x) => x.n))}>
              Pagar las dos ({fmtCur(prPendientes.reduce((s, x) => s + x.monto, 0), prCcy)})
            </button>
          )}
          <button className="btn-primary" disabled={paying} onClick={() => pagar(pr, [prSig.n])}>
            {paying ? 'Guardando…' : prSig.n === 0 ? 'Confirmar pago' : `Pagar ${nombreQuincena(prSig.n)}`}
          </button>
        </> : null}
      >
        {pr && prSig && (
          <div className="space-y-3 text-sm">
            <p className="text-ink-700"><b>{pr.description}</b></p>
            {prSig.n === 0 ? (
              <p className="text-ink-600">Se registra el pago completo de <b className="tnum">{fmtCur(pr.monthly, prCcy)}</b>.</p>
            ) : (
              <>
                <p className="text-ink-600">
                  Se registra el pago de la <b>{nombreQuincena(prSig.n)}</b> (vence el día {diaQuincena(prSig.n)}): <b className="tnum">{fmtCur(prSig.monto, prCcy)}</b>.
                </p>
                <ul className="space-y-1">
                  {partes(pr).map((x) => (
                    <li key={x.n} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-1.5 text-xs">
                      <span>{nombreQuincena(x.n)}</span>
                      <span className="tnum">{fmtCur(x.monto, prCcy)}</span>
                      <span className={x.pagada ? 'text-emerald-700 font-medium' : x.n === prSig.n ? 'text-ink-900 font-semibold' : 'text-amber-700'}>
                        {x.pagada ? `Pagada${x.fecha ? ` ${fmtDate(x.fecha)}` : ''}` : x.n === prSig.n ? 'Se paga ahora' : 'Queda pendiente'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null })}
        onConfirm={() => remove(confirm.id)}
        title="Eliminar gasto"
        message="¿Seguro que desea eliminar este registro?"
        danger
      />
    </div>
  );
}
