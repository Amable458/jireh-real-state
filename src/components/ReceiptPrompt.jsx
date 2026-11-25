import { useEffect, useState } from 'react';
import { FileDown, Printer } from 'lucide-react';
import Modal from './Modal.jsx';
import { useAuth } from '../store/auth.js';
import { logActivity } from '../db/database.js';
import { toast } from '../store/toast.js';
import { fmtCur, recCurrency } from '../utils/currency.js';
import { todayISO } from '../utils/format.js';
import {
  PAYMENT_METHODS, ensureReceipt, receivedAmount, receiptNumber,
  downloadReceiptPDF, printReceipt
} from '../utils/receipt.js';

// Pregunta si se quiere recibo para un cobro recién registrado (o para
// reimprimirlo desde la tabla). Es opcional: «No, gracias» no crea nada.
export default function ReceiptPrompt({ income, onClose, asked = true }) {
  const { user } = useAuth();
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [busy, setBusy] = useState('');
  const [date, setDate] = useState('');

  // Fecha del pago: la de hoy si se acaba de cobrar con el botón ✓ (paidOn);
  // si no, la fecha del ingreso.
  useEffect(() => {
    if (!income) return;
    setMethod(PAYMENT_METHODS[0]);
    setDate(income.paidOn || income.date || todayISO());
  }, [income]);

  if (!income) return null;
  const ccy = recCurrency(income);
  const amount = receivedAmount(income);

  const run = async (kind) => {
    setBusy(kind);
    try {
      const { receipt, saved, reused, error } = await ensureReceipt(income, { method, user, paymentDate: date });
      if (!saved) {
        console.warn('[Jireh] Recibo sin guardar:', error?.message);
        toast.error('El recibo se generó pero no quedó en el historial: falta ejecutar supabase/migration_recibos_ventas.sql en Supabase.');
      } else if (!reused) {
        await logActivity(user.sub, user.username, 'receipt.create', `${receiptNumber(receipt)} ingreso=${income.id}`);
      }
      if (kind === 'print') await printReceipt(receipt);
      else await downloadReceiptPDF(receipt);
      onClose();
    } catch (ex) {
      toast.error(ex?.message || 'No se pudo generar el recibo');
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal
      open={!!income}
      onClose={() => !busy && onClose()}
      title={asked ? 'Cobro registrado · ¿Generar recibo?' : 'Recibo de pago'}
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={!!busy}>{asked ? 'No, gracias' : 'Cerrar'}</button>
        <button className="btn-secondary" onClick={() => run('pdf')} disabled={!!busy}>
          <FileDown size={15} /> {busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}
        </button>
        <button className="btn-primary" onClick={() => run('print')} disabled={!!busy}>
          <Printer size={15} /> {busy === 'print' ? 'Preparando…' : 'Imprimir'}
        </button>
      </>}
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-ink-500">Inquilino</dt><dd className="text-ink-900 font-medium">{income.tenantName || '—'}</dd>
          <dt className="text-ink-500">Propiedad</dt><dd className="text-ink-900">{income.propertyName || '—'}</dd>
          <dt className="text-ink-500">Concepto</dt><dd className="text-ink-900">{income.category || 'Renta'}</dd>
          <dt className="text-ink-500">Monto recibido</dt><dd className="text-ink-900 font-semibold tnum">{fmtCur(amount, ccy)}</dd>
        </dl>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha del pago</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!busy} />
          </div>
          <div>
            <label className="label">Forma de pago</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} disabled={!!busy}>
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-ink-500">
          El recibo queda guardado en <b>Recibos</b>, donde se puede volver a imprimir. Si este cobro ya tiene recibo, se reimprime el mismo (con su fecha y forma de pago originales).
        </p>
      </div>
    </Modal>
  );
}
