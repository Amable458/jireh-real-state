import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';

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
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Buscar..."
            className="input pl-9"
          />
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} onClick={() => c.sortable !== false && toggleSort(c.key)} className={c.className}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortBy === c.key && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center text-slate-400 py-8">{emptyText}</td></tr>
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
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{sorted.length} registro(s)</span>
        <div className="flex items-center gap-2">
          <button disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="btn-ghost px-2 py-1 text-xs disabled:opacity-40">Anterior</button>
          <span>Página {safePage} de {totalPages}</span>
          <button disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)} className="btn-ghost px-2 py-1 text-xs disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </div>
  );
}
