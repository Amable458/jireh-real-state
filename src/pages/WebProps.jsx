import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Edit2, Trash2, Eye, EyeOff, ExternalLink, Star, ChevronLeft, ChevronRight,
  X, ImagePlus, Loader2, Globe, Download, ImageOff
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { useAuth } from '../store/auth.js';
import { db, logActivity } from '../db/database.js';
import { useRealtimeTable } from '../hooks/useRealtimeTable.js';
import { fmtCur } from '../utils/currency.js';
import { toast } from '../store/toast.js';
import {
  TIPOS, OPERACIONES, ESTADOS, CARACTERISTICAS_BASE, LANDING_URL,
  landingLink, portadaDe, uploadPhoto, deletePhotos, importFromLanding
} from '../utils/webProps.js';

const empty = () => ({
  titulo: '', operaciones: ['venta'], tipo: 'apartamento', estado: 'publicada', destacada: false,
  ciudad: 'Santiago', sector: '', moneda: 'USD', precio: '', consultar: false, porM2: false,
  habitaciones: '', banos: '', parqueos: '', m2: '',
  caracteristicas: [], descripcion: '', fotos: []
});

const tipoLabel = (v) => TIPOS.find((t) => t.value === v)?.label || v;
const precioTexto = (p) => {
  if (p.precio == null || p.precio === '') return 'Consultar';
  const base = p.moneda === 'USD' || p.moneda === 'DOP' ? fmtCur(p.precio, p.moneda) : Number(p.precio).toLocaleString('es-DO');
  return p.porM2 ? `${base} /m²` : base;
};
const num = (v) => (v === '' || v == null ? null : Number(v));

