import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Building, Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuth } from '../store/auth.js';

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
    <div className="min-h-screen w-full bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex bg-white p-3 rounded-2xl shadow-lg mb-3">
            <Building size={36} className="text-brand-700" />
          </div>
          <h1 className="text-3xl font-bold text-white">Jireh Real State</h1>
          <p className="text-brand-200 text-sm">Sistema de Gestión Inmobiliaria</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <h2 className="text-xl font-semibold text-slate-800 mb-1">Iniciar sesión</h2>
          <p className="text-sm text-slate-500 mb-5">Ingrese sus credenciales para continuar</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Usuario</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  className="input pl-9" autoFocus required value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="usuario"
                />
              </div>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  className="input pl-9 pr-10" required type={show ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded" />
              Recordarme por 30 días
            </label>
            {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-brand-200 mt-4">© {new Date().getFullYear()} Jireh Real State</p>
      </div>
    </div>
  );
}
