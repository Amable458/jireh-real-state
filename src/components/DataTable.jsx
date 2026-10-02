import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Inbox, Search } from 'lucide-react';

// La columna de acciones (editar, pagar, eliminar…) queda fija a la derecha:
// en tablas anchas era la primera en quedar oculta y había que desplazarse
// de lado para encontrarla. Cualquier columna puede pedirlo con sticky: true.
const isSticky = (c) => c.sticky ?? c.key === 'actions';

export default function DataTable({ columns, rows, pageSize = 10, searchable = true, emptyText = 'Sin registros' }) {
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  // ¿Hay columnas fuera de la vista? En celulares las barras de
  // desplazamiento son invisibles, así que se avisa con texto y flechas.
  const wrapRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const check = () => setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    });
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, []);
  const nudge = (dir) => wrapRef.current?.scrollBy({ left: dir * Math.max(240, (wrapRef.current.clientWidth || 0) * 0.6), behavior: 'smooth' });

  const filtered = useMemo(() => {
    if (!q) return rows;
    const t = q.toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => {
        const v = c.accessor ? c.accessor(r) : r[c.key];
        return String(v ?? '').toLowerCase().includes(t);
      })
    );
  }, [q, rows, columns]);

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const col = columns.find((c) => c.key === sortBy);
    if (!col) return filtered;
    const get = col.accessor || ((r) => r[col.key]);
    return [...filtered].sort((a, b) => {
      const av = get(a); const bv = get(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortBy, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('asc'); }
  };

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" size={16} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Buscar..."
            aria-label="Buscar en la tabla"
            className="input pl-9"
          />
        </div>
      )}
      {(edges.left || edges.right) && (
        <div className="flex items-center justify-end gap-2 text-xs text-ink-500" aria-hidden="true">
          <span>Hay más columnas — desliza la tabla o usa las flechas</span>
          <button type="button" onClick={() => nudge(-1)} disabled={!edges.left}
            className="btn-secondary p-1.5 disabled:opacity-30" tabIndex={-1} title="Ver columnas de la izquierda">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={() => nudge(1)} disabled={!edges.right}
            className="btn-secondary p-1.5 disabled:opacity-30" tabIndex={-1} title="Ver más columnas">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
      <div ref={wrapRef} className="table-wrap">
        <table className="table tnum">
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false;
                const active = sortBy === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => sortable && toggleSort(c.key)}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`${sortable ? 'is-sortable' : ''} ${isSticky(c) ? 'is-sticky' : ''} ${c.className || ''}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {active
                        ? (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
                        : sortable && <ChevronsUpDown size={12} className="text-ink-300" aria-hidden="true" />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <Inbox size={26} className="text-ink-300" aria-hidden="true" />
                    <p className="text-sm text-ink-500">{emptyText}</p>
                    {q && <p className="text-xs text-ink-400">No hay coincidencias para «{q}»</p>}
                  </div>
                </td>
              </tr>
            ) : slice.map((r, i) => (
              <tr key={r.id ?? i}>
                {columns.map((c) => (
                  <td key={c.key} className={`${isSticky(c) ? 'is-sticky' : ''} ${c.cellClassName || ''}`}>
                    {c.render ? c.render(r) : (c.accessor ? c.accessor(r) : r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-ink-500">
        <span>{sorted.length} registro(s)</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40" aria-label="Página anterior">Anterior</button>
            <span className="px-1 tabular-nums">Página {safePage} de {totalPages}</span>
            <button disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)} className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40" aria-label="Página siguiente">Siguiente</button>
          </div>
        )}
      </div>
    </div>
  );
}
