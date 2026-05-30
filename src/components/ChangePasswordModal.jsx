import { useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { useAuth } from '../store/auth.js';
import { rpcChangePassword } from '../db/database.js';

export default function ChangePasswordModal({ open, onClose }) {
  const { user, token, logout } = useAuth();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setPwd(''); setConfirm(''); setErr(''); setOk(false); setSaving(false); };

  const close = () => { reset(); onClose?.(); };

  const submit = async (e) => {
    e?.preventDefault();
    setErr('');
    if (pwd !== confirm) { setErr('Las contraseñas no coinciden'); return; }
    // Validación previa (la política real la valida el servidor)
    if (pwd.length < 8 || !/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      setErr('Mínimo 8 caracteres, con mayúscula, minúscula y un dígito');
      return;
    }
    setSaving(true);
    try {
      await rpcChangePassword(token, user.sub, pwd);
      setOk(true);
      // Cambiar la contraseña invalida la sesión en el servidor → cerrar sesión local
      setTimeout(async () => {
        await logout();
      }, 2000);
    } catch (ex) {
      setErr(ex.message || 'Error al cambiar la contraseña');
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Cambiar mi contraseña"
      size="sm"
      footer={!ok && (
        <>
          <button className="btn-secondary" onClick={close} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Guardando...' : 'Actualizar'}
          </button>
        </>
      )}
    >
      {ok ? (
        <div className="text-center py-4">
          <CheckCircle2 size={40} className="text-emerald-600 mx-auto mb-3" />
          <p className="font-semibold text-ink-800">Contraseña actualizada</p>
          <p className="text-sm text-ink-500 mt-1">Por seguridad debe iniciar sesión nuevamente. Cerrando sesión...</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-ink-600 bg-ink-50 rounded-lg px-3 py-2">
            <KeyRound size={16} className="text-ink-400" />
            <span>Usuario: <b className="font-mono">{user?.username}</b></span>
          </div>
          <div>
            <label className="label">Nueva contraseña</label>
            <input
              type="password" className="input" autoFocus
              value={pwd} onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••" autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Confirmar contraseña</label>
            <input
              type="password" className="input"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••" autoComplete="new-password"
            />
          </div>
          <p className="text-xs text-ink-400">
            Requisitos: mínimo 8 caracteres, una mayúscula, una minúscula y un dígito.
          </p>
          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
