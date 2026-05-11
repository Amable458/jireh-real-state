import { useRef, useState } from 'react';
import { Download, Upload, AlertTriangle, Database, Sparkles, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { exportAll, importAll, logActivity } from '../db/database.js';
import { useAuth } from '../store/auth.js';
import { loadSampleData, clearTransactionalData } from '../utils/sampleData.js';

export default function Backup() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [msg, setMsg] = useState('');

  const onExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `jireh-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    await logActivity(user.sub, user.username, 'backup.export', '');
    setMsg('Respaldo descargado');
    setTimeout(() => setMsg(''), 2500);
  };

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      if (!json.data) throw new Error('Archivo inválido');
      setPendingPayload(json);
      setConfirmImport(true);
    } catch (err) {
      setMsg('Error: ' + err.message);
      setTimeout(() => setMsg(''), 3000);
    } finally {
      e.target.value = '';
    }
  };

  const doSample = async () => {
    setLoadingSample(true);
    try {
      const r = await loadSampleData(user);
      setMsg(`Datos de ejemplo cargados: ${r.properties} propiedades, ${r.tenants} inquilinos, ${r.rentals} rentas, ${r.sales} ventas, ${r.expenses} gastos en ${r.months} meses. Recargando...`);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setMsg('Error: ' + err.message);
      setTimeout(() => setMsg(''), 4000);
    } finally {
      setLoadingSample(false);
    }
  };

  const doClear = async () => {
    setClearing(true);
    try {
      await clearTransactionalData(user);
      setMsg('Datos transaccionales eliminados. Recargando...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMsg('Error: ' + err.message);
      setTimeout(() => setMsg(''), 4000);
    } finally {
      setClearing(false);
    }
  };

  const doImport = async () => {
    try {
      await importAll(pendingPayload);
      await logActivity(user.sub, user.username, 'backup.import', '');
      setMsg('Restauración completada. Recargando...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMsg('Error: ' + err.message);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  return (
    <div>
      <PageHeader
        title="Respaldo y Restauración"
        subtitle="Exportar e importar todos los datos del sistema en formato JSON"
        actions={<HelpButton content={HELP.backup} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card card-body">
          <Database className="text-brand-700 mb-2" size={28} />
          <h3 className="font-semibold text-slate-800 text-lg mb-1">Exportar respaldo</h3>
          <p className="text-sm text-slate-500 mb-4">Descarga un archivo JSON con toda la información: usuarios, ingresos, gastos, propiedades, inquilinos, configuración y bitácora.</p>
          <button className="btn-primary" onClick={onExport}><Download size={16} /> Descargar respaldo</button>
        </div>

        <div className="card card-body">
          <Upload className="text-amber-600 mb-2" size={28} />
          <h3 className="font-semibold text-slate-800 text-lg mb-1">Importar / Restaurar</h3>
          <p className="text-sm text-slate-500 mb-2">Restaura un archivo de respaldo previo.</p>
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3 flex items-start gap-2 mb-4">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span><b>Advertencia:</b> esta acción reemplaza completamente los datos actuales. Considere exportar antes de importar.</span>
          </div>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onPick} />
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Seleccionar archivo</button>
        </div>

        <div className="card card-body">
          <Sparkles className="text-emerald-600 mb-2" size={28} />
          <h3 className="font-semibold text-slate-800 text-lg mb-1">Cargar datos de ejemplo</h3>
          <p className="text-sm text-slate-500 mb-2">Genera un escenario realista con propiedades, inquilinos, agentes adicionales, rentas, ventas y gastos a lo largo de 6 meses para explorar todos los módulos.</p>
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3 flex items-start gap-2 mb-4">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span><b>Atención:</b> elimina rentas, ventas, gastos, propiedades, inquilinos y bitácora actuales (los usuarios y agentes existentes se conservan).</span>
          </div>
          <button className="btn-success" disabled={loadingSample} onClick={() => setConfirmSample(true)}>
            <Sparkles size={16} /> {loadingSample ? 'Cargando...' : 'Generar datos de ejemplo'}
          </button>
        </div>

        <div className="card card-body">
          <Trash2 className="text-red-600 mb-2" size={28} />
          <h3 className="font-semibold text-slate-800 text-lg mb-1">Limpiar datos</h3>
          <p className="text-sm text-slate-500 mb-2">Elimina todos los datos transaccionales para empezar desde cero. Útil para borrar el escenario de ejemplo o limpiar pruebas.</p>
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg p-3 flex items-start gap-2 mb-4">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span><b>Se eliminarán:</b> rentas, ventas, gastos, propiedades, inquilinos, distribuciones y bitácora. Los <b>usuarios y agentes</b> se conservan, así como la <b>configuración de distribución</b>.</span>
          </div>
          <button className="btn-danger" disabled={clearing} onClick={() => setConfirmClear(true)}>
            <Trash2 size={16} /> {clearing ? 'Limpiando...' : 'Limpiar datos'}
          </button>
        </div>
      </div>

      {msg && <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-3 py-2">{msg}</div>}

      <ConfirmModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={doClear}
        title="Limpiar todos los datos"
        message="Esta acción eliminará permanentemente: rentas, ventas, gastos, propiedades, inquilinos, distribuciones y bitácora. Los usuarios, agentes y la configuración de distribución se conservan. ¿Está seguro?"
        danger
      />

      <ConfirmModal
        open={confirmSample}
        onClose={() => setConfirmSample(false)}
        onConfirm={doSample}
        title="Cargar datos de ejemplo"
        message="Esto borrará los datos transaccionales actuales (rentas, ventas, gastos, propiedades, inquilinos, bitácora) y los reemplazará con un escenario de ejemplo de 6 meses. ¿Desea continuar?"
        danger
      />

      <ConfirmModal
        open={confirmImport}
        onClose={() => { setConfirmImport(false); setPendingPayload(null); }}
        onConfirm={doImport}
        title="Restaurar respaldo"
        message="Toda la información actual será reemplazada. ¿Desea continuar?"
        danger
      />
    </div>
  );
}
