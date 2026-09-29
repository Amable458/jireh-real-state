import { useEffect, useRef } from 'react';
import { supabase } from '../db/supabaseClient.js';

// ------------------------------------------------------------------
// Avisos de cambio emitidos por la propia base de datos.
//
// Con RLS por sesión, postgres_changes deja de emitir: Realtime evalúa las
// políticas con el JWT anónimo y no ve la cabecera x-jireh-session. Por eso
// cada tabla tiene un trigger que publica solo "la tabla X cambió" en el
// canal público "jireh-db" (sin filas: no filtra datos), y la app vuelve a
// leer por la vía protegida.
//
// Un único canal compartido para toda la app: si cada componente abriera y
// cerrara el suyo con el mismo nombre, al desmontarse uno cortaría el de los demás.
// ------------------------------------------------------------------
const dbListeners = new Set();
let dbChannel = null;

function ensureDbChannel() {
  if (dbChannel || !supabase) return;
  dbChannel = supabase
    .channel('jireh-db')
    .on('broadcast', { event: 'changed' }, (msg) => {
      const table = msg?.payload?.table;
      dbListeners.forEach((fn) => {
        try { fn(table); } catch (e) { console.error('[Realtime] listener error:', e); }
      });
    })
    .subscribe();
}

/**
 * Suscribe a cambios INSERT/UPDATE/DELETE en una o varias tablas.
 * Llama al callback cuando hay cualquier cambio.
 *
 * Los eventos llegan en ráfaga: marcar una renta como pagada dispara un
 * UPDATE en rentals y un INSERT en expenses casi a la vez, y cada uno
 * provocaba una recarga completa de la página. Se agrupan en una sola
 * llamada al final de la ráfaga (y así también se funden el aviso de la BD y
 * el de postgres_changes mientras ambos convivan).
 *
 * @param {string | string[]} tables - nombre(s) de tabla a observar
 * @param {Function} callback - se invoca tras agrupar los cambios
 * @param {number} [burstMs=250] - ventana de agrupación
 */
export function useRealtimeTable(tables, callback, burstMs = 250) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!supabase) return;
    const list = Array.isArray(tables) ? tables : [tables];
    if (list.length === 0) return;

    let timer = null;
    const fireGrouped = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { cbRef.current?.(); } catch (e) { console.error('[Realtime] handler error:', e); }
      }, burstMs);
    };

    // 1) Avisos de la BD — funcionan con RLS por sesión.
    ensureDbChannel();
    const onDbChange = (table) => { if (list.includes(table)) fireGrouped(); };
    dbListeners.add(onDbChange);

    // 2) postgres_changes — compatibilidad mientras las tablas sigan abiertas;
    //    deja de emitir por sí solo al aplicar el paso 2 de seguridad.
    const channelName = `rt-${list.join('-')}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(channelName);
    list.forEach((t) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, fireGrouped);
    });
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      dbListeners.delete(onDbChange);
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(tables) ? tables.join('|') : tables, burstMs]);
}
