import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, MessageSquare, MessageSquareText, Repeat, Settings } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { usePeriod } from '../store/period.js';
import { useAuth } from '../store/auth.js';
import { db, logActivity } from '../db/database.js';
import { useRealtimeTable } from '../hooks/useRealtimeTable.js';
import { useSettings } from '../store/settings.js';
import { fmtDate, todayISO } from '../utils/format.js';
import { fmtCur, recCurrency } from '../utils/currency.js';
import { ensureTenantCharges, onRentalStatusChange, removeOwnerPayment } from '../utils/tenantCharges.js';
import { onContractIncomeStatusChange, removeContractPayables, isContractIncome } from '../utils/contractCharges.js';
import { CONTRATO_CATEGORY, normalizeFees, feesTotal } from '../utils/contractFees.js';
import CurrencyFields from '../components/CurrencyFields.jsx';

const STATUS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'pagado', label: 'Pagado' }
];

const emptyRenta = () => ({
  kind: 'renta', category: 'Renta',
  date: todayISO(), propertyId: '', tenantId: '', agentId: '',
  amount: '', paid: '', status: 'pendiente', notes: '',
  currency: 'DOP', exchangeRate: '',
  recurring: 0, recurringKey: null
});

const emptyOtro = () => ({
  kind: 'otro', category: 'Por contrato', customCategory: '',
  date: todayISO(), propertyId: '',
  amount: '', paid: '', status: 'pendiente', notes: '',
  currency: 'DOP', exchangeRate: '',
  recurring: 0, recurringKey: null
});

