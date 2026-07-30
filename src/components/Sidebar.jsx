import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, DollarSign, Home, Receipt, PieChart, Award,
  Building2, FileBarChart, Users, Database, LogOut, KeyRound
} from 'lucide-react';
import { useAuth } from '../store/auth.js';
import { LogoMark } from './Logo.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/ingresos', label: 'Ingresos', icon: DollarSign, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/ventas', label: 'Ingresos por Venta', icon: Home, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/gastos', label: 'Gastos Mensuales', icon: Receipt, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/distribucion', label: 'Distribución de Fondos', icon: PieChart, roles: ['SuperAdmin', 'Admin'] },
  { to: '/bonificaciones', label: 'Bonificaciones', icon: Award, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/propiedades', label: 'Propiedades e Inquilinos', icon: Building2, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/reportes', label: 'Reportes', icon: FileBarChart, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['SuperAdmin', 'Admin'] },
  { to: '/respaldo', label: 'Respaldo', icon: Database, roles: ['SuperAdmin'] }
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(false);

  const initials = (user?.fullName || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-ink-950/60 backdrop-blur-[1px] z-30 lg:hidden animate-in-scale"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static z-40 inset-y-0 left-0 w-64 bg-ink-950 text-ink-100
                    flex flex-col border-r border-white/5
                    transition-transform duration-200 ease-out-soft
                    ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Marca */}
        <div className="px-5 py-5 flex items-center gap-3">
          <div className="bg-brand-500 text-ink-900 p-2 rounded-xl flex items-center justify-center shadow-sm">
            <LogoMark size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-white tracking-[0.18em] text-sm leading-tight">JIREH</h1>
            <p className="text-[10px] text-ink-400 tracking-[0.18em] mt-0.5">REAL ESTATE</p>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5" aria-label="Navegación principal">
          {items.filter((i) => i.roles.includes(user?.role)).map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              onClick={onClose}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 min-h-[44px] px-3 rounded-lg text-sm
                 transition-colors duration-150 ease-out-soft
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70 ${
                   isActive
                     ? 'bg-white/[0.07] text-white font-medium'
                     : 'text-ink-300 hover:bg-white/[0.04] hover:text-white'
                 }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Marcador de sección activa */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-brand-500
                                transition-all duration-200 ease-out-soft ${isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'}`}
                  />
                  <i.icon size={18} className={isActive ? 'text-brand-400' : 'text-ink-400 group-hover:text-ink-200'} />
                  <span className="truncate">{i.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Cuenta */}
        <div className="border-t border-white/5 p-3 space-y-0.5">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div className="w-8 h-8 shrink-0 rounded-full bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/25
                            flex items-center justify-center text-[11px] font-bold">
              {initials || '·'}
            </div>
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-white truncate">{user?.fullName}</div>
              <div className="text-brand-400/90">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={() => { setPwdOpen(true); onClose?.(); }}
            className="w-full flex items-center gap-2.5 min-h-[40px] px-2 rounded-lg text-sm text-ink-300
                       hover:bg-white/[0.05] hover:text-white transition-colors duration-150 ease-out-soft
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70"
          >
            <KeyRound size={16} className="text-ink-400" /> Cambiar contraseña
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 min-h-[40px] px-2 rounded-lg text-sm text-ink-300
                       hover:bg-red-500/10 hover:text-red-300 transition-colors duration-150 ease-out-soft
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
          >
            <LogOut size={16} className="text-ink-400" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </>
  );
}
