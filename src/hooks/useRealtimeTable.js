import { useEffect, useRef } from 'react';
import { supabase } from '../db/supabaseClient.js';

/**
 * Suscribe a cambios INSERT/UPDATE/DELETE en una o varias tablas.
 * Llama al callback cuando hay cualquier cambio.
 *
 * @param {string | string[]} tables - nombre(s) de tabla a observar
 * @param {Function} callback - se invoca con el payload de cambio
 */
export function useRealtimeTable(tables, callback) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!supabase) return;
    const list = Array.isArray(tables) ? tables : [tables];
    if (list.length === 0) return;

    const channelName = `rt-${list.join('-')}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(channelName);

    list.forEach((t) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: t },
        (payload) => {
          try { cbRef.current?.(payload); } catch (e) { console.error('[Realtime] handler error:', e); }
        }
      );
    });

    channel.subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(tables) ? tables.join('|') : tables]);
}
