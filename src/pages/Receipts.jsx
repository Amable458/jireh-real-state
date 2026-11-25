import { useEffect, useMemo, useState } from 'react';
import { FileDown, Printer, Trash2, X } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { useAuth } from '../store/auth.js';
import { db, logActivity } from '../db/database.js';
import { useRealtimeTable } from '../hooks/useRealtimeTable.js';
import { toast } from '../store/toast.js';
import { fmtCur } from '../utils/currency.js';
import { fmtDate } from '../utils/format.js';
import { receiptNumber, downloadReceiptPDF, printReceipt } from '../utils/receipt.js';

// Historial de recibos emitidos a inquilinos, filtrable por inquilino,
// propiedad y fechas. Desde aquí se reimprimen.
export default function Receipts() {
  const { user, hasRole } = useAuth();
  const canDelete = hasRole('SuperAdmin', 'Admin');
  const [rows, setRows] = useState([]);
  const [missing, setMissing] = useState(false);
  const [tenant, setTenant] = useState('');
  const [property, setProperty] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      const r = await db.receipts.toArray();
      r.sort((a, b) => b.id - a.id);
      setRows(r); setMissing(false);
    } catch {
      setMissing(true);
    }
  };
  useEffect(() => { load(); }, []);
  useRealtimeTable('receipts', () => load());

  // Opciones de filtro a partir de lo emitido (incluye inquilinos ya retirados)
  const opts = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const tenantOpts = useMemo(() => opts('tenantName'), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const propertyOpts = useMemo(() => opts('propertyName'), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => rows.filter((r) =>
    (!tenant || r.tenantName === tenant) &&
    (!property || r.propertyName === property) &&
    (!from || (r.paymentDate || '') >= from) &&
    (!to || (r.paymentDate || '') <= to)
  ), [rows, tenant, property, from, to]);

  const totals = useMemo(() => filtered.reduce((t, r) => {
    const c = r.currency === 'USD' ? 'USD' : 'DOP';
    t[c] += Number(r.amount) || 0;
    return t;
  }, { DOP: 0, USD: 0 }), [filtered]);

  const hasFilter = tenant || property || from || to;
  const clear = () => { setTenant(''); setProperty(''); setFrom(''); setTo(''); };

  const remove = async (r) => {
    try {
      await db.receipts.delete(r.id);
      await logActivity(user.sub, user.username, 'receipt.delete', receiptNumber(r));
      load();
    } catch (ex) {
      toast.error(ex?.message || 'No se pudo eliminar');
    }
  };

  const columns = [
    { key: 'id', label: 'No.', render: (r) => <span className="font-mono text-xs">{receiptNumber(r)}</span> },
    { key: 'paymentDate', label: 'Fecha', render: (r) => fmtDate(r.paymentDate) },
    { key: 'tenantName', label: 'Inquilino', render: (r) => r.tenantName || '—' },
    { key: 'propertyName', label: 'Propiedad', render: (r) => r.propertyName || '—' },
    { key: 'concept', label: 'Concepto' },
    { key: 'amount', label: 'Monto', render: (r) => <span className="tnum font-medium">{fmtCur(r.amount, r.currency === 'USD' ? 'USD' : 'DOP')}</span> },
    { key: 'method', label: 'Forma de pago', render: (r) => r.method || '—' },
    { key: 'createdBy', label: 'Emitido por', render: (r) => r.createdBy || '—' },
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        <button className="btn-ghost p-1.5" title="Descargar PDF" onClick={() => downloadReceiptPDF(r)}><FileDown size={14} /></button>
        <button className="btn-ghost p-1.5" title="Imprimir" onClick={() => printReceipt(r)}><Printer size={14} /></button>
        {canDelete && (
          <button className="btn-ghost p-1.5 text-red-600" title="Eliminar" onClick={() => setConfirm(r)}><Trash2 size={14} /></button>
        )}
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader
        title="Recibos"
        subtitle="Recibos de pago emitidos a inquilinos"
        actions={<HelpButton content={HELP.receipts} />}
      />

      {missing ? (
        <div className="card p-5 text-sm text-ink-700">
          El historial de recibos aún no está activo: falta ejecutar <b>supabase/migration_recibos_ventas.sql</b> en el SQL Editor de Supabase.
        </div>
      ) : (
        <>
          <div className="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="label">Inquilino</label>
              <select className="input" value={tenant} onChange={(e) => setTenant(e.target.value)}>
                <option value="">Todos</option>
                {tenantOpts.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Propiedad</label>
              <select className="input" value={property} onChange={(e) => setProperty(e.target.value)}>
                <option value="">Todas</option>
                {propertyOpts.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              {hasFilter && (
                <button className="btn-secondary" onClick={clear}><X size={14} /> Quitar filtros</button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-600 mb-3">
            <span><b className="text-ink-900">{filtered.length}</b> recibo{filtered.length === 1 ? '' : 's'}</span>
            {totals.DOP > 0 && <span>Total RD$: <b className="text-ink-900 tnum">{fmtCur(totals.DOP, 'DOP')}</b></span>}
            {totals.USD > 0 && <span>Total US$: <b className="text-ink-900 tnum">{fmtCur(totals.USD, 'USD')}</b></span>}
          </div>

          <DataTable columns={columns} rows={filtered} emptyText="Sin recibos emitidos" />
        </>
      )}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove(confirm)}
        title="Eliminar recibo"
        message={confirm ? `¿Eliminar el recibo ${receiptNumber(confirm)}? El cobro en Ingresos no cambia; solo se quita del historial.` : ''}
        danger
      />
    </div>
  );
}
