import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import Modal from './Modal.jsx';

export default function HelpButton({ content, title = 'Guía del módulo' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary"
        title="¿Cómo funciona este módulo?"
      >
        <HelpCircle size={16} /> Guía
      </button>
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={title} size="lg"
        footer={<button className="btn-primary" onClick={() => setOpen(false)}>Entendido</button>}
      >
        <div className="prose-help text-sm text-ink-700 space-y-3">
          {content}
        </div>
      </Modal>
    </>
  );
}
