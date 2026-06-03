import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Home, FileText, MessageSquare, MessageSquareText, Repeat } from 'lucide-react';
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
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [props, setProps] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [agents, setAgents] = useState([]);
  const [chooser, setChooser] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyRenta());
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [noteView, setNoteView] = useState({ open: false, text: '' });
  const [curFilter, setCurFilter] = useState('all'); // all | DOP | USD
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  const { usdToDop } = useSettings();

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
    await db.rentals.bulkAdd(clones);
  };

  const load = async () => {
    await ensureRecurring();
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

  const onAdd = () => setChooser(true);

  const pickKind = (kind) => {
    setEditId(null);
    setSaveErr('');
    setForm(kind === 'renta' ? emptyRenta() : emptyOtro());
    setChooser(false);
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

    let category = 'Renta';
    if (!isRenta) {
      category = form.category === '__otros__'
        ? (form.customCategory.trim() || 'Otro')
        : form.category;
    }

    const recurring = form.recurring ? 1 : 0;
    const recurringKey = recurring ? (form.recurringKey || genRecurringKey()) : null;

    const currency = form.currency === 'USD' ? 'USD' : 'DOP';
    const exchangeRate = currency === 'USD' ? (Number(form.exchangeRate) || usdToDop) : null;

    let payload;
    if (isRenta) {
      const tenant = tenants.find((t) => t.id === Number(form.tenantId));
      const agent = agents.find((a) => a.id === Number(form.agentId));
      payload = {
        year, month, kind: 'renta', category: 'Renta',
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
        notes: form.notes || '',
        recurring, recurringKey
      };
    } else {
      payload = {
        year, month, kind: 'otro', category,
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
        await db.rentals.update(editId, payload);
        await logActivity(user.sub, user.username, 'income.update', `id=${editId} kind=${payload.kind}`);
      } else {
        const id = await db.rentals.add({ ...payload, createdAt: new Date().toISOString() });
        await logActivity(user.sub, user.username, 'income.create', `id=${id} kind=${payload.kind}`);
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
    await db.rentals.delete(id);
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

      {/* Selector de tipo de ingreso */}
      <Modal
        open={chooser} onClose={() => setChooser(false)}
        title="¿Qué tipo de ingreso desea registrar?"
        size="md"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => pickKind('renta')}
            className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-ink-200 hover:border-brand-500 hover:bg-brand-50 transition-colors"
          >
            <div className="bg-brand-500 text-ink-900 p-3 rounded-lg"><Home size={26} /></div>
            <span className="font-semibold text-ink-800">Renta</span>
            <span className="text-xs text-ink-500 text-center">Cobro mensual por propiedad e inquilino. Cuenta para bonificaciones.</span>
          </button>
          <button
            onClick={() => pickKind('otro')}
            className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-ink-200 hover:border-brand-500 hover:bg-brand-50 transition-colors"
          >
            <div className="bg-ink-800 text-white p-3 rounded-lg"><FileText size={26} /></div>
            <span className="font-semibold text-ink-800">Otro ingreso</span>
            <span className="text-xs text-ink-500 text-center">Por contrato, administración de propiedad u otra categoría.</span>
          </button>
        </div>
      </Modal>

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
                <option value="Por contrato">Por contrato</option>
                <option value="Por administración de propiedad">Por administración de propiedad</option>
                <option value="__otros__">Otros (especificar)</option>
              </select>
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
