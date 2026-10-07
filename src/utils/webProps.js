import { supabase } from '../db/supabaseClient.js';
import { getSessionToken } from '../db/sessionToken.js';

// ============================================================
// «Propiedades en la web»: utilidades del panel que alimenta la landing
// (https://jireh-realestate.vercel.app). La landing lee lo publicado con la
// función web_catalogo() de la base; aquí se crea y edita.
// ============================================================

export const LANDING_URL = 'https://jireh-realestate.vercel.app';
export const landingLink = (id) => `${LANDING_URL}/#p-${id}`;

export const TIPOS = [
  { value: 'apartamento', label: 'Apartamento' },
  { value: 'casa', label: 'Casa' },
  { value: 'villa', label: 'Villa' },
  { value: 'penthouse', label: 'Penthouse' },
  { value: 'solar', label: 'Solar' },
  { value: 'local', label: 'Local comercial' },
  { value: 'otro', label: 'Otro' }
];
export const OPERACIONES = [
  { value: 'venta', label: 'Venta' },
  { value: 'renta', label: 'Renta' },
  { value: 'planos', label: 'En planos' }
];
export const ESTADOS = {
  publicada: { label: 'Publicada', badge: 'badge-success' },
  oculta: { label: 'Oculta', badge: 'badge-slate' },
  cerrada: { label: 'Vendida / alquilada', badge: 'badge-warning' }
};
// Sugerencias iniciales; el panel añade las que ya existan en el inventario
export const CARACTERISTICAS_BASE = [
  'Área de lavado', 'Cocina', 'Closet', 'Cisterna', 'Calentador de agua', 'Balcón',
  'Cámaras de vigilancia', 'Parqueo', 'Ascensor', 'Área infantil', 'Seguridad 24/7',
  'Cocina equipada', 'Aire acondicionado', 'Piscina', 'Gimnasio', 'Terraza', 'Amueblado'
];

export const portadaDe = (p) => {
  const f = Array.isArray(p?.fotos) ? p.fotos[0] : null;
  return f ? (f.card || f.url) : null;
};

// ---------- Fotos ----------
// Mismas medidas que las fotos actuales de la landing: galería grande y una
// tarjeta liviana para el listado. Se comprime aquí, antes de subir.
const FULL = { side: 1600, q: 0.8 };
const CARD = { side: 640, q: 0.72 };

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      return img;
    } catch {
      const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
      throw new Error(heic
        ? `«${file.name}» es HEIC (formato del iPhone) y el navegador no puede leerlo. En el iPhone: Ajustes → Cámara → Formatos → «Más compatible», o envía la foto como JPG.`
        : `No se pudo leer «${file.name}». ¿Es una imagen?`);
    } finally {
      URL.revokeObjectURL(src);
    }
  }
}

async function encode(source, { side, q }) {
  const w0 = source.width, h0 = source.height;
  const k = Math.min(1, side / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * k));
  canvas.height = Math.max(1, Math.round(h0 * k));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', q));
  // Algunos navegadores no codifican WebP y devuelven PNG: mejor JPG
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
  if (!blob) throw new Error('No se pudo comprimir la imagen.');
  return blob;
}

async function send(blob, kind) {
  const res = await fetch(`/api/fotos?k=${kind}`, {
    method: 'POST',
    headers: { 'content-type': blob.type, 'x-jireh-session': getSessionToken() || '' },
    body: blob
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.url) throw new Error(out.error || `Error ${res.status} al subir la foto`);
  return out.url;
}

// Comprime y sube una foto. Devuelve { url, card }.
export async function uploadPhoto(file) {
  const img = await decode(file);
  const [full, card] = await Promise.all([encode(img, FULL), encode(img, CARD)]);
  if (typeof img.close === 'function') img.close();
  const [url, cardUrl] = await Promise.all([send(full, 'foto'), send(card, 'card')]);
  return { url, card: cardUrl };
}

// Borra del almacén las fotos subidas por el panel. Las importadas (que
// viven en la landing) se ignoran solas en el servidor.
export async function deletePhotos(fotos) {
  const urls = (fotos || []).flatMap((f) => [f?.url, f?.card]).filter(Boolean);
  if (!urls.length) return;
  try {
    await fetch('/api/fotos', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-jireh-session': getSessionToken() || '' },
      body: JSON.stringify({ urls })
    });
  } catch { /* una foto huérfana no debe impedir guardar */ }
}

// ---------- Importación única desde la landing actual ----------
const abs = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : `${LANDING_URL}/${u.replace(/^\//, '')}`);

export async function importFromLanding(username, onProgress) {
  const res = await fetch(`${LANDING_URL}/data/propiedades.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo leer el inventario de la web (${res.status}).`);
  const { props } = await res.json();
  if (!Array.isArray(props) || !props.length) throw new Error('El inventario de la web está vacío.');

  const rows = props.map((p) => ({
    id: p.id, // se conserva: los enlaces #p-<id> y las «Ref.» ya compartidas siguen sirviendo
    titulo: p.t || `Propiedad ${p.id}`,
    operaciones: Array.isArray(p.ops) && p.ops.length ? p.ops : ['venta'],
    tipo: p.tipo || 'otro',
    ciudad: p.ciudad || '',
    sector: p.sector || '',
    precio: p.precio ?? null,
    moneda: p.mon || '',
    porM2: !!p.porM2,
    habitaciones: p.hab ?? null,
    banos: p.banos ?? null,
    parqueos: p.parq ?? null,
    m2: p.m2 ?? null,
    caracteristicas: Array.isArray(p.feat) ? p.feat : [],
    descripcion: p.desc || '',
    destacada: !!p.dest,
    estado: 'publicada',
    fotos: (p.gal || []).map((u, i) => (i === 0 && p.img ? { url: abs(u), card: abs(p.img) } : { url: abs(u) })),
    urlOriginal: p.url || null,
    createdBy: username,
    updatedBy: username
  }));

  // upsert por id (el wrapper genérico descarta los id al insertar)
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase.from('webProps').upsert(rows.slice(i, i + 50), { onConflict: 'id' });
    if (error) throw new Error(error.message);
    onProgress?.(Math.min(rows.length, i + 50), rows.length);
  }
  return rows.length;
}
