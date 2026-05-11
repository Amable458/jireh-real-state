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

const empty = () => ({
  date: todayISO(), propertyId: '', agentId: '',
  buyer: '', price: '', commission: '', notes: ''
});

export default function Sales() {
  const { year, month } = usePeriod();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [props, setProps] = useState([]);
  const [agents, setAgents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });

  const load = async () => {
    const [s, p, a] = await Promise.all([
      db.sales.where({ year, month }).toArray(),
      db.properties.toArray(),
      db.agents.where('active').equals(1).toArray()
    ]);
    setRows(s); setProps(p); setAgents(a);
  };
  useEffect(() => { load(); }, [year, month]);

  const onAdd = () => { setEditId(null); setForm(empty()); setOpen(true); };
  const onEdit = (r) => { setEditId(r.id); setForm({ ...r, price: r.price ?? '', commission: r.commission ?? '' }); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    const property = props.find((p) => p.id === Number(form.propertyId));
    const agent = agents.find((a) => a.id === Number(form.agentId));
    const payload = {
      year, month,
      date: form.date,
      propertyId: form.propertyId ? Number(form.propertyId) : null,
      agentId: form.agentId ? Number(form.agentId) : null,
      propertyName: property?.name || '',
      agentName: agent?.name || '',
      buyer: form.buyer,
      price: Number(form.price) || 0,
      commission: Number(form.commission) || 0,
      notes: form.notes || ''
    };
    if (editId) {
      await db.sales.update(editId, payload);
      await logActivity(user.sub, user.username, 'sale.update', `id=${editId}`);
    } else {
      const id = await db.sales.add({ ...payload, createdAt: new Date().toISOString() });
      await logActivity(user.sub, user.username, 'sale.create', `id=${id}`);
    }
    setOpen(false); load();
  };

  const remove = async (id) => {
    await db.sales.delete(id);
    await logActivity(user.sub, user.username, 'sale.delete', `id=${id}`);
    load();
  };

  const totals = useMemo(() => {
    const price = rows.reduce((s, r) => s + (r.price || 0), 0);
    const comm = rows.reduce((s, r) => s + (r.commission || 0), 0);
    return { price, comm, count: rows.length };
  }, [rows]);

  const columns = [
    { key: 'date', label: 'Cierre', render: (r) => fmtDate(r.date) },
    { key: 'propertyName', label: 'Propiedad' },
    { key: 'buyer', label: 'Comprador' },
    { key: 'agentName', label: 'Agente' },
    { key: 'price', label: 'Precio', render: (r) => fmtMoney(r.price), cellClassName: 'font-semibold text-emerald-700' },
    { key: 'commission', label: 'Comisión', render: (r) => fmtMoney(r.commission) },
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
        title="Ingresos por Venta"
        subtitle="Cierres de venta del periodo"
        actions={<>
          <HelpButton content={HELP.sales} />
          <PeriodPicker />
          <button className="btn-primary" onClick={onAdd}><Plus size={16} /> Nueva venta</button>
        </>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="card card-body">
          <p className="text-xs text-ink-500 uppercase font-semibold">Total ventas</p>
          <p className="text-xl font-bold text-emerald-700">{fmtMoney(totals.price)}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs text-ink-500 uppercase font-semibold">Comisiones</p>
          <p className="text-xl font-bold text-amber-700">{fmtMoney(totals.comm)}</p>
        </div>
        <div className="card card-body">
          <p className="text-xs text-ink-500 uppercase font-semibold">Cierres</p>
          <p className="text-xl font-bold text-ink-800">{totals.count}</p>
        </div>
      </div>

      <div className="card card-body">
        <DataTable columns={columns} rows={rows} />
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editId ? 'Editar venta' : 'Nueva venta'}
        size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={save}>Guardar</button>
        </>}
      >
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Fecha de cierre</label>
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
            <label className="label">Comprador</label>
            <input className="input" required value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} />
          </div>
          <div>
            <label className="label">Agente</label>
            <select className="input" value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
              <option value="">— seleccione —</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Precio (DOP)</label>
            <input type="number" step="0.01" className="input" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div>
            <label className="label">Comisión (DOP)</label>
            <input type="number" step="0.01" className="input" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} />
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
        title="Eliminar venta"
        message="¿Seguro que desea eliminar este registro?"
        danger
      />
    </div>
  );
}
