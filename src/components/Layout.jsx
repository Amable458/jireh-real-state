import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import { LogoMark } from './Logo.jsx';

export default function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-full bg-ink-50">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-ink-100
                           px-4 py-3 flex items-center gap-3">
          <button className="btn-ghost p-2 -ml-2" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 text-ink-900">
            <div className="bg-brand-500 p-1.5 rounded-lg flex items-center"><LogoMark size={18} /></div>
            <h2 className="font-extrabold tracking-[0.16em] text-sm">JIREH</h2>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
