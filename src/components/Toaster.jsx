import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useToasts } from '../store/toast.js';

const STYLES = {
  error: { icon: AlertTriangle, box: 'bg-white ring-red-600/20', icon_: 'text-red-600' },
  success: { icon: CheckCircle2, box: 'bg-white ring-emerald-600/20', icon_: 'text-emerald-600' }
};

export default function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div
      className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => {
        const s = STYLES[t.kind] || STYLES.error;
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl shadow-pop ring-1 ${s.box} px-4 py-3 animate-in-up`}
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${s.icon_}`} aria-hidden="true" />
            <p className="flex-1 text-sm text-ink-800 leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="btn-ghost -mr-2 -my-1 p-1.5 text-ink-400 hover:text-ink-700"
              aria-label="Cerrar aviso"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
