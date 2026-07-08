import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
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
import {
  normalizeColegas, makeColegaId, colegasTotalPercent, colegasTotalAmount,
  syncSaleColegaPayables, removeSaleColegaPayables, cleanupOrphanSaleColegas
} from '../utils/saleColegas.js';

const empty = () => ({
  date: todayISO(), propertyId: '', agentId: '',
  buyer: '', price: '', commissionPercent: '', notes: '',
  currency: 'DOP', exchangeRate: '', colegas: []
});

// Monto de comisión = precio × % / 100
const commissionOf = (price, pct) =>
  Math.round((Number(price) || 0) * (Number(pct) || 0)) / 100;

export default function Sales() {
  const { year, month } = usePeriod();
  const { user } = useAuth();
  const { usdToDop } = useSettings();
  const [rows, setRows] = useState([]);
  const [props, setProps] = useState([]);
  const [agents, setAgents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [curFilter, setCurFilter] = useState('all');

  const load = async () => {
    await cleanupOrphanSaleColegas(year, month);
    const [s, p, a] = await Promise.all([
      db.sales.where({ year, month }).toArray(),
      db.properties.toArray(),
      db.agents.where('active').equals(1).toArray()
    ]);
    setRows(s); setProps(p); setAgents(a);
  };
  useEffect(() => { load(); /* eslint-disable-line */ }, [year, month]);
  useRealtimeTable(['sales', 'properties', 'agents', 'expenses'], () => load());

  const onAdd = () => { setEditId(null); setForm(empty()); setOpen(true); };
  const onEdit = (r) => {
    setEditId(r.id);
    // % de comisión: usa el guardado o lo deriva del monto/precio (ventas viejas)
    const pct = r.commissionPercent != null && r.commissionPercent !== ''
      ? r.commissionPercent
      : (Number(r.price) > 0 ? Math.round((Number(r.commission) || 0) / Number(r.price) * 10000) / 100 : '');
    setForm({ ...empty(), ...r, price: r.price ?? '', commissionPercent: pct, currency: r.currency || 'DOP', exchangeRate: r.exchangeRate ?? '', colegas: normalizeColegas(r.colegas) });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const property = props.find((p) => p.id === Number(form.propertyId));
    const agent = agents.find((a) => a.id === Number(form.agentId));
    const currency = form.currency === 'USD' ? 'USD' : 'DOP';
    const exchangeRate = currency === 'USD' ? (Number(form.exchangeRate) || usdToDop) : null;
    // El periodo se determina por la fecha de cierre, no por el selector
    const d = new Date(`${form.date}T00:00:00`);
    const pYear = Number.isNaN(d.getTime()) ? year : d.getFullYear();
    const pMonth = Number.isNaN(d.getTime()) ? month : d.getMonth() + 1;
    const colegas = normalizeColegas(form.colegas).filter((c) => c.name.trim() && Number(c.percent) > 0);
    const price = Number(form.price) || 0;
    const commissionPercent = Number(form.commissionPercent) || 0;
    const commission = commissionOf(price, commissionPercent);
    const payload = {
      year: pYear, month: pMonth,
      date: form.date,
      propertyId: form.propertyId ? Number(form.propertyId) : null,
      agentId: form.agentId ? Number(form.agentId) : null,
      propertyName: property?.name || '',
      agentName: agent?.name || '',
      buyer: form.buyer,
      price,
      commissionPercent,
      commission,
      currency, exchangeRate,
      colegas,
      notes: form.notes || ''
    };
    let saleId = editId;
    if (editId) {
      await db.sales.update(editId, payload);
      await logActivity(user.sub, user.username, 'sale.update', `id=${editId}`);
    } else {
      saleId = await db.sales.add({ ...payload, createdAt: new Date().toISOString() });
      await logActivity(user.sub, user.username, 'sale.create', `id=${saleId}`);
    }
    // Genera/actualiza las cuentas por pagar a colegas
    await syncSaleColegaPayables({ ...payload, id: saleId });
    setOpen(false); load();
  };

  const remove = async (id) => {
    const row = rows.find((r) => r.id === id);
    await db.sales.delete(id);
    if (row) await removeSaleColegaPayables(row);
    await logActivity(user.sub, user.username, 'sale.delete', `id=${id}`);
    load();
  };

  const visibleRows = useMemo(() =>
    curFilter === 'all' ? rows : rows.filter((r) => recCurrency(r) === curFilter),
    [rows, curFilter]
  );

  const totals = useMemo(() => {
    const mk = () => ({ price: 0, comm: 0, count: 0 });
    const t = { DOP: mk(), USD: mk() };
    for (const r of rows) {
      const c = recCurrency(r);
      t[c].price += Number(r.price) || 0;
      t[c].comm += Number(r.commission) || 0;
      t[c].count += 1;
    }
    return { ...t, count: rows.length };
  }, [rows]);

  const columns = [
    { key: 'date', label: 'Cierre', render: (r) => fmtDate(r.date) },
    { key: 'propertyName', label: 'Propiedad' },
    { key: 'buyer', label: 'Comprador' },
    { key: 'agentName', label: 'Agente' },
    { key: 'currency', label: 'Moneda', render: (r) => (
      <span className={recCurrency(r) === 'USD' ? 'badge-warning' : 'badge-slate'}>{recCurrency(r)}</span>
    )},
    { key: 'price', label: 'Precio', render: (r) => fmtCur(r.price, recCurrency(r)), cellClassName: 'font-semibold text-emerald-700' },
    { key: 'commission', label: 'Comisión', render: (r) => (
      <span>
        {fmtCur(r.commission, recCurrency(r))}
        {r.commissionPercent ? <span className="badge-slate ml-1">{Number(r.commissionPercent)}%</span> : null}
      </span>
    )},
    { key: 'colegas', label: 'Neto inmob.', render: (r) => {
      const colegas = normalizeColegas(r.colegas);
      const paidOut = colegasTotalAmount(colegas, r.commission);
      const net = (Number(r.commission) || 0) - paidOut;
      return colegas.length > 0
        ? <span title={colegas.map((c) => `${c.name}: ${c.percent}%`).join(', ')}>
            <span className="font-semibold text-emerald-700">{fmtCur(net, recCurrency(r))}</span>
            <span className="badge-slate ml-1">{colegas.length} colega{colegas.length === 1 ? '' : 's'}</span>
          </span>
        : <span className="font-semibold text-emerald-700">{fmtCur(net, recCurrency(r))}</span>;
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
          <p className="text-xs text-ink-500 uppercase font-semibold mb-1">Total ventas</p>
          <p className="text-lg font-bold text-emerald-700">{fmtCur(totals.DOP.price, 'DOP')}</p>
          {totals.USD.price > 0 && <p className="text-sm font-semibold text-emerald-700 opacity-80">{fmtCur(totals.USD.price, 'USD')}</p>}
        </div>
        <div className="card card-body">
          <p className="text-xs text-ink-500 uppercase font-semibold mb-1">Comisiones</p>
          <p className="text-lg font-bold text-amber-700">{fmtCur(totals.DOP.comm, 'DOP')}</p>
          {totals.USD.comm > 0 && <p className="text-sm font-semibold text-amber-700 opacity-80">{fmtCur(totals.USD.comm, 'USD')}</p>}
        </div>
        <div className="card card-body">
          <p className="text-xs text-ink-500 uppercase font-semibold">Cierres</p>
          <p className="text-xl font-bold text-ink-800">{totals.count}</p>
        </div>
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
          <CurrencyFields
            currency={form.currency}
            exchangeRate={form.exchangeRate}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div>
            <label className="label">Precio ({form.currency === 'USD' ? 'US$' : 'RD$'})</label>
            <input type="number" step="0.01" className="input" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div>
            <label className="label">Comisión (% del precio)</label>
            <input type="number" step="0.01" min="0" max="100" className="input" placeholder="ej. 5" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} />
            <p className="text-xs text-ink-500 mt-1">
              Comisión = {fmtCur(commissionOf(form.price, form.commissionPercent), form.currency === 'USD' ? 'USD' : 'DOP')}
              {Number(form.price) > 0 && Number(form.commissionPercent) > 0 ? ` (${form.commissionPercent}% de ${fmtCur(Number(form.price) || 0, form.currency === 'USD' ? 'USD' : 'DOP')})` : ''}
            </p>
          </div>

          {/* Reparto de comisión a colegas */}
          {(() => {
            const ccy = form.currency === 'USD' ? 'USD' : 'DOP';
            const commission = commissionOf(form.price, form.commissionPercent);
            const totalPct = colegasTotalPercent(form.colegas);
            const totalColegas = colegasTotalAmount(form.colegas, commission);
            const net = commission - totalColegas;
            const over = totalPct > 100;
            const addColega = () => setForm({ ...form, colegas: [...(form.colegas || []), { id: makeColegaId(), name: '', percent: '' }] });
            const setColega = (i, patch) => setForm({ ...form, colegas: form.colegas.map((c, j) => j === i ? { ...c, ...patch } : c) });
            const delColega = (i) => setForm({ ...form, colegas: form.colegas.filter((_, j) => j !== i) });
            return (
              <div className="md:col-span-2 border border-ink-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0 flex items-center gap-1.5"><Users size={14} className="text-ink-500" /> Colegas (reparto de comisión)</label>
                  <button type="button" className="btn-secondary text-xs py-1" onClick={addColega}><Plus size={14} /> Añadir colega</button>
                </div>
                {(form.colegas || []).length === 0 ? (
                  <p className="text-xs text-ink-400">Sin colegas — toda la comisión es de la inmobiliaria. Añade uno si la venta se cerró con un colega.</p>
                ) : (
                  <div className="space-y-2">
                    {form.colegas.map((c, i) => {
                      const amt = Math.round(commission * (Number(c.percent) || 0)) / 100;
                      return (
                        <div key={c.id} className="flex items-center gap-2">
                          <input className="input flex-1 py-1.5" placeholder="Nombre del colega" value={c.name} onChange={(e) => setColega(i, { name: e.target.value })} />
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.5" min="0" max="100" className="input w-20 py-1.5 text-right" placeholder="%" value={c.percent} onChange={(e) => setColega(i, { percent: e.target.value })} />
                            <span className="text-sm text-ink-500">%</span>
                          </div>
                          <span className="text-xs text-ink-600 w-28 text-right">{fmtCur(amt, ccy)}</span>
                          <button type="button" className="btn-ghost p-1 text-red-600" onClick={() => delColega(i)}><Trash2 size={14} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(form.colegas || []).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-ink-100 text-sm space-y-1">
                    <div className="flex justify-between text-ink-600">
                      <span>Total a colegas ({totalPct}%)</span>
                      <span className="font-medium">{fmtCur(totalColegas, ccy)}</span>
                    </div>
                    <div className={`flex justify-between font-semibold ${net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      <span>Neto inmobiliaria ({Math.max(0, 100 - totalPct)}%)</span>
                      <span>{fmtCur(net, ccy)}</span>
                    </div>
                    {over && <p className="text-xs text-red-600">Los colegas suman más de 100% de la comisión.</p>}
                    <p className="text-xs text-ink-400">Cada colega se genera como cuenta por pagar en <b>Gastos Mensuales</b>, en {ccy}.</p>
                  </div>
                )}
              </div>
            );
          })()}

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
