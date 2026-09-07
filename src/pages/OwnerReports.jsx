import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, FileDown, X } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import CurrencyFields from '../components/CurrencyFields.jsx';
import HELP from '../utils/helpContent.jsx';
import { useAuth } from '../store/auth.js';
import { useSettings } from '../store/settings.js';
import { db, logActivity } from '../db/database.js';
import { useRealtimeTable } from '../hooks/useRealtimeTable.js';
import { fmtDate, todayISO } from '../utils/format.js';
import { fmtCur } from '../utils/currency.js';
import {
  PAYMENT_METHODS, emptyItem, normalizeItems, itemsTotal, generateOwnerReportPDF
} from '../utils/ownerReport.js';

// Primer y último día del mes en curso, como periodo por defecto
const monthBounds = () => {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`
  };
};

const empty = () => {
  const { from, to } = monthBounds();
  return {
    tenantId: '', propertyId: '',
    ownerName: '', tenantName: '', address: '', apartmentNo: '', residentialName: '',
    periodFrom: from, periodTo: to, paymentDate: todayISO(), depositAccount: '',
    rentAmount: '', currency: 'DOP', exchangeRate: '',
    items: [emptyItem()],
    notes: ''
  };
};

export default function OwnerReports() {
  const { user } = useAuth();
  const { usdToDop } = useSettings();
  const [rows, setRows] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [props, setProps] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });

  const load = async () => {
    const [r, t, p] = await Promise.all([
      db.ownerReports.toArray(),
      db.tenants.toArray(),
      db.properties.toArray()
    ]);
    r.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    setRows(r); setTenants(t); setProps(p);
  };
  useEffect(() => { load(); }, []);
  useRealtimeTable('ownerReports', () => load());

  const onAdd = () => { setEditId(null); setSaveErr(''); setForm(empty()); setOpen(true); };
  const onEdit = (r) => {
    setEditId(r.id); setSaveErr('');
    setForm({
      ...empty(), ...r,
      tenantId: r.tenantId ?? '', propertyId: r.propertyId ?? '',
      rentAmount: r.rentAmount ?? '', exchangeRate: r.exchangeRate ?? '',
      currency: r.currency || 'DOP',
      items: normalizeItems(r.items).length ? normalizeItems(r.items) : [emptyItem()]
    });
    setOpen(true);
  };

  // Elegir un inquilino rellena de golpe propietario, dirección, residencial
  // y renta. Todo queda editable después.
  const pickTenant = (id) => {
    const t = tenants.find((x) => String(x.id) === String(id));
    if (!t) { setForm({ ...form, tenantId: '' }); return; }
    const p = props.find((x) => x.id === t.propertyId);
    setForm({
      ...form,
      tenantId: t.id,
      propertyId: t.propertyId ?? '',
      tenantName: t.name || '',
      ownerName: p?.owner || form.ownerName,
      address: p?.address || form.address,
      residentialName: p?.name || t.propertyName || form.residentialName,
      rentAmount: t.monthlyRent ?? form.rentAmount,
      currency: t.currency === 'USD' ? 'USD' : 'DOP',
      exchangeRate: t.currency === 'USD' ? (t.exchangeRate ?? usdToDop) : ''
    });
  };

  const setItem = (idx, patch) => {
    const items = form.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setForm({ ...form, items });
  };
  const addItem = () => setForm({ ...form, items: [...form.items, emptyItem()] });
  const removeItem = (idx) => {
    const items = form.items.filter((_, i) => i !== idx);
    setForm({ ...form, items: items.length ? items : [emptyItem()] });
  };

  const cleanItems = (items) =>
    normalizeItems(items).filter((i) => i.description.trim() || i.amount > 0);

  const buildPayload = () => {
    const currency = form.currency === 'USD' ? 'USD' : 'DOP';
    return {
      tenantId: form.tenantId ? Number(form.tenantId) : null,
      propertyId: form.propertyId ? Number(form.propertyId) : null,
      ownerName: form.ownerName || '',
      tenantName: form.tenantName || '',
      address: form.address || '',
      apartmentNo: form.apartmentNo || '',
      residentialName: form.residentialName || '',
      periodFrom: form.periodFrom || null,
      periodTo: form.periodTo || null,
      paymentDate: form.paymentDate || null,
      depositAccount: form.depositAccount || '',
      rentAmount: Number(form.rentAmount) || 0,
      currency,
      exchangeRate: currency === 'USD' ? (Number(form.exchangeRate) || usdToDop) : null,
      items: cleanItems(form.items),
      notes: form.notes || ''
    };
  };

  // Guarda y devuelve el registro completo (con id) para poder imprimirlo
  const save = async (e) => {
    e?.preventDefault?.();
    if (form.periodFrom && form.periodTo && form.periodTo < form.periodFrom) {
      setSaveErr('La fecha "Hasta" debe ser posterior a "Desde".');
      return null;
    }
    const payload = buildPayload();
    setSaveErr(''); setSaving(true);
    try {
      let id = editId;
      if (editId) {
        await db.ownerReports.update(editId, payload);
        await logActivity(user.sub, user.username, 'ownerReport.update', `id=${editId}`);
      } else {
        id = await db.ownerReports.add({ ...payload, createdAt: new Date().toISOString(), createdBy: user.username });
        await logActivity(user.sub, user.username, 'ownerReport.create', `id=${id}`);
      }
      setOpen(false);
      await load();
      return { ...payload, id };
    } catch (ex) {
      const msg = ex?.message || 'Error al guardar';
      const hint = /relation .*ownerReports|does not exist|schema cache/i.test(msg)
        ? ' — Ejecute la migración supabase/migration_reporte_propietario.sql en Supabase.'
        : '';
      setSaveErr(msg + hint);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveAndPdf = async () => {
    const saved = await save();
    if (saved) await exportPdf(saved);
  };

  const exportPdf = async (r) => {
    setPdfBusy(r.id ?? 'new');
    try {
      await generateOwnerReportPDF(r);
      if (r.id) await logActivity(user.sub, user.username, 'ownerReport.pdf', `id=${r.id}`);
    } catch (ex) {
      alert(ex?.message || 'No se pudo generar el PDF');
    } finally {
      setPdfBusy(null);
    }
  };

  const remove = async (id) => {
    await db.ownerReports.delete(id);
    await logActivity(user.sub, user.username, 'ownerReport.delete', `id=${id}`);
    load();
  };

  // Totales del formulario en vivo
  const ccy = form.currency === 'USD' ? 'USD' : 'DOP';
  const liveTotal = useMemo(() => itemsTotal(form.items), [form.items]);
  const liveNet = (Number(form.rentAmount) || 0) - liveTotal;

  const columns = [
    { key: 'createdAt', label: 'Creado', render: (r) => fmtDate(String(r.createdAt || '').slice(0, 10)) },
    { key: 'ownerName', label: 'Propietario', cellClassName: 'font-medium' },
    { key: 'tenantName', label: 'Inquilino' },
    { key: 'residentialName', label: 'Residencial / Propiedad' },
    { key: 'periodFrom', label: 'Periodo', render: (r) => `${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}` },
    { key: 'total', label: 'Gastos', accessor: (r) => itemsTotal(r.items), render: (r) => fmtCur(itemsTotal(r.items), r.currency === 'USD' ? 'USD' : 'DOP') },
    { key: 'rentAmount', label: 'Renta', render: (r) => fmtCur(r.rentAmount, r.currency === 'USD' ? 'USD' : 'DOP') },
    { key: 'net', label: 'Neto', accessor: (r) => (Number(r.rentAmount) || 0) - itemsTotal(r.items), render: (r) => {
      const n = (Number(r.rentAmount) || 0) - itemsTotal(r.items);
      return <span className={n >= 0 ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>{fmtCur(n, r.currency === 'USD' ? 'USD' : 'DOP')}</span>;
    }},
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        <button onClick={() => exportPdf(r)} disabled={pdfBusy === r.id} title="Descargar PDF" className="btn-ghost p-1.5 text-ink-700"><FileDown size={14} /></button>
        <button onClick={() => onEdit(r)} title="Editar" className="btn-ghost p-1.5"><Edit2 size={14} /></button>
        <button onClick={() => setConfirm({ open: true, id: r.id })} title="Eliminar" className="btn-ghost p-1.5 text-red-600"><Trash2 size={14} /></button>
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader
        title="Reporte a Propietario"
        subtitle="Gastos realizados en la propiedad, para entregar al dueño en PDF"
        actions={<>
          <HelpButton content={HELP.ownerReports} />
          <button className="btn-primary" onClick={onAdd}><Plus size={16} /> Nuevo reporte</button>
        </>}
      />

      <DataTable columns={columns} rows={rows} emptyText="Aún no hay reportes. Crea el primero con «Nuevo reporte»." />

      <Modal
        open={open} onClose={() => setOpen(false)} size="xl"
        title={editId ? 'Editar reporte de gastos' : 'Nuevo reporte de gastos'}
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
          <button type="button" className="btn-secondary" onClick={saveAndPdf} disabled={saving}>
            <FileDown size={16} /> Guardar y PDF
          </button>
          <button type="submit" form="owner-report-form" className="btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>}
      >
        <form id="owner-report-form" onSubmit={save} className="space-y-5">
          {saveErr && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2" role="alert">{saveErr}</div>
          )}

          {/* Datos del residente */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">Datos del residente</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="label">Inquilino (rellena los datos automáticamente)</label>
                <select className="input" value={form.tenantId} onChange={(e) => pickTenant(e.target.value)}>
                  <option value="">— Elegir inquilino —</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}{t.propertyName ? ` · ${t.propertyName}` : ''}</option>)}
                </select>
              </div>
              <div><label className="label">Nombre del propietario</label><input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></div>
              <div><label className="label">Nombre del inquilino</label><input className="input" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} /></div>
              <div className="md:col-span-2"><label className="label">Dirección</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><label className="label">No. de apartamento</label><input className="input" value={form.apartmentNo} onChange={(e) => setForm({ ...form, apartmentNo: e.target.value })} /></div>
              <div><label className="label">Nombre del residencial</label><input className="input" value={form.residentialName} onChange={(e) => setForm({ ...form, residentialName: e.target.value })} /></div>
            </div>
          </section>

          {/* Periodo */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">Periodo de gastos</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="label">Desde</label><input type="date" className="input" value={form.periodFrom} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} /></div>
              <div><label className="label">Fecha de pago</label><input type="date" className="input" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} /></div>
              <div><label className="label">Hasta</label><input type="date" className="input" value={form.periodTo} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} /></div>
              <div><label className="label">Cuenta a depositar</label><input className="input" placeholder="Banco · No. de cuenta" value={form.depositAccount} onChange={(e) => setForm({ ...form, depositAccount: e.target.value })} /></div>
              <CurrencyFields currency={form.currency} exchangeRate={form.exchangeRate} onChange={(patch) => setForm({ ...form, ...patch })} />
              <div className="md:col-span-2">
                <label className="label">Total a la fecha — monto de renta ({ccy === 'USD' ? 'US$' : 'RD$'})</label>
                <input type="number" step="0.01" min="0" className="input" value={form.rentAmount} onChange={(e) => setForm({ ...form, rentAmount: e.target.value })} />
              </div>
            </div>
          </section>

          {/* Gastos */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">Gastos realizados</h4>
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={addItem}><Plus size={14} /> Agregar gasto</button>
            </div>
            {/* Una tarjeta por gasto. Siete columnas en una tabla no caben en el
                ancho del modal y los campos quedaban recortados ("Jireh Real St"). */}
            <div className="space-y-3">
              {(() => {
                let acc = 0;
                return form.items.map((it, idx) => {
                  acc += Number(it.amount) || 0;
                  return (
                    <div key={idx} className="relative rounded-xl border border-ink-200 bg-ink-50/40 p-3 pr-10">
                      <button
                        type="button"
                        className="btn-ghost absolute top-2 right-2 p-1.5 text-ink-400 hover:text-red-600"
                        onClick={() => removeItem(idx)}
                        aria-label={`Quitar gasto ${idx + 1}`}
                        title="Quitar"
                      >
                        <X size={15} />
                      </button>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="label text-xs">Fecha de pago</label>
                          <input type="date" className="input" value={it.date} onChange={(e) => setItem(idx, { date: e.target.value })} />
                        </div>
                        <div>
                          <label className="label text-xs">Forma de pago</label>
                          <select className="input" value={it.method} onChange={(e) => setItem(idx, { method: e.target.value })}>
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">Importe ({ccy === 'USD' ? 'US$' : 'RD$'})</label>
                          <input type="number" step="0.01" min="0" className="input text-right tnum" placeholder="0.00" value={it.amount} onChange={(e) => setItem(idx, { amount: e.target.value })} />
                        </div>
                        <div>
                          <label className="label text-xs">Acumulado</label>
                          <div className="input bg-brand-50 border-brand-200 text-right font-semibold tnum text-ink-900 cursor-default select-none">
                            {fmtCur(acc, ccy)}
                          </div>
                        </div>

                        <div className="col-span-2">
                          <label className="label text-xs">Descripción del gasto</label>
                          <input className="input" placeholder="Ej. Reparación de tubería del baño principal" value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} />
                        </div>
                        <div className="col-span-2">
                          <label className="label text-xs">Pagado a</label>
                          <input className="input" placeholder="Ej. Plomería Rodríguez / Ferretería Ochoa" value={it.paidTo} onChange={(e) => setItem(idx, { paidTo: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="mt-3 ml-auto max-w-sm bg-ink-50 rounded-xl p-4 text-sm space-y-1.5 tnum">
              <div className="flex justify-between"><span className="text-ink-600">Total gastado</span><b>{fmtCur(liveTotal, ccy)}</b></div>
              <div className="flex justify-between"><span className="text-ink-600">Renta cobrada a la fecha</span><b>{fmtCur(Number(form.rentAmount) || 0, ccy)}</b></div>
              <div className="flex justify-between border-t border-ink-200 pt-1.5">
                <span className="font-semibold">{liveNet >= 0 ? 'Neto a entregar al propietario' : 'Saldo a favor de Jireh'}</span>
                <b className={liveNet >= 0 ? 'text-emerald-700' : 'text-red-700'}>{fmtCur(Math.abs(liveNet), ccy)}</b>
              </div>
            </div>
          </section>

          <div>
            <label className="label">Notas para el propietario</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null })}
        onConfirm={() => remove(confirm.id)}
        title="Eliminar reporte"
        message="¿Eliminar este reporte de gastos? Esta acción no se puede deshacer."
        danger
      />
    </div>
  );
}
