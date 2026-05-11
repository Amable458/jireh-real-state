import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { usePeriod } from '../store/period.js';
import { useAuth } from '../store/auth.js';
import { db, logActivity } from '../db/database.js';
import { fmtMoney, fmtDate, todayISO } from '../utils/format.js';

const STATUS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'pagado', label: 'Pagado' }
];

const empty = () => ({
  date: todayISO(), propertyId: '', tenantId: '', agentId: '',
  amount: '', paid: '', status: 'pendiente', notes: ''
});

export default function Rentals() {
  const { year, month } = usePeriod();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [props, setProps] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [agents, setAgents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });

  const load = async () => {
    const [r, p, t, a] = await Promise.all([
      db.rentals.where({ year, month }).toArray(),
      db.properties.toArray(),
      db.tenants.toArray(),
      db.agents.where('active').equals(1).toArray()
    ]);
    setRows(r); setProps(p); setTenants(t); setAgents(a);
  };
  useEffect(() => { load(); }, [year, month]);

  const onAdd = () => { setEditId(null); setForm(empty()); setOpen(true); };
  const onEdit = (r) => { setEditId(r.id); setForm({ ...r, amount: r.amount ?? '', paid: r.paid ?? '' }); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    const property = props.find((p) => p.id === Number(form.propertyId));
    const tenant = tenants.find((t) => t.id === Number(form.tenantId));
    const agent = agents.find((a) => a.id === Number(form.agentId));
    const payload = {
      year, month,
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
      notes: form.notes || ''
    };
    if (editId) {
      await db.rentals.update(editId, payload);
      await logActivity(user.sub, user.username, 'rental.update', `id=${editId}`);
    } else {
      const id = await db.rentals.add({ ...payload, createdAt: new Date().toISOString() });
      await logActivity(user.sub, user.username, 'rental.create', `id=${id}`);
    }
    setOpen(false); load();
  };

  const remove = async (id) => {
    await db.rentals.delete(id);
    await logActivity(user.sub, user.username, 'rental.delete', `id=${id}`);
    load();
  };

  const filteredTenants = useMemo(() =>
    form.propertyId ? tenants.filter((t) => !t.propertyId || t.propertyId === Number(form.propertyId)) : tenants,
    [tenants, form.propertyId]
  );

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.status === 'pagado').reduce((s, r) => s + (r.amount || 0), 0);
    const partial = rows.filter((r) => r.status === 'parcial').reduce((s, r) => s + (r.paid || 0), 0);
    const pending = rows.filter((r) => r.status === 'pendiente').reduce((s, r) => s + (r.amount || 0), 0);
    return { paid, partial, pending };
  }, [rows]);

  const columns = [
    { key: 'date', label: 'Fecha', render: (r) => fmtDate(r.date) },
    { key: 'propertyName', label: 'Propiedad' },
    { key: 'tenantName', label: 'Inquilino' },
    { key: 'agentName', label: 'Agente' },
    { key: 'amount', label: 'Monto', render: (r) => fmtMoney(r.amount), cellClassName: 'font-medium' },
    { key: 'paid', label: 'Pagado', render: (r) => fmtMoney(r.paid) },
    { key: 'status', label: 'Estado', render: (r) => {
      const c = r.status === 'pagado' ? 'badge-success' : r.status === 'parcial' ? 'badge-warning' : 'badge-danger';
      return <span className={c}>{r.status}</span>;
    }},
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
        title="Ingresos por Renta"
        subtitle="Registro de rentas mensuales"
        actions={<>
          <HelpButton content={HELP.rentals} />
          <PeriodPicker />
          <button className="btn-primary" onClick={onAdd}><Plus size={16} /> Nueva renta</button>
        </>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="card card-body">
          <p className="text-xs text-slate-500 uppercase font-semibold">Pagado</p>
          <p className="text-xl font-bold text-emerald-700">{fmtMoney(totals.paid)}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs text-slate-500 uppercase font-semibold">Parcial</p>
          <p className="text-xl font-bold text-amber-700">{fmtMoney(totals.partial)}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs text-slate-500 uppercase font-semibold">Pendiente</p>
          <p className="text-xl font-bold text-red-700">{fmtMoney(totals.pending)}</p>
        </div>
      </div>

      <div className="card card-body">
        <DataTable columns={columns} rows={rows} />
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editId ? 'Editar renta' : 'Nueva renta'}
        size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={save}>Guardar</button>
        </>}
      >
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Fecha</label>
            <input type="date" className="input" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Propiedad</label>
            <select className="input" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">— seleccione —</option>
              {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Inquilino</label>
            <select className="input" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
              <option value="">— seleccione —</option>
              {filteredTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Agente que cerró</label>
            <select className="input" value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
              <option value="">— seleccione —</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Monto (DOP)</label>
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
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null })}
        onConfirm={() => remove(confirm.id)}
        title="Eliminar renta"
        message="¿Seguro que desea eliminar este registro? Esta acción no se puede deshacer."
        danger
      />
    </div>
  );
}
