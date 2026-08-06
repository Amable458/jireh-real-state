import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

export default function Modal({ open, onClose, title, children, size = 'md', footer }) {
  const panelRef = useRef(null);
  const titleId = useId();

  // Las páginas pasan onClose como función flecha en línea, así que cambia de
  // identidad en cada render. Si estuviera en las dependencias del efecto de
  // abajo, éste se desmontaría y remontaría con cada tecla: el foco saltaría
  // del campo al panel y el formulario quedaría inservible. Guardarlo en una
  // ref permite que el efecto dependa solo de `open`.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;

    const onKey = (e) => e.key === 'Escape' && onCloseRef.current?.();
    window.addEventListener('keydown', onKey);

    // Bloquea el scroll del fondo mientras el diálogo está abierto, compensando
    // el ancho de la barra para que la página no "salte" al abrirlo.
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
      // Devuelve el foco a donde estaba antes de abrir
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]); // solo `open`: ver la nota sobre onCloseRef

  if (!open) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px] animate-in-scale"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Escala desde el centro: un modal no está anclado a un disparador */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${sizes[size]} bg-white rounded-2xl shadow-pop border border-ink-100
                    max-h-[90vh] flex flex-col outline-none animate-in-scale`}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-ink-100">
          <h3 id={titleId} className="text-base font-semibold text-ink-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="btn-ghost -mr-2 p-2 text-ink-400 hover:text-ink-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3.5 border-t border-ink-100 bg-ink-50/60 rounded-b-2xl flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title = 'Confirmar acción', message, danger }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onConfirm?.(); onClose?.(); }}>
            Confirmar
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-600 leading-relaxed">{message}</p>
    </Modal>
  );
}
