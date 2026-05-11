import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, DollarSign, Home, Receipt, PieChart, Award,
  Building2, FileBarChart, Users, Database, LogOut
} from 'lucide-react';
import { useAuth } from '../store/auth.js';
import { LogoMark } from './Logo.jsx';

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/ingresos', label: 'Ingresos por Renta', icon: DollarSign, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/ventas', label: 'Ingresos por Venta', icon: Home, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/gastos', label: 'Gastos Mensuales', icon: Receipt, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/distribucion', label: 'Distribución de Fondos', icon: PieChart, roles: ['SuperAdmin', 'Admin'] },
  { to: '/bonificaciones', label: 'Bonificaciones', icon: Award, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/propiedades', label: 'Propiedades e Inquilinos', icon: Building2, roles: ['SuperAdmin', 'Admin', 'Operativo'] },
  { to: '/reportes', label: 'Reportes', icon: FileBarChart, roles: ['SuperAdmin', 'Admin'] },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['SuperAdmin', 'Admin'] },
  { to: '/respaldo', label: 'Respaldo', icon: Database, roles: ['SuperAdmin'] }
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();

  return (
    <>
      {open && <div className="fixed inset-0 bg-ink-950/60 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`fixed lg:static z-40 inset-y-0 left-0 w-64 bg-ink-900 text-ink-100 flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="px-5 py-5 border-b border-ink-800 flex items-center gap-3">
          <div className="bg-brand-500 text-ink-900 p-2 rounded-lg flex items-center justify-center">
            <LogoMark size={26} />
          </div>
          <div>
            <h1 className="font-extrabold text-white tracking-[0.18em] text-sm leading-tight">JIREH</h1>
            <p className="text-[10px] text-ink-400 tracking-[0.18em] mt-0.5">REAL ESTATE</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {items.filter((i) => i.roles.includes(user?.role)).map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-l-4 ${
                  isActive
                    ? 'bg-ink-800 text-brand-400 border-brand-500 font-medium'
                    : 'text-ink-300 hover:bg-ink-800/60 hover:text-white border-transparent'
                }`
              }
            >
              <i.icon size={18} />
              <span>{i.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-800 p-3">
          <div className="px-2 py-2 text-xs">
            <div className="font-semibold text-white">{user?.fullName}</div>
            <div className="text-brand-400">{user?.role}</div>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-ink-200 hover:bg-ink-800 hover:text-white transition-colors">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