const genRecurringKey = () => `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function Rentals() {
  const { year, month } = usePeriod();
  const { user, hasRole } = useAuth();
  const canConfig = hasRole('SuperAdmin', 'Admin');
  const [rows, setRows] = useState([]);
  const [props, setProps] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [agents, setAgents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyRenta());
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [noteView, setNoteView] = useState({ open: false, text: '' });
  const [curFilter, setCurFilter] = useState('all'); // all | DOP | USD
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  const { usdToDop, contractFees, setContractFees } = useSettings();
  const [feesModal, setFeesModal] = useState(false);
  const [feesDraft, setFeesDraft] = useState([]);
  const [feesErr, setFeesErr] = useState('');

  // Copia los ingresos recurrentes del mes anterior que aún no existan en este mes,
  // generándolos como "pendiente" para cobrar.
  const ensureRecurring = async () => {
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const [current, previous] = await Promise.all([
      db.rentals.where({ year, month }).toArray(),
      db.rentals.where({ year: prev.y, month: prev.m }).toArray()
    ]);
    const recurringPrev = previous.filter((r) => r.recurring && r.recurringKey);
    if (recurringPrev.length === 0) return;
    const existingKeys = new Set(current.filter((r) => r.recurringKey).map((r) => r.recurringKey));
    const toClone = recurringPrev.filter((r) => !existingKeys.has(r.recurringKey));
    if (toClone.length === 0) return;
    const day = `${year}-${String(month).padStart(2, '0')}-01`;
    const clones = toClone.map((r) => ({
      year, month, kind: r.kind, category: r.category,
      date: day,
      propertyId: r.propertyId ?? null, propertyName: r.propertyName || '',
      tenantId: r.tenantId ?? null, tenantName: r.tenantName || '',
      agentId: r.agentId ?? null, agentName: r.agentName || '',
      amount: Number(r.amount) || 0, paid: 0, status: 'pendiente',
      currency: r.currency || 'DOP', exchangeRate: r.exchangeRate ?? null,
      notes: r.notes || '',
      recurring: 1, recurringKey: r.recurringKey,
      createdAt: new Date().toISOString()
    }));
    try { await db.rentals.bulkAdd(clones); }
    catch (e) { console.warn('[Jireh] Copia de ingresos recurrentes (posible duplicado concurrente):', e.message); }
  };

  const load = async () => {
    await ensureRecurring();
    await ensureTenantCharges(year, month); // genera cobro de renta + pago a propietario
    const [r, p, t, a] = await Promise.all([
      db.rentals.where({ year, month }).toArray(),
      db.properties.toArray(),
      db.tenants.toArray(),
      db.agents.where('active').equals(1).toArray()
    ]);
    setRows(r); setProps(p); setTenants(t); setAgents(a);
  };
  useEffect(() => { load(); }, [year, month]);
  useRealtimeTable(['rentals', 'properties', 'tenants', 'agents'], () => load());

  // Las rentas nacen automáticamente desde Inquilinos; aquí solo se
  // registran "otros ingresos" manualmente.
  const onAdd = () => {
    setEditId(null);
    setSaveErr('');
    setForm(emptyOtro());
    setOpen(true);
  };

  const onEdit = (r) => {
    setEditId(r.id);
    setSaveErr('');
    const kind = r.kind || 'renta';
    if (kind === 'renta') {
      setForm({ ...emptyRenta(), ...r, amount: r.amount ?? '', paid: r.paid ?? '' });
    } else {
      // Si la categoría no es una de las predefinidas, es personalizada
      const known = ['Por contrato', 'Por administración de propiedad'];
      const isCustom = !known.includes(r.category);
      setForm({
        ...emptyOtro(), ...r,
        amount: r.amount ?? '', paid: r.paid ?? '',
        category: isCustom ? '__otros__' : r.category,
        customCategory: isCustom ? (r.category || '') : ''
      });
    }
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const isRenta = form.kind === 'renta';
    const property = props.find((p) => p.id === Number(form.propertyId));

    // El periodo (año/mes) se determina por la FECHA del ingreso, no por el selector
    const d = new Date(`${form.date}T00:00:00`);
    const pYear = Number.isNaN(d.getTime()) ? year : d.getFullYear();
    const pMonth = Number.isNaN(d.getTime()) ? month : d.getMonth() + 1;

    let category = 'Renta';
    if (!isRenta) {
      category = form.category === '__otros__'
        ? (form.customCategory.trim() || 'Otro')
        : form.category;
    }

    const recurring = form.recurring ? 1 : 0;
    // Preservar SIEMPRE el recurringKey existente (ej. tenant_52). Solo
    // generar uno nuevo si el usuario marca "recurrente" y no había clave.
    let recurringKey = form.recurringKey || null;
    if (recurring && !recurringKey) recurringKey = genRecurringKey();

    const currency = form.currency === 'USD' ? 'USD' : 'DOP';
    const exchangeRate = currency === 'USD' ? (Number(form.exchangeRate) || usdToDop) : null;

    let payload;
    if (isRenta) {
      const tenant = tenants.find((t) => t.id === Number(form.tenantId));
      const agent = agents.find((a) => a.id === Number(form.agentId));
      payload = {
        year: pYear, month: pMonth, kind: 'renta', category: 'Renta',
        date: form.date,
        propertyId: form.propertyId ? Number(form.propertyId) : null,
        tenantId: form.tenantId ? Number(form.tenantId) : null,
        agentId: form.agentId ? Number(form.agentId) : null,
        propertyName: property?.name || form.propertyName || '',
        tenantName: tenant?.name || form.tenantName || '',
        agentName: agent?.name || form.agentName || '',
        amount: Number(form.amount) || 0,
        paid: Number(form.paid) || 0,
        status: form.status,
        currency, exchangeRate,
        // Si la renta viene de un inquilino con % de comisión, recalcula lo nuestro sobre el monto
        commissionPercent: form.commissionPercent ?? null,
        commissionAmount: form.commissionPercent != null && form.commissionPercent !== ''
          ? Math.round((Number(form.amount) || 0) * Number(form.commissionPercent)) / 100
          : null,
        notes: form.notes || '',
        recurring, recurringKey
      };
    } else {
      payload = {
        year: pYear, month: pMonth, kind: 'otro', category,
        date: form.date,
        propertyId: form.propertyId ? Number(form.propertyId) : null,
        tenantId: null, agentId: null,
        propertyName: property?.name || '',
        tenantName: '', agentName: '',
        amount: Number(form.amount) || 0,
        paid: Number(form.paid) || 0,
        status: form.status,
        currency, exchangeRate,
        notes: form.notes || '',
        recurring, recurringKey
      };
    }

    setSaveErr(''); setSaving(true);
    try {
      if (editId) {
        const prevStatus = rows.find((r) => r.id === editId)?.status;
        await db.rentals.update(editId, payload);
        await logActivity(user.sub, user.username, 'income.update', `id=${editId} kind=${payload.kind}`);
        // Renta de inquilino: al cobrarla nace el pago al propietario; al revertir, se elimina
        if (payload.tenantId && payload.commissionPercent != null) {
          await onRentalStatusChange({ ...payload, id: editId }, prevStatus);
        }
        // Contrato de renta: al cobrarlo nacen las cuentas por pagar; al revertir, se eliminan
        if (isContractIncome(payload)) {
          await onContractIncomeStatusChange({ ...payload, id: editId }, prevStatus, contractFees);
        }
      } else {
        const id = await db.rentals.add({ ...payload, createdAt: new Date().toISOString() });
        await logActivity(user.sub, user.username, 'income.create', `id=${id} kind=${payload.kind}`);
        if (payload.tenantId && payload.commissionPercent != null && payload.status === 'pagado') {
          await onRentalStatusChange({ ...payload, id }, 'pendiente');
        }
        if (isContractIncome(payload) && payload.status === 'pagado') {
          await onContractIncomeStatusChange({ ...payload, id }, 'pendiente', contractFees);
        }
      }
      setOpen(false);
      await load();
    } catch (ex) {
      const msg = ex?.message || 'Error al guardar';
      // Pista útil si faltan las migraciones de columnas
      const hint = /column .* does not exist|kind|category|currency|exchangeRate|recurring/i.test(msg)
        ? ' — Verifique que ejecutó las migraciones SQL en Supabase (migration_ingresos.sql y migration_currency.sql).'
        : '';
      setSaveErr(msg + hint);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const row = rows.find((r) => r.id === id);
    await db.rentals.delete(id);
    // Si era renta de inquilino, eliminar también su pago al propietario
    if (row?.tenantId && row?.commissionPercent != null) {
      await removeOwnerPayment(row);
    }
    // Si era contrato de renta, eliminar sus cuentas por pagar
    if (row && isContractIncome(row)) {
      await removeContractPayables(row);
    }
    await logActivity(user.sub, user.username, 'income.delete', `id=${id}`);
    load();
  };

  const filteredTenants = useMemo(() =>
    form.propertyId ? tenants.filter((t) => !t.propertyId || t.propertyId === Number(form.propertyId)) : tenants,
    [tenants, form.propertyId]
  );

  const visibleRows = useMemo(() =>
    curFilter === 'all' ? rows : rows.filter((r) => recCurrency(r) === curFilter),
    [rows, curFilter]
  );

  // Totales por moneda
  const totals = useMemo(() => {
    const mk = () => ({ paid: 0, partial: 0, pending: 0 });
    const t = { DOP: mk(), USD: mk() };
    for (const r of rows) {
      const c = recCurrency(r);
      if (r.status === 'pagado') t[c].paid += Number(r.amount) || 0;
      else if (r.status === 'parcial') t[c].partial += Number(r.paid) || 0;
      else t[c].pending += Number(r.amount) || 0;
    }
    return t;
  }, [rows]);

  const columns = [
    { key: 'date', label: 'Fecha', render: (r) => fmtDate(r.date) },
    { key: 'category', label: 'Categoría', render: (r) => {
      const isRenta = (r.kind || 'renta') === 'renta';
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className={isRenta ? 'badge-info' : 'badge-slate'}>{r.category || (isRenta ? 'Renta' : 'Otro')}</span>
          {r.recurring ? <Repeat size={13} className="text-emerald-600" title="Ingreso recurrente" /> : null}
        </span>
      );
    }},
    { key: 'propertyName', label: 'Propiedad', render: (r) => r.propertyName || '—' },
    { key: 'tenantName', label: 'Inquilino', render: (r) => r.tenantName || '—' },
    { key: 'agentName', label: 'Agente', render: (r) => r.agentName || '—' },
    { key: 'currency', label: 'Moneda', render: (r) => (
      <span className={recCurrency(r) === 'USD' ? 'badge-warning' : 'badge-slate'}>{recCurrency(r)}</span>
    )},
    { key: 'amount', label: 'Monto', render: (r) => fmtCur(r.amount, recCurrency(r)), cellClassName: 'font-medium' },
    { key: 'commissionAmount', label: '% Comisión', render: (r) =>
      r.commissionPercent != null && r.commissionPercent !== ''
        ? <span className="badge-info">{Number(r.commissionPercent)}% = {fmtCur(r.commissionAmount ?? (Number(r.amount) || 0) * Number(r.commissionPercent) / 100, recCurrency(r))}</span>
        : <span className="text-ink-300">—</span>
    },
    { key: 'paid', label: 'Pagado', render: (r) => fmtCur(r.paid, recCurrency(r)) },
    { key: 'status', label: 'Estado', render: (r) => {
      const c = r.status === 'pagado' ? 'badge-success' : r.status === 'parcial' ? 'badge-warning' : 'badge-danger';
      return <span className={c}>{r.status}</span>;
    }},
    { key: 'notes', label: 'Notas', sortable: false, render: (r) => {
      const has = r.notes && r.notes.trim();
      return has ? (
        <button onClick={() => setNoteView({ open: true, text: r.notes })} title="Ver nota" className="text-brand-600 hover:text-brand-800">
          <MessageSquareText size={16} />
        </button>
      ) : (
        <span title="Sin notas" className="text-ink-300"><MessageSquare size={16} /></span>
      );
    }},
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        <button onClick={() => onEdit(r)} className="btn-ghost p-1.5"><Edit2 size={14} /></button>
        <button onClick={() => setConfirm({ open: true, id: r.id })} className="btn-ghost p-1.5 text-red-600"><Trash2 size={14} /></button>
      </div>
    )}
  ];

  const isRenta = form.kind === 'renta';

  return (
    <div>
      <PageHeader
        title="Ingresos"
        subtitle="Rentas y otros ingresos del periodo"
        actions={<>
          <HelpButton content={HELP.rentals} />
          {canConfig && (
            <button className="btn-secondary" title="Configurar desglose de contrato de renta"
              onClick={() => { setFeesDraft(normalizeFees(contractFees)); setFeesErr(''); setFeesModal(true); }}>
              <Settings size={16} /> Desglose contrato
            </button>
          )}
          <PeriodPicker />
          <button className="btn-primary" onClick={onAdd}><Plus size={16} /> Nuevo ingreso</button>
        </>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {[
          { key: 'paid', label: 'Pagado', color: 'text-emerald-700' },
          { key: 'partial', label: 'Parcial', color: 'text-amber-700' },
          { key: 'pending', label: 'Pendiente', color: 'text-red-700' }
        ].map((c) => (
          <div key={c.key} className="card card-body">
            <p className="text-xs text-ink-500 uppercase font-semibold mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{fmtCur(totals.DOP[c.key], 'DOP')}</p>
            {totals.USD[c.key] > 0 && (
              <p className={`text-sm font-semibold ${c.color} opacity-80`}>{fmtCur(totals.USD[c.key], 'USD')}</p>
            )}
          </div>
        ))}
      </div>

      <div className="card card-body">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-ink-500">Moneda:</span>
          <select className="input py-1.5 w-40" value={curFilter} onChange={(e) => setCurFilter(e.target.value)}>
            <option value="all">Todas</option>
            <option value="DOP">Solo RD$</option>
            <option value="USD">Solo US$</option>
          </select>
        </div>
        <DataTable columns={columns} rows={visibleRows} />
      </div>

      {/* Formulario de ingreso */}
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editId
          ? (isRenta ? 'Editar renta' : 'Editar ingreso')
          : (isRenta ? 'Nueva renta' : 'Nuevo ingreso')}
        size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </>}
      >
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {saveErr && (
            <div className="md:col-span-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {saveErr}
            </div>
          )}
          {/* Indicador de tipo */}
          <div className="md:col-span-2">
            <span className={`badge ${isRenta ? 'badge-info' : 'badge-slate'}`}>
              {isRenta ? 'Ingreso por renta' : 'Otro ingreso'}
            </span>
          </div>

          <div>
            <label className="label">Fecha</label>
            <input type="date" className="input" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>

          {/* Categoría — solo para "otro" */}
          {!isRenta && (
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value={CONTRATO_CATEGORY}>Contrato de renta</option>
                <option value="Por contrato">Por contrato</option>
                <option value="Por administración de propiedad">Por administración de propiedad</option>
                <option value="__otros__">Otros (especificar)</option>
              </select>
            </div>
          )}

          {/* Preview del desglose del contrato de renta */}
          {!isRenta && form.category === CONTRATO_CATEGORY && (
            <div className="md:col-span-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-sm text-ink-700">
              <p className="font-semibold text-ink-800 mb-1">Al marcar como <b>pagado</b> se generarán estas cuentas por pagar:</p>
              <ul className="text-xs space-y-0.5">
                {normalizeFees(contractFees).map((f) => (
                  <li key={f.id} className="flex justify-between">
                    <span>{f.label}</span>
                    <span className="font-medium">{fmtCur(f.amount, form.currency === 'USD' ? 'USD' : 'DOP')}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-xs mt-1 pt-1 border-t border-brand-200">
                <span>Total cuentas por pagar</span>
                <span className="font-semibold">{fmtCur(feesTotal(contractFees), form.currency === 'USD' ? 'USD' : 'DOP')}</span>
              </div>
              <div className="flex justify-between text-sm mt-1 font-semibold text-emerald-700">
                <span>Tu ingreso neto</span>
                <span>{fmtCur((Number(form.amount) || 0) - feesTotal(contractFees), form.currency === 'USD' ? 'USD' : 'DOP')}</span>
              </div>
            </div>
          )}

          {!isRenta && form.category === '__otros__' && (
            <div className="md:col-span-2">
              <label className="label">Especifique la categoría</label>
              <input className="input" required value={form.customCategory} placeholder="Escriba la categoría del ingreso"
                onChange={(e) => setForm({ ...form, customCategory: e.target.value })} />
            </div>
          )}

          <div>
            <label className="label">Propiedad {isRenta ? '' : '(opcional)'}</label>
            <select className="input" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">— seleccione —</option>
              {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Inquilino y Agente — solo para renta */}
          {isRenta && (
            <div>
              <label className="label">Inquilino</label>
              <select className="input" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
                <option value="">— seleccione —</option>
                {filteredTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {isRenta && (
            <div>
              <label className="label">Agente que cerró</label>
              <select className="input" value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
                <option value="">— seleccione —</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <CurrencyFields
            currency={form.currency}
            exchangeRate={form.exchangeRate}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div>
            <label className="label">Monto ({form.currency === 'USD' ? 'US$' : 'RD$'})</label>
            <input type="number" step="0.01" className="input" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Pagado (parcial)</label>
            <input type="number" step="0.01" className="input" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={!!form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked ? 1 : 0 })} className="rounded accent-brand-500" />
              <Repeat size={14} className="text-ink-500" />
              Ingreso recurrente — se generará automáticamente como "pendiente" al inicio de cada mes
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Comentarios u observaciones de este ingreso" />
          </div>
        </form>
      </Modal>

      {/* Visor de nota */}
      <Modal
        open={noteView.open} onClose={() => setNoteView({ open: false, text: '' })}
        title="Nota del ingreso" size="sm"
        footer={<button className="btn-primary" onClick={() => setNoteView({ open: false, text: '' })}>Cerrar</button>}
      >
        <p className="text-sm text-ink-700 whitespace-pre-wrap">{noteView.text}</p>
      </Modal>

      {/* Configuración del desglose de contrato de renta */}
      <Modal
        open={feesModal} onClose={() => setFeesModal(false)}
        title="Desglose de contrato de renta" size="md"
        footer={<>
          <button className="btn-secondary" onClick={() => setFeesModal(false)}>Cancelar</button>
          <button className="btn-primary" onClick={async () => {
            setFeesErr('');
            try {
              await setContractFees(feesDraft, user);
              setFeesModal(false);
            } catch (ex) {
              setFeesErr(ex.message || 'Error al guardar');
            }
          }}>Guardar</button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Conceptos (cuentas por pagar) que se generan al cobrar un ingreso de <b>Contrato de renta</b>.
            Tu ingreso real es el monto del contrato menos la suma de estos conceptos.
          </p>
          <div className="space-y-2">
            {feesDraft.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2">
                <input
                  className="input flex-1" value={f.label} placeholder="Concepto"
                  onChange={(e) => setFeesDraft(feesDraft.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                />
                <input
                  type="number" step="0.01" min="0" className="input w-28 text-right" value={f.amount}
                  onChange={(e) => setFeesDraft(feesDraft.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                />
                <button className="btn-ghost p-1.5 text-red-600" title="Quitar"
                  onClick={() => setFeesDraft(feesDraft.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn-secondary text-xs py-1.5"
            onClick={() => setFeesDraft([...feesDraft, { id: `f_${Date.now()}`, label: '', amount: 0 }])}>
            <Plus size={14} /> Añadir concepto
          </button>
          <div className="flex justify-between text-sm border-t border-ink-100 pt-2">
            <span className="text-ink-600">Total cuentas por pagar</span>
            <span className="font-semibold text-ink-900">{fmtCur(feesTotal(feesDraft), 'DOP')}</span>
          </div>
          {feesErr && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{feesErr}</div>}
        </div>
      </Modal>

      <ConfirmModal
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null })}
        onConfirm={() => remove(confirm.id)}
        title="Eliminar ingreso"
        message="¿Seguro que desea eliminar este registro? Esta acción no se puede deshacer."
        danger
      />
    </div>
  );
}
