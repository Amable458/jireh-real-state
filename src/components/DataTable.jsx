import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft, ChevronsRight,
  ChevronsUpDown, Inbox, Search
} from 'lucide-react';

// La columna de acciones (editar, pagar, eliminar…) queda fija a la derecha:
// en tablas anchas era la primera en quedar oculta y había que desplazarse
// de lado para encontrarla. Cualquier columna puede pedirlo con sticky: true.
const isSticky = (c) => c.sticky ?? c.key === 'actions';

const SIZES = [10, 15, 25, 50, 100];

// Números de página compactos: 1 … 6 7 8 … 19
function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, total, cur - 1, cur, cur + 1]);
  if (cur <= 4) [2, 3, 4, 5].forEach((n) => keep.add(n));
  if (cur >= total - 3) [total - 4, total - 3, total - 2, total - 1].forEach((n) => keep.add(n));
  const nums = [...keep].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push(`gap-${n}`);
    out.push(n);
  });
  return out;
}

// El tamaño de página elegido se recuerda por pantalla en este navegador
const sizeKey = () => `jireh-dt-size:${typeof location !== 'undefined' ? location.pathname : ''}`;
const readSize = (fallback) => {
  try {
    const v = Number(localStorage.getItem(sizeKey()));
    return SIZES.includes(v) ? v : fallback;
  } catch { return fallback; }
};

/**
 * Tabla con búsqueda, orden, paginación y selección múltiple opcional.
 *
 * Selección (opcional): pasar `selected` (Set de ids) y `onSelectedChange`.
 * La casilla del encabezado marca la página visible; luego se ofrece
 * seleccionar todas las que coinciden con el filtro.
 */
