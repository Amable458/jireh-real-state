import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../store/auth.js';
import Logo from '../components/Logo.jsx';
import { rpcUserCount, rpcEnsureDefaultUsers } from '../db/database.js';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [userCount, setUserCount] = useState(null);
  const [healMsg, setHealMsg] = useState('');

  // Diagnóstico al montar
  useEffect(() => {
    rpcUserCount().then(setUserCount).catch(() => setUserCount(-1));
  }, []);

  if (user) return <Navigate to={loc.state?.from?.pathname || '/dashboard'} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    // Sanitiza espacios invisibles que algunos administradores de contraseñas insertan
    const cleanUser = username.trim();
    const cleanPass = password.replace(/^\s+|\s+$/g, '');
    const r = await login(cleanUser, cleanPass, remember);
    setLoading(false);
    if (!r.ok) {
      setErr(r.message);
      setShowHelp(true);
    } else {
      nav(loc.state?.from?.pathname || '/dashboard', { replace: true });
    }
  };

  const reseed = async () => {
    try {
      const created = await rpcEnsureDefaultUsers();
      const count = await rpcUserCount();
      setUserCount(count);
      setHealMsg(created.length
        ? `✓ Usuarios restablecidos (creados: ${created.join(', ')}). Ahora puedes ingresar.`
        : `✓ Los usuarios por defecto ya existen. Total en BD: ${count}.`);
      setTimeout(() => setHealMsg(''), 5000);
    } catch (e) {
      setHealMsg('Error al restablecer: ' + e.message);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2">
      {/* Lado de marca */}
      <div className="hidden lg:flex bg-brand-500 text-ink-900 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-400 opacity-40" />
        <div className="absolute -bottom-40 -right-20 w-[28rem] h-[28rem] rounded-full bg-brand-600 opacity-20" />
        <div className="relative z-10">
          <Logo size={120} vertical />
        </div>
      </div>

      {/* Lado del formulario */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-ink-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex justify-center mb-6 text-ink-900">
            <div className="bg-brand-500 px-5 py-4 rounded-2xl">
              <Logo size={42} />
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-ink-900">Bienvenido de vuelta</h1>
            <p className="text-sm text-ink-500 mt-1">Inicia sesión para continuar</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Usuario</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-2.5 text-ink-400" />
                <input
                  className="input pl-9" autoFocus required value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="usuario"
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-2.5 text-ink-400" />
                <input
                  className="input pl-9 pr-10" required type={show ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-2.5 text-ink-400 hover:text-ink-600">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-600">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded accent-brand-500" />
              Recordarme por 30 días
            </label>
            {err && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{err}</span>
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 text-base font-semibold">
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {/* Bloque de auto-diagnóstico discreto */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="text-xs text-ink-400 hover:text-ink-700 underline underline-offset-2"
            >
              ¿No puede entrar?
            </button>
          </div>

          {showHelp && (
            <div className="mt-3 rounded-lg border border-ink-200 bg-white p-4 text-xs text-ink-600 space-y-3">
              <div>
                <p className="font-semibold text-ink-800 mb-1">Estado de la base de datos</p>
                <p>
                  Usuarios detectados:{' '}
                  <span className="font-mono font-semibold text-ink-900">
                    {userCount === null ? '...' : userCount === -1 ? 'error' : userCount}
                  </span>
                </p>
                {userCount === -1 && (
                  <p className="text-red-600 mt-1">
                    No se pudo acceder a IndexedDB. Salga del modo privado o pruebe otro navegador.
                  </p>
                )}
              </div>

              <div>
                <p className="font-semibold text-ink-800 mb-1">Verificación rápida</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>El usuario es <b>case-insensitive</b>.</li>
                  <li>La contraseña <b>distingue mayúsculas</b> y termina en <b>!</b></li>
                  <li>No estés en modo privado/incógnito.</li>
                </ul>
              </div>

              <div>
                <button type="button" onClick={reseed} className="btn-secondary text-xs py-1.5 w-full justify-center">
                  Restablecer usuarios por defecto
                </button>
                <p className="mt-1 text-[11px] text-ink-400">
                  Esto solo crea los usuarios faltantes. No borra ni modifica los existentes.
                </p>
              </div>

              {healMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md px-3 py-2 flex items-start gap-2">
                  <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{healMsg}</span>
                </div>
              )}
            </div>
          )}

          <p className="text-center text-xs text-ink-400 mt-8">© {new Date().getFullYear()} Jireh Real Estate</p>
        </div>
      </div>
    </div>
  );
}
