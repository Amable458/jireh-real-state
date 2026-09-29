import { create } from 'zustand';

// Avisos flotantes. Sustituyen a alert(): no bloquean la pantalla, se
// anuncian al lector de pantalla y se cierran solos.
let seq = 0;

export const useToasts = create((set, get) => ({
  items: [],
  push: (kind, message, ms = 6000) => {
    const id = ++seq;
    set({ items: [...get().items, { id, kind, message }].slice(-4) });
    if (ms) setTimeout(() => get().dismiss(id), ms);
    return id;
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) })
}));

export const toast = {
  error: (message) => useToasts.getState().push('error', message),
  success: (message) => useToasts.getState().push('success', message, 3500)
};