export default function WebProps() {
  const { user, hasRole } = useAuth();
  const canDelete = hasRole('SuperAdmin', 'Admin');
  const isSuper = hasRole('SuperAdmin');

  const [rows, setRows] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [original, setOriginal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [subiendo, setSubiendo] = useState(0);
  const [nuevaCarac, setNuevaCarac] = useState('');
  const [confirm, setConfirm] = useState({ open: false, row: null });
  const [importando, setImportando] = useState(null);
  const fileRef = useRef(null);
  // Fotos subidas en esta edición: si se cancela, se borran del almacén
  const subidas = useRef([]);

  const refresh = async () => {
    try {
      const r = await db.webProps.toArray();
      r.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      setRows(r);
    } catch (e) {
      setRows([]);
      if (/webProps|schema cache|does not exist/i.test(e.message || '')) {
        setErr('Falta la migración: ejecute supabase/migration_web_propiedades.sql en Supabase.');
      }
    }
  };
  useEffect(() => { refresh(); }, []);
  useRealtimeTable('webProps', () => refresh());

  const counts = useMemo(() => {
    const c = { todas: 0, publicada: 0, oculta: 0, cerrada: 0 };
    for (const r of rows || []) { c.todas += 1; c[r.estado] = (c[r.estado] || 0) + 1; }
    return c;
  }, [rows]);
  const visibles = useMemo(
    () => (rows || []).filter((r) => filtro === 'todas' || r.estado === filtro),
    [rows, filtro]
  );

  // Vocabulario existente para sugerir (ciudades, sectores, características)
  const vocab = useMemo(() => {
    const freq = (arr) => {
      const m = new Map();
      arr.filter(Boolean).forEach((v) => m.set(v, (m.get(v) || 0) + 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    };
    const all = rows || [];
    return {
      ciudades: freq(all.map((r) => r.ciudad)),
      sectores: freq(all.map((r) => r.sector)),
      caracteristicas: [...new Set([...freq(all.flatMap((r) => r.caracteristicas || [])), ...CARACTERISTICAS_BASE])]
    };
  }, [rows]);

  // ---------- Abrir / cerrar ----------
  const abrirNueva = () => {
    setEditId(null); setOriginal(null); setErr(''); setForm(empty());
    subidas.current = []; setOpen(true);
  };
  const abrirEditar = (r) => {
    setEditId(r.id); setOriginal(r); setErr(''); subidas.current = [];
    setForm({
      ...empty(), ...r,
      precio: r.precio ?? '', consultar: r.precio == null,
      habitaciones: r.habitaciones ?? '', banos: r.banos ?? '', parqueos: r.parqueos ?? '', m2: r.m2 ?? '',
      caracteristicas: r.caracteristicas || [], fotos: Array.isArray(r.fotos) ? r.fotos : []
    });
    setOpen(true);
  };
  const cerrar = () => {
    if (saving || subiendo) return;
    // Las fotos subidas y no guardadas quedarían huérfanas en el almacén
    if (subidas.current.length) deletePhotos(subidas.current);
    subidas.current = [];
    setOpen(false);
  };

  // ---------- Fotos ----------
  const agregarFotos = async (files) => {
    const lista = [...(files || [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!lista.length) return;
    setSubiendo((n) => n + lista.length);
    // De tres en tres: rápido sin saturar la conexión. Se añaden al final y
    // en el orden en que se eligieron, no en el que termina cada subida.
    const resultados = new Array(lista.length);
    let siguiente = 0;
    const trabajar = async () => {
      while (siguiente < lista.length) {
        const i = siguiente++;
        try {
          resultados[i] = await uploadPhoto(lista[i]);
          subidas.current.push(resultados[i]);
        } catch (e) {
          toast.error(e.message);
        } finally {
          setSubiendo((n) => n - 1);
        }
      }
    };
    await Promise.all([trabajar(), trabajar(), trabajar()]);
    const ok = resultados.filter(Boolean);
    if (ok.length) setForm((f) => ({ ...f, fotos: [...f.fotos, ...ok] }));
  };
  const moverFoto = (i, dir) => setForm((f) => {
    const j = i + dir;
    if (j < 0 || j >= f.fotos.length) return f;
    const fotos = [...f.fotos];
    [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
    return { ...f, fotos };
  });
  const hacerPortada = (i) => setForm((f) => {
    const fotos = [...f.fotos];
    const [x] = fotos.splice(i, 1);
    return { ...f, fotos: [x, ...fotos] };
  });
  const quitarFoto = (i) => setForm((f) => ({ ...f, fotos: f.fotos.filter((_, k) => k !== i) }));

  // ---------- Características ----------
  const toggleCarac = (c) => setForm((f) => ({
    ...f,
    caracteristicas: f.caracteristicas.includes(c) ? f.caracteristicas.filter((x) => x !== c) : [...f.caracteristicas, c]
  }));
  const agregarCarac = () => {
    const c = nuevaCarac.trim();
    if (!c) return;
    // Si ya existe con otras mayúsculas o tildes, usar la existente
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const existente = vocab.caracteristicas.find((x) => norm(x) === norm(c)) || c;
    if (!form.caracteristicas.includes(existente)) setForm((f) => ({ ...f, caracteristicas: [...f.caracteristicas, existente] }));
    setNuevaCarac('');
  };

  // ---------- Guardar ----------
  const guardar = async (otra = false) => {
    setErr('');
    if (!form.titulo.trim()) { setErr('Escribe el título de la propiedad.'); return; }
    if (!form.operaciones.length) { setErr('Marca al menos una operación (venta, renta o en planos).'); return; }
    if (!form.consultar && (form.precio === '' || Number(form.precio) <= 0)) {
      setErr('Escribe el precio o marca «Precio a consultar».'); return;
    }
    if (form.estado === 'publicada' && !form.fotos.length) {
      setErr('Para publicar, sube al menos una foto (o guárdala como «Oculta» mientras tanto).'); return;
    }
    const payload = {
      titulo: form.titulo.trim(),
      operaciones: form.operaciones,
      tipo: form.tipo,
      estado: form.estado,
      destacada: !!form.destacada,
      ciudad: (form.ciudad || '').trim(),
      sector: (form.sector || '').trim(),
      moneda: form.moneda,
      precio: form.consultar ? null : Number(form.precio),
      porM2: !!form.porM2,
      habitaciones: num(form.habitaciones),
      banos: num(form.banos),
      parqueos: num(form.parqueos),
      m2: num(form.m2),
      caracteristicas: form.caracteristicas,
      descripcion: (form.descripcion || '').trim(),
      fotos: form.fotos,
      updatedBy: user.username
    };
    setSaving(true);
    try {
      if (editId) {
        await db.webProps.update(editId, payload);
        await logActivity(user.sub, user.username, 'webProp.update', `id=${editId}`);
      } else {
        const id = await db.webProps.add({ ...payload, createdBy: user.username });
        await logActivity(user.sub, user.username, 'webProp.create', `id=${id}`);
      }
      // Fotos que no quedaron (quitadas al editar, o subidas y quitadas antes
      // de guardar): borrarlas del almacén para no dejar huérfanas
      const quedan = new Set(form.fotos.map((f) => f.url));
      await deletePhotos([...(original?.fotos || []), ...subidas.current].filter((f) => !quedan.has(f.url)));
      subidas.current = [];
      toast.success(form.estado === 'publicada' ? 'Guardada. Aparecerá en la web en menos de un minuto.' : 'Guardada.');
      await refresh();
      if (otra) {
        setEditId(null); setOriginal(null);
        setForm({ ...empty(), ciudad: form.ciudad, moneda: form.moneda, operaciones: form.operaciones, tipo: form.tipo });
      } else {
        setOpen(false);
      }
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (r, estado) => {
    if (estado === 'publicada' && !(r.fotos || []).length) {
      toast.error('No se puede publicar sin fotos. Edítala y sube al menos una.');
      return;
    }
    try {
      await db.webProps.update(r.id, { estado, updatedBy: user.username });
      await logActivity(user.sub, user.username, 'webProp.estado', `id=${r.id} ${estado}`);
      await refresh();
    } catch (e) {
      toast.error(e?.message || 'No se pudo cambiar el estado');
    }
  };

  const eliminar = async (r) => {
    try {
      await db.webProps.delete(r.id);
      await logActivity(user.sub, user.username, 'webProp.delete', `id=${r.id}`);
      await deletePhotos(r.fotos);
      await refresh();
    } catch (e) {
      toast.error(e?.message || 'No se pudo eliminar');
    }
  };

  const importar = async () => {
    setImportando({ hechas: 0, total: 0 });
    try {
      const n = await importFromLanding(user.username, (hechas, total) => setImportando({ hechas, total }));
      await logActivity(user.sub, user.username, 'webProp.import', `n=${n}`);
      toast.success(`${n} propiedades importadas. Ya puedes editarlas desde aquí.`);
      await refresh();
    } catch (e) {
      toast.error(e?.message || 'No se pudo importar');
    } finally {
      setImportando(null);
    }
  };

  // ---------- Tabla ----------
  const columns = [
    { key: 'portada', label: '', sortable: false, render: (r) => {
      const src = portadaDe(r);
      return src
        ? <img src={src} alt="" loading="lazy" className="w-16 h-12 rounded-lg object-cover bg-ink-100" />
        : <span className="w-16 h-12 rounded-lg bg-ink-50 ring-1 ring-inset ring-ink-200 flex items-center justify-center text-ink-300"><ImageOff size={16} /></span>;
    }},
    { key: 'titulo', label: 'Propiedad',
      accessor: (r) => `${r.titulo} ${r.ciudad} ${r.sector} ${r.id}`,
      render: (r) => (
        <div className="min-w-[200px] leading-snug">
          <div className="font-medium text-ink-900 flex items-center gap-1.5">
            {r.destacada && <Star size={13} className="text-brand-500 fill-brand-500 shrink-0" aria-label="Destacada" />}
            <span>{r.titulo}</span>
          </div>
          <div className="text-xs text-ink-500">Ref. {r.id} · {tipoLabel(r.tipo)} · {(r.fotos || []).length} foto(s)</div>
        </div>
      )
    },
    { key: 'ciudad', label: 'Ubicación', render: (r) => (
      <div className="leading-snug">
        <div>{r.ciudad || <span className="text-ink-300">—</span>}</div>
        {r.sector && <div className="text-xs text-ink-500">{r.sector}</div>}
      </div>
    )},
    { key: 'operaciones', label: 'Operación', accessor: (r) => (r.operaciones || []).join(' '), render: (r) => (
      <div className="flex flex-wrap gap-1">
        {(r.operaciones || []).map((o) => <span key={o} className="badge-info">{OPERACIONES.find((x) => x.value === o)?.label || o}</span>)}
      </div>
    )},
    { key: 'precio', label: 'Precio', accessor: (r) => Number(r.precio) || 0,
      render: (r) => <span className={`whitespace-nowrap ${r.precio == null ? 'text-ink-400' : 'font-medium'}`}>{precioTexto(r)}</span> },
    { key: 'estado', label: 'Estado', render: (r) => <span className={ESTADOS[r.estado]?.badge || 'badge-slate'}>{ESTADOS[r.estado]?.label || r.estado}</span> },
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        {r.estado === 'publicada' && (
          <a href={landingLink(r.id)} target="_blank" rel="noopener noreferrer" title="Ver en la web" className="btn-ghost p-1.5"><ExternalLink size={14} /></a>
        )}
        {r.estado === 'publicada'
          ? <button onClick={() => cambiarEstado(r, 'oculta')} title="Ocultar de la web" className="btn-ghost p-1.5"><EyeOff size={14} /></button>
          : <button onClick={() => cambiarEstado(r, 'publicada')} title="Publicar en la web" className="btn-ghost p-1.5 text-emerald-600"><Eye size={14} /></button>}
        <button onClick={() => abrirEditar(r)} title="Editar" className="btn-ghost p-1.5"><Edit2 size={14} /></button>
        {canDelete && (
          <button onClick={() => setConfirm({ open: true, row: r })} title="Eliminar" className="btn-ghost p-1.5 text-red-600"><Trash2 size={14} /></button>
        )}
      </div>
    )}
  ];

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div>
      <PageHeader
        title="Propiedades en la web"
        subtitle={<>Lo que publiques aquí aparece en <a className="underline decoration-ink-300 hover:text-ink-800" href={LANDING_URL} target="_blank" rel="noopener noreferrer">jireh-realestate.vercel.app</a></>}
        actions={<>
          <HelpButton content={HELP.webProps} />
          <button className="btn-primary" onClick={abrirNueva}><Plus size={16} /> Nueva propiedad</button>
        </>}
      />

      {err && !open && (
        <div className="mb-4 bg-red-50 ring-1 ring-inset ring-red-600/20 text-red-700 text-sm rounded-xl px-4 py-3" role="alert">{err}</div>
      )}

      {rows && rows.length === 0 && isSuper && !err && (
        <div className="card card-body mb-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="p-2.5 rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/20 self-start"><Download size={20} /></span>
          <div className="flex-1">
            <p className="font-semibold text-ink-900">Importar las propiedades que ya están en la web</p>
            <p className="text-sm text-ink-500 mt-0.5">Trae las propiedades actuales de la landing, con sus fotos, para que puedas editarlas, ocultarlas o eliminarlas desde aquí. Se hace una sola vez.</p>
          </div>
          <button className="btn-primary" onClick={importar} disabled={!!importando}>
            {importando ? <><Loader2 size={16} className="animate-spin" /> {importando.total ? `${importando.hechas} de ${importando.total}` : 'Leyendo…'}</> : 'Importar ahora'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtrar por estado">
        {[['todas', 'Todas'], ['publicada', 'Publicadas'], ['oculta', 'Ocultas'], ['cerrada', 'Vendidas / alquiladas']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            aria-pressed={filtro === k}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filtro === k ? 'bg-ink-900 text-white' : 'bg-white ring-1 ring-inset ring-ink-200 text-ink-600 hover:bg-ink-50'}`}
          >
            {label} <span className={filtro === k ? 'text-ink-300' : 'text-ink-400'}>{counts[k] || 0}</span>
          </button>
        ))}
      </div>

      <div className="card card-body">
        {rows === null
          ? <div className="py-12 text-center text-sm text-ink-400">Cargando…</div>
          : <DataTable columns={columns} rows={visibles} pageSize={15} emptyText="No hay propiedades en este filtro." />}
      </div>

      {/* ---------- Formulario ---------- */}
      <Modal
        open={open}
        onClose={cerrar}
        size="xl"
        title={editId ? `Editar propiedad · Ref. ${editId}` : 'Nueva propiedad'}
        footer={<>
          <button className="btn-secondary" onClick={cerrar} disabled={saving || !!subiendo}>Cancelar</button>
          {!editId && (
            <button className="btn-secondary" onClick={() => guardar(true)} disabled={saving || !!subiendo}>Guardar y agregar otra</button>
          )}
          <button className="btn-primary" onClick={() => guardar(false)} disabled={saving || !!subiendo}>
            {saving ? 'Guardando…' : subiendo ? 'Subiendo fotos…' : 'Guardar'}
          </button>
        </>}
      >
        <div className="space-y-6">
          {err && <div className="bg-red-50 ring-1 ring-inset ring-red-600/20 text-red-700 text-sm rounded-lg px-3 py-2" role="alert">{err}</div>}

          {/* Fotos primero: es lo que más vende */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">Fotos <span className="normal-case tracking-normal font-normal">· la primera es la portada</span></h4>
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => fileRef.current?.click()} disabled={!!subiendo}>
                <ImagePlus size={14} /> Agregar fotos
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden
              onChange={(e) => { agregarFotos(e.target.files); e.target.value = ''; }} />
            <div
              className="rounded-xl border-2 border-dashed border-ink-200 p-3 min-h-[120px]"
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); agregarFotos(e.dataTransfer.files); }}
            >
              {form.fotos.length === 0 && !subiendo ? (
                <button type="button" onClick={() => fileRef.current?.click()} className="w-full py-6 flex flex-col items-center gap-1.5 text-ink-500 hover:text-ink-800">
                  <ImagePlus size={26} className="text-ink-300" />
                  <span className="text-sm">Arrastra las fotos aquí o haz clic para elegirlas</span>
                  <span className="text-xs text-ink-400">Se comprimen solas antes de subir</span>
                </button>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {form.fotos.map((f, i) => (
                    <div key={f.url} className={`relative group rounded-lg overflow-hidden ring-1 ${i === 0 ? 'ring-2 ring-brand-500' : 'ring-ink-200'}`}>
                      <img src={f.card || f.url} alt="" className="w-full aspect-[4/3] object-cover bg-ink-100" loading="lazy" />
                      {i === 0 && <span className="absolute top-1.5 left-1.5 badge bg-brand-500 text-ink-900 ring-0">Portada</span>}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1.5 bg-gradient-to-t from-ink-950/70 to-transparent">
                        <div className="flex gap-1">
                          <button type="button" title="Mover a la izquierda" onClick={() => moverFoto(i, -1)} disabled={i === 0}
                            className="p-1 rounded-md bg-white/90 text-ink-800 disabled:opacity-30"><ChevronLeft size={14} /></button>
                          <button type="button" title="Mover a la derecha" onClick={() => moverFoto(i, 1)} disabled={i === form.fotos.length - 1}
                            className="p-1 rounded-md bg-white/90 text-ink-800 disabled:opacity-30"><ChevronRight size={14} /></button>
                        </div>
                        <div className="flex gap-1">
                          {i !== 0 && (
                            <button type="button" title="Usar como portada" onClick={() => hacerPortada(i)}
                              className="p-1 rounded-md bg-white/90 text-brand-600"><Star size={14} /></button>
                          )}
                          <button type="button" title="Quitar foto" onClick={() => quitarFoto(i)}
                            className="p-1 rounded-md bg-white/90 text-red-600"><X size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {Array.from({ length: subiendo }, (_, k) => (
                    <div key={`s${k}`} className="rounded-lg aspect-[4/3] bg-ink-50 ring-1 ring-ink-200 flex flex-col items-center justify-center gap-1 text-ink-400 text-xs">
                      <Loader2 size={18} className="animate-spin" /> Subiendo…
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Datos principales */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">Datos principales</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="label">Título</label>
                <input className="input" value={form.titulo} onChange={(e) => set({ titulo: e.target.value })}
                  placeholder="Ej. Apartamento en venta, Gurabo, Santiago" />
              </div>
              <div>
                <label className="label">Operación</label>
                <div className="flex flex-wrap gap-2">
                  {OPERACIONES.map((o) => {
                    const on = form.operaciones.includes(o.value);
                    return (
                      <button key={o.value} type="button" aria-pressed={on}
                        onClick={() => set({ operaciones: on ? form.operaciones.filter((x) => x !== o.value) : [...form.operaciones, o.value] })}
                        className={`px-3 py-2 rounded-lg text-sm transition-colors ${on ? 'bg-ink-900 text-white' : 'bg-white ring-1 ring-inset ring-ink-200 text-ink-600 hover:bg-ink-50'}`}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={form.tipo} onChange={(e) => set({ tipo: e.target.value })}>
                  {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Estado en la web</label>
                <select className="input" value={form.estado} onChange={(e) => set({ estado: e.target.value })}>
                  <option value="publicada">Publicada (se ve en la web)</option>
                  <option value="oculta">Oculta (borrador, no se ve)</option>
                  <option value="cerrada">Vendida / alquilada (sale de la web)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700 md:mt-7">
                <input type="checkbox" checked={!!form.destacada} onChange={(e) => set({ destacada: e.target.checked })} className="rounded accent-brand-500" />
                Destacada (aparece primero)
              </label>
            </div>
          </section>

          {/* Ubicación */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">Ubicación</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Ciudad</label>
                <input className="input" list="wp-ciudades" value={form.ciudad} onChange={(e) => set({ ciudad: e.target.value })} />
                <datalist id="wp-ciudades">{vocab.ciudades.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="label">Sector</label>
                <input className="input" list="wp-sectores" value={form.sector} onChange={(e) => set({ sector: e.target.value })} placeholder="Ej. Gurabo" />
                <datalist id="wp-sectores">{vocab.sectores.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
          </section>

          {/* Precio */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">Precio</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Moneda</label>
                <select className="input" value={form.moneda} onChange={(e) => set({ moneda: e.target.value })} disabled={form.consultar}>
                  <option value="USD">US$ Dólares</option>
                  <option value="DOP">RD$ Pesos</option>
                </select>
              </div>
              <div>
                <label className="label">Precio</label>
                <input type="number" min="0" step="1" className="input" value={form.precio}
                  onChange={(e) => set({ precio: e.target.value })} disabled={form.consultar} placeholder={form.consultar ? 'A consultar' : ''} />
              </div>
              <div className="flex flex-col justify-end gap-2 pb-1">
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" checked={form.consultar} onChange={(e) => set({ consultar: e.target.checked })} className="rounded accent-brand-500" />
                  Precio a consultar
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" checked={!!form.porM2} onChange={(e) => set({ porM2: e.target.checked })} disabled={form.consultar} className="rounded accent-brand-500" />
                  Precio por m²
                </label>
              </div>
            </div>
          </section>

          {/* Características */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">Características</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div><label className="label">Habitaciones</label><input type="number" min="0" className="input" value={form.habitaciones} onChange={(e) => set({ habitaciones: e.target.value })} /></div>
              <div><label className="label">Baños</label><input type="number" min="0" step="0.5" className="input" value={form.banos} onChange={(e) => set({ banos: e.target.value })} /></div>
              <div><label className="label">Parqueos</label><input type="number" min="0" className="input" value={form.parqueos} onChange={(e) => set({ parqueos: e.target.value })} /></div>
              <div><label className="label">Metros (m²)</label><input type="number" min="0" className="input" value={form.m2} onChange={(e) => set({ m2: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...form.caracteristicas, ...vocab.caracteristicas])].slice(0, 40).map((c) => {
                const on = form.caracteristicas.includes(c);
                return (
                  <button key={c} type="button" aria-pressed={on} onClick={() => toggleCarac(c)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${on ? 'bg-brand-500 text-ink-900 font-medium' : 'bg-white ring-1 ring-inset ring-ink-200 text-ink-600 hover:bg-ink-50'}`}>
                    {c}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2 max-w-sm">
              <input className="input py-1.5" placeholder="Otra característica…" value={nuevaCarac}
                onChange={(e) => setNuevaCarac(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCarac(); } }} />
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={agregarCarac}>Añadir</button>
            </div>
          </section>

          {/* Descripción */}
          <section>
            <label className="label">Descripción</label>
            <textarea className="input" rows={5} value={form.descripcion} onChange={(e) => set({ descripcion: e.target.value })}
              placeholder="Niveles, distribución, terminaciones, áreas comunes, cercanías…" />
          </section>

          {editId && form.estado === 'publicada' && (
            <a href={landingLink(editId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900">
              <Globe size={14} /> Ver cómo se ve en la web
            </a>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={confirm.open}
        onClose={() => setConfirm({ open: false, row: null })}
        onConfirm={() => eliminar(confirm.row)}
        title="Eliminar propiedad"
        message={confirm.row
          ? `¿Eliminar «${confirm.row.titulo}» (Ref. ${confirm.row.id}) y sus fotos? Esto no se puede deshacer. Si solo quieres sacarla de la web, usa «Ocultar» o márcala como vendida.`
          : ''}
        danger
      />
    </div>
  );
}
