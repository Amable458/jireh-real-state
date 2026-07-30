import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Inbox, Search } from 'lucide-react';

export default function DataTable({ columns, rows, pageSize = 10, searchable = true, emptyText = 'Sin registros' }) {
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

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
      <div className="table-wrap">
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
                    className={`${sortable ? 'is-sortable' : ''} ${c.className || ''}`}
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
                  <td key={c.key} className={c.cellClassName}>
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
