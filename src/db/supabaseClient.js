import { createClient } from '@supabase/supabase-js';
import { getSessionToken } from './sessionToken.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = !!(url && key);

// Adjunta el token de sesión en cada petición a la base de datos. Las
// políticas RLS lo leen (request.headers -> x-jireh-session) para exigir una
// sesión válida: sin él, la anon key pública no da acceso a los datos.
const sessionFetch = (input, init = {}) => {
  const t = getSessionToken();
  if (!t) return fetch(input, init);
  // Si llega un Request sin init.headers, partir de sus cabeceras para no
  // perder la apikey/Authorization que ya trae.
  const base = init.headers ?? (input instanceof Request ? input.headers : undefined);
  const headers = new Headers(base || {});
  headers.set('x-jireh-session', t);
  return fetch(input, { ...init, headers });
};

export const supabase = isConfigured
  ? createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: sessionFetch }
    })
  : null;

export const supabaseInfo = { url, configured: isConfigured };
