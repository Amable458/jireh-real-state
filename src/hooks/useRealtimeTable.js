import { useEffect, useRef } from 'react';
import { supabase } from '../db/supabaseClient.js';

/**
 * Suscribe a cambios INSERT/UPDATE/DELETE en una o varias tablas.
 * Llama al callback cuando hay cualquier cambio.
 *
 * Los eventos llegan en ráfaga: marcar una renta como pagada dispara un
 * UPDATE en rentals y un INSERT en expenses casi a la vez, y cada uno
 * provocaba una recarga completa de la página. Se agrupan en una sola
 * llamada al final de la ráfaga.
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

    const channelName = `rt-${list.join('-')}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(channelName);

    list.forEach((t) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: t },
        fireGrouped
      );
    });

    channel.subscribe();

    return () => {
      clearTimeout(timer);
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(tables) ? tables.join('|') : tables, burstMs]);
}
