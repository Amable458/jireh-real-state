import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Copy } from 'lucide-react';
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

const empty = () => ({
  description: '', monthly: '', q1: '', q2: '',
  paymentDate: todayISO(), status: 'pendiente', recurring: 1, notes: '',
  currency: 'DOP', exchangeRate: ''
});

export default function Expenses() {
  const { year, month } = usePeriod();
  const { user } = useAuth();
  const { usdToDop } = useSettings();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [curFilter, setCurFilter] = useState('all');

  const ensureRecurring = async () => {
    const exists = await db.expenses.where({ year, month }).count();
    if (exists > 0) return;
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const previous = await db.expenses.where({ year: prev.y, month: prev.m }).toArray();
    const recurring = previous.filter((e) => e.recurring);
    if (recurring.length === 0) return;
    const cloned = recurring.map(({ id, ...e }) => ({
      ...e, year, month, status: 'pendiente',
      paymentDate: `${year}-${String(month).padStart(2, '0')}-15`,
      createdAt: new Date().toISOString()
    }));
    await db.expenses.bulkAdd(cloned);
    await logActivity(user.sub, user.username, 'expenses.autocopy', `${cloned.length} de ${prev.y}-${prev.m}`);
  };

  const load = async () => {
    await ensureRecurring();
    const r = await db.expenses.where({ year, month }).toArray();
    setRows(r);
  };
  useEffect(() => { load(); }, [year, month]);
  useRealtimeTable('expenses', () => load());

  const onAdd = () => {
    setEditId(null);
    setForm({
      ...empty(),
      paymentDate: `${year}-${String(month).padStart(2, '0')}-15`
    });
    setOpen(true);
  };
  const onEdit = (r) => { setEditId(r.id); setForm({ ...empty(), ...r, monthly: r.monthly ?? '', q1: r.q1 ?? '', q2: r.q2 ?? '', currency: r.currency || 'DOP', exchangeRate: r.exchangeRate ?? '' }); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    const monthly = Number(form.monthly) || 0;
    const q1 = form.q1 === '' ? monthly / 2 : Number(form.q1) || 0;
    const q2 = form.q2 === '' ? monthly / 2 : Number(form.q2) || 0;
    const currency = form.currency === 'USD' ? 'USD' : 'DOP';
    const exchangeRate = currency === 'USD' ? (Number(form.exchangeRate) || usdToDop) : null;
    const payload = {
      year, month,
      description: form.description,
      monthly, q1, q2,
      paymentDate: form.paymentDate,
      status: form.status,
      currency, exchangeRate,
      recurring: form.recurring ? 1 : 0,
      notes: form.notes || ''
    };
    if (editId) {
      await db.expenses.update(editId, payload);
      await logActivity(user.sub, user.username, 'expense.update', `id=${editId}`);
    } else {
      const id = await db.expenses.add({ ...payload, createdAt: new Date().toISOString() });
      await logActivity(user.sub, user.username, 'expense.create', `id=${id}`);
    }
    setOpen(false); load();
  };

  const remove = async (id) => {
    await db.expenses.delete(id);
    await logActivity(user.sub, user.username, 'expense.delete', `id=${id}`);
    load();
  };

  const visibleRows = useMemo(() =>
    curFilter === 'all' ? rows : rows.filter((r) => recCurrency(r) === curFilter),
    [rows, curFilter]
  );

  const totals = useMemo(() => {
    const mk = () => ({ monthly: 0, q1: 0, q2: 0, paid: 0 });
    const t = { DOP: mk(), USD: mk() };
    for (const r of rows) {
      const c = recCurrency(r);
      t[c].monthly += Number(r.monthly) || 0;
      t[c].q1 += Number(r.q1) || 0;
      t[c].q2 += Number(r.q2) || 0;
      if (r.status === 'pagado') t[c].paid += Number(r.monthly) || 0;
    }
    t.DOP.pending = t.DOP.monthly - t.DOP.paid;
    t.USD.pending = t.USD.monthly - t.USD.paid;
    return t;
  }, [rows]);

  const columns = [
    { key: 'description', label: 'Descripción' },
    { key: 'currency', label: 'Moneda', render: (r) => (
      <span className={recCurrency(r) === 'USD' ? 'badge-warning' : 'badge-slate'}>{recCurrency(r)}</span>
    )},
    { key: 'monthly', label: 'Mensual', render: (r) => fmtCur(r.monthly, recCurrency(r)), cellClassName: 'font-medium' },
    { key: 'q1', label: 'Quincena 1 (15)', render: (r) => fmtCur(r.q1, recCurrency(r)) },
    { key: 'q2', label: 'Quincena 2 (30)', render: (r) => fmtCur(r.q2, recCurrency(r)) },
    { key: 'paymentDate', label: 'Pago', render: (r) => fmtDate(r.paymentDate) },
    { key: 'status', label: 'Estado', render: (r) => (
      <span className={r.status === 'pagado' ? 'badge-success' : 'badge-warning'}>{r.status}</span>
    )},
    { key: 'recurring', label: 'Recurrente', render: (r) => r.recurring ? <span className="badge-info">Sí</span> : <span className="badge-slate">No</span> },
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        <button onClick={() => onEdit(r)} className="btn-ghost p-1.5"><Edit2 size={14} /></button>
        <button onClick={() => setConfirm({ open: true, id: r.id })} className="btn-ghost p-1.5 text-red-600"><Trash2 size={14} /></button>
      </div>
    )}
  ];

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
        {[
          { key: 'monthly', label: 'Total mensual', color: 'text-ink-900' },
          { key: 'q1', label: 'Quincena 1', color: 'text-ink-900' },
          { key: 'q2', label: 'Quincena 2', color: 'text-ink-900' },
          { key: 'pending', label: 'Pendiente', color: 'text-red-700' }
        ].map((c) => (
          <div key={c.key} className="card card-body">
            <p className="text-xs text-ink-500 uppercase font-semibold mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{fmtCur(totals.DOP[c.key], 'DOP')}</p>
            {totals.USD[c.key] > 0 && <p className={`text-sm font-semibold ${c.color} opacity-80`}>{fmtCur(totals.USD[c.key], 'USD')}</p>}
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

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editId ? 'Editar gasto' : 'Nuevo gasto'}
        size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={save}>Guardar</button>
        </>}
      >
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <input type="number" step="0.01" className="input" required value={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.value })} />
          </div>
          <div>
            <label className="label">Fecha de pago</label>
            <input type="date" className="input" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Quincena 1 (día 15)</label>
            <input type="number" step="0.01" className="input" value={form.q1} placeholder="(auto = mensual / 2)" onChange={(e) => setForm({ ...form, q1: e.target.value })} />
          </div>
          <div>
            <label className="label">Quincena 2 (día 30)</label>
            <input type="number" step="0.01" className="input" value={form.q2} placeholder="(auto = mensual / 2)" onChange={(e) => setForm({ ...form, q2: e.target.value })} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
            </select>
          </div>
          <div className="flex items-end">
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
