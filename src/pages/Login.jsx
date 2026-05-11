import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuth } from '../store/auth.js';
import Logo, { LogoMark } from '../components/Logo.jsx';

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

  if (user) return <Navigate to={loc.state?.from?.pathname || '/dashboard'} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    const r = await login(username, password, remember);
    setLoading(false);
    if (!r.ok) setErr(r.message);
    else nav(loc.state?.from?.pathname || '/dashboard', { replace: true });
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
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {err}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 text-base font-semibold">
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <p className="text-center text-xs text-ink-400 mt-8">© {new Date().getFullYear()} Jireh Real Estate</p>
        </div>
      </div>
    </div>
  );
}
