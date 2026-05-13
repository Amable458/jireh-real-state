import { useRef, useState } from 'react';
import { Download, Upload, AlertTriangle, Database, Sparkles, Trash2, ShieldCheck, CheckCircle2, XCircle, Info, Wrench } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { exportAll, importAll, logActivity } from '../db/database.js';
import { useAuth } from '../store/auth.js';
import { loadSampleData, clearTransactionalData } from '../utils/sampleData.js';
import { validateDB, repairOrphans } from '../utils/validateDB.js';

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
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [validating, setValidating] = useState(false);

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

  const runValidation = async () => {
    setValidating(true);
    try {
      const r = await validateDB();
      setReport(r);
      setReportOpen(true);
      await logActivity(user.sub, user.username, 'db.validate', `errors=${r.issues.filter((i)=>i.level==='error').length} warnings=${r.issues.filter((i)=>i.level==='warning').length}`);
    } catch (err) {
      setMsg('Error en validación: ' + err.message);
      setTimeout(() => setMsg(''), 4000);
    } finally {
      setValidating(false);
    }
  };

  const doRepair = async () => {
    try {
      const { fixed } = await repairOrphans();
      await logActivity(user.sub, user.username, 'db.repair', `fixed=${fixed}`);
      setMsg(`✓ Reparación completada. Referencias huérfanas corregidas: ${fixed}.`);
      setReportOpen(false);
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      setMsg('Error en reparación: ' + err.message);
      setTimeout(() => setMsg(''), 4000);
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

      {/* Aviso de arquitectura local */}
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
        <Info size={20} className="text-amber-700 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold mb-1">Almacenamiento local por dispositivo</p>
          <p>Este sistema guarda los datos en <b>IndexedDB</b> del navegador. Cada equipo/navegador tiene su propia copia y <b>no se sincroniza automáticamente</b> con otros. Para usar los mismos datos en otro equipo, exporta el respaldo aquí e impórtalo en el otro dispositivo. Si necesita sincronización multi-usuario en tiempo real, requiere migrar a un backend (Supabase / Vercel Postgres).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card card-body">
          <Database className="text-ink-900 mb-2" size={28} />
          <h3 className="font-semibold text-ink-800 text-lg mb-1">Exportar respaldo</h3>
          <p className="text-sm text-ink-500 mb-4">Descarga un archivo JSON con toda la información: usuarios, ingresos, gastos, propiedades, inquilinos, configuración y bitácora.</p>
          <button className="btn-primary" onClick={onExport}><Download size={16} /> Descargar respaldo</button>
        </div>

        <div className="card card-body">
          <Upload className="text-amber-600 mb-2" size={28} />
          <h3 className="font-semibold text-ink-800 text-lg mb-1">Importar / Restaurar</h3>
          <p className="text-sm text-ink-500 mb-2">Restaura un archivo de respaldo previo.</p>
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3 flex items-start gap-2 mb-4">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span><b>Advertencia:</b> esta acción reemplaza completamente los datos actuales. Considere exportar antes de importar.</span>
          </div>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onPick} />
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Seleccionar archivo</button>
        </div>

        <div className="card card-body">
          <Sparkles className="text-emerald-600 mb-2" size={28} />
          <h3 className="font-semibold text-ink-800 text-lg mb-1">Cargar datos de ejemplo</h3>
          <p className="text-sm text-ink-500 mb-2">Genera un escenario realista con propiedades, inquilinos, agentes adicionales, rentas, ventas y gastos a lo largo de 6 meses para explorar todos los módulos.</p>
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
          <h3 className="font-semibold text-ink-800 text-lg mb-1">Limpiar datos</h3>
          <p className="text-sm text-ink-500 mb-2">Elimina todos los datos transaccionales para empezar desde cero. Útil para borrar el escenario de ejemplo o limpiar pruebas.</p>
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg p-3 flex items-start gap-2 mb-4">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span><b>Se eliminarán:</b> rentas, ventas, gastos, propiedades, inquilinos, distribuciones y bitácora. Los <b>usuarios y agentes</b> se conservan, así como la <b>configuración de distribución</b>.</span>
          </div>
          <button className="btn-danger" disabled={clearing} onClick={() => setConfirmClear(true)}>
            <Trash2 size={16} /> {clearing ? 'Limpiando...' : 'Limpiar datos'}
          </button>
        </div>

        <div className="card card-body md:col-span-2">
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-emerald-600 flex-shrink-0" size={28} />
            <div className="flex-1">
              <h3 className="font-semibold text-ink-800 text-lg mb-1">Validar base de datos</h3>
              <p className="text-sm text-ink-500 mb-3">Audita la consistencia de los datos en este dispositivo: conteos por tabla, integridad referencial (rentas/ventas apuntando a propiedades, inquilinos o agentes eliminados), validez de montos y períodos, configuración de distribución, usuarios y SuperAdmin activo.</p>
              <button className="btn-primary" disabled={validating} onClick={runValidation}>
                <ShieldCheck size={16} /> {validating ? 'Validando...' : 'Ejecutar validación'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {msg && <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-3 py-2">{msg}</div>}

      <Modal
        open={reportOpen} onClose={() => setReportOpen(false)}
        title="Reporte de validación" size="lg"
        footer={<>
          {report && report.issues.some((i) => i.message.includes('huérfan') || i.message.includes('referencian')) && (
            <button className="btn-secondary" onClick={doRepair}>
              <Wrench size={14} /> Reparar referencias huérfanas
            </button>
          )}
          <button className="btn-primary" onClick={() => setReportOpen(false)}>Cerrar</button>
        </>}
      >
        {report && (
          <div className="text-sm space-y-4">
            <div className={`rounded-lg p-3 flex items-start gap-2 ${report.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              {report.ok
                ? <CheckCircle2 className="text-emerald-600 mt-0.5 flex-shrink-0" size={18} />
                : <XCircle className="text-red-600 mt-0.5 flex-shrink-0" size={18} />}
              <div>
                <p className={`font-semibold ${report.ok ? 'text-emerald-800' : 'text-red-800'}`}>
                  {report.ok ? 'Base de datos consistente' : 'Se detectaron errores críticos'}
                </p>
                <p className={`text-xs ${report.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {report.issues.filter((i)=>i.level==='error').length} errores · {report.issues.filter((i)=>i.level==='warning').length} advertencias · {report.issues.filter((i)=>i.level==='info').length} informativos
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-ink-800 mb-2">Conteo por tabla</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {Object.entries(report.stats).map(([t, n]) => (
                  <div key={t} className="bg-ink-50 rounded px-2.5 py-1.5 flex justify-between">
                    <span className="text-ink-600 font-mono">{t}</span>
                    <span className={`font-semibold ${n < 0 ? 'text-red-600' : 'text-ink-900'}`}>{n}</span>
                  </div>
                ))}
              </div>
            </div>

            {report.issues.length > 0 ? (
              <div>
                <h4 className="font-semibold text-ink-800 mb-2">Hallazgos</h4>
                <ul className="space-y-1.5">
                  {report.issues.map((i, idx) => {
                    const colors = {
                      error:   'bg-red-50 border-red-200 text-red-800',
                      warning: 'bg-amber-50 border-amber-200 text-amber-800',
                      info:    'bg-ink-50 border-ink-200 text-ink-700'
                    };
                    const Icon = i.level === 'error' ? XCircle : i.level === 'warning' ? AlertTriangle : Info;
                    return (
                      <li key={idx} className={`flex items-start gap-2 text-xs border rounded-md px-2.5 py-1.5 ${colors[i.level]}`}>
                        <Icon size={14} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-mono opacity-70 mr-1">[{i.table}]</span>
                          <span>{i.message}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-emerald-700">No hay hallazgos. Todo consistente.</p>
            )}

            {report.storage && (
              <div className="text-xs text-ink-500">
                <h4 className="font-semibold text-ink-800 mb-1">Almacenamiento del navegador</h4>
                <p>Usado: {(report.storage.usage / 1024).toFixed(1)} KB · Cuota: {(report.storage.quota / (1024 * 1024)).toFixed(0)} MB</p>
              </div>
            )}

            <p className="text-[11px] text-ink-400">
              Generado: {new Date(report.timestamp).toLocaleString('es-DO')}
            </p>
          </div>
        )}
      </Modal>

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