export default function DataTable({
  columns, rows, pageSize = 10, searchable = true, emptyText = 'Sin registros',
  selected, onSelectedChange, rowId = (r) => r.id
}) {
  const selectable = !!onSelectedChange;
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(() => readSize(pageSize));
  const [goto, setGoto] = useState('');

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

  const totalPages = Math.max(1, Math.ceil(sorted.length / size));
  const safePage = Math.min(page, totalPages);
  const from = sorted.length ? (safePage - 1) * size : 0;
  const slice = sorted.slice(from, from + size);

  const go = (n) => {
    const p = Math.min(totalPages, Math.max(1, Math.round(Number(n)) || 1));
    setPage(p);
    setGoto('');
  };
  const changeSize = (n) => {
    // Mantener a la vista el primer registro que se estaba viendo
    const first = from;
    setSize(n);
    setPage(Math.floor(first / n) + 1);
    try { localStorage.setItem(sizeKey(), String(n)); } catch { /* sin almacenamiento */ }
  };

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('asc'); }
  };

  // ---------- Selección ----------
  const sel = selected || new Set();
  const pageIds = slice.map(rowId);
  const allIds = sorted.map(rowId);
  const pageAll = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const pageSome = pageIds.some((id) => sel.has(id));
  const everyFiltered = allIds.length > 0 && allIds.every((id) => sel.has(id));
  const headRef = useRef(null);
  useEffect(() => { if (headRef.current) headRef.current.indeterminate = pageSome && !pageAll; }, [pageSome, pageAll]);

  const setSel = (next) => onSelectedChange?.(next);
  const togglePage = () => {
    const next = new Set(sel);
    if (pageAll) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSel(next);
  };
  const toggleRow = (id) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSel(next);
  };

  const colCount = columns.length + (selectable ? 1 : 0);
  const btnPage = 'min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

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

      {selectable && pageAll && sorted.length > slice.length && (
        <div className="text-xs text-ink-600 bg-brand-50 ring-1 ring-inset ring-brand-600/20 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {everyFiltered ? (
            <>
              <span>Las <b>{sorted.length}</b> que coinciden están seleccionadas.</span>
              <button type="button" className="underline font-medium" onClick={() => setSel(new Set())}>Quitar la selección</button>
            </>
          ) : (
            <>
              <span>Se seleccionaron las {slice.length} de esta página.</span>
              <button type="button" className="underline font-medium" onClick={() => setSel(new Set([...sel, ...allIds]))}>
                Seleccionar las {sorted.length} que coinciden
              </button>
            </>
          )}
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
              {selectable && (
                <th className="w-10 !pr-0">
                  <input
                    ref={headRef}
                    type="checkbox"
                    className="w-4 h-4 rounded accent-brand-500 cursor-pointer align-middle"
                    checked={pageAll}
                    onChange={togglePage}
                    disabled={!pageIds.length}
                    aria-label="Seleccionar las de esta página"
                  />
                </th>
              )}
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
                <td colSpan={colCount} className="py-12">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <Inbox size={26} className="text-ink-300" aria-hidden="true" />
                    <p className="text-sm text-ink-500">{emptyText}</p>
                    {q && <p className="text-xs text-ink-400">No hay coincidencias para «{q}»</p>}
                  </div>
                </td>
              </tr>
            ) : slice.map((r, i) => {
              const id = rowId(r);
              const on = selectable && sel.has(id);
              return (
                <tr key={id ?? i} className={on ? 'is-selected' : ''}>
                  {selectable && (
                    <td className="w-10 !pr-0">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded accent-brand-500 cursor-pointer align-middle"
                        checked={on}
                        onChange={() => toggleRow(id)}
                        aria-label="Seleccionar fila"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={`${isSticky(c) ? 'is-sticky' : ''} ${c.cellClassName || ''}`}>
                      {c.render ? c.render(r) : (c.accessor ? c.accessor(r) : r[c.key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- Paginación ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-ink-500">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="tabular-nums">
            {sorted.length
              ? <>Mostrando <b className="text-ink-700">{from + 1}–{from + slice.length}</b> de <b className="text-ink-700">{sorted.length}</b></>
              : '0 registros'}
          </span>
          <label className="inline-flex items-center gap-1.5">
            <span>Ver</span>
            <select
              value={size}
              onChange={(e) => changeSize(Number(e.target.value))}
              className="input !w-auto !min-h-0 py-1 pl-2 pr-7 text-xs"
              aria-label="Registros por página"
            >
              {[...new Set([...SIZES, pageSize])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>por página</span>
          </label>
        </div>

        {totalPages > 1 && (
          <nav className="flex flex-wrap items-center gap-1" aria-label="Paginación">
            <button type="button" className={`${btnPage} hover:bg-ink-100`} onClick={() => go(1)} disabled={safePage === 1} title="Primera página" aria-label="Primera página">
              <ChevronsLeft size={15} />
            </button>
            <button type="button" className={`${btnPage} hover:bg-ink-100`} onClick={() => go(safePage - 1)} disabled={safePage === 1} title="Página anterior" aria-label="Página anterior">
              <ChevronLeft size={15} />
            </button>
            {pageList(safePage, totalPages).map((n) => (typeof n === 'string'
              ? <span key={n} className="px-1 text-ink-300" aria-hidden="true">…</span>
              : (
                <button
                  key={n}
                  type="button"
                  onClick={() => go(n)}
                  aria-current={n === safePage ? 'page' : undefined}
                  className={`${btnPage} tabular-nums ${n === safePage ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'}`}
                >
                  {n}
                </button>
              )))}
            <button type="button" className={`${btnPage} hover:bg-ink-100`} onClick={() => go(safePage + 1)} disabled={safePage === totalPages} title="Página siguiente" aria-label="Página siguiente">
              <ChevronRight size={15} />
            </button>
            <button type="button" className={`${btnPage} hover:bg-ink-100`} onClick={() => go(totalPages)} disabled={safePage === totalPages} title="Última página" aria-label="Última página">
              <ChevronsRight size={15} />
            </button>
            {/* noValidate: una página fuera de rango (ej. 99) lleva a la última en
                vez de quedar bloqueada por la validación del navegador */}
            <form
              noValidate
              className="inline-flex items-center gap-1.5 ml-2"
              onSubmit={(e) => { e.preventDefault(); if (goto !== '') go(goto); }}
            >
              <span>Ir a</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={goto}
                placeholder={String(safePage)}
                onChange={(e) => setGoto(e.target.value)}
                className="input !w-16 !min-h-0 py-1 px-2 text-xs text-center"
                aria-label={`Ir a la página (1 a ${totalPages})`}
              />
              <button type="submit" className="btn-secondary px-2.5 py-1 text-xs" disabled={goto === ''}>Ir</button>
            </form>
          </nav>
        )}
      </div>
    </div>
  );
}
