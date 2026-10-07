// ============================================================
// Fotos de «Propiedades en la web» → Vercel Blob (jireh-propiedades-fotos)
//
//   POST   /api/fotos?k=foto|card   cuerpo = la imagen ya comprimida (webp/jpg/png)
//   DELETE /api/fotos               cuerpo = { urls: [...] }
//
// Solo con una sesión válida de la app: la cabecera x-jireh-session se
// comprueba contra la base (jireh_whoami) antes de aceptar nada. El token del
// almacén lo inyecta Vercel en el servidor y nunca llega al navegador.
// ============================================================
import { put, del } from '@vercel/blob';

const env = process.env;
const SUPA_URL = env['VITE_SUPABASE_URL'];
const SUPA_KEY = env['VITE_SUPABASE_' + 'ANON_KEY'];

const MAX_BYTES = 4 * 1024 * 1024; // límite de cuerpo de las funciones: 4.5 MB
const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
// Solo se borra lo que este panel subió: archivos del almacén bajo propiedades/
const OURS = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/propiedades\//i;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

async function sessionUser(request) {
  const token = request.headers.get('x-jireh-session') || '';
  if (token.length < 16 || !SUPA_URL || !SUPA_KEY) return null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/jireh_whoami`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'content-type': 'application/json',
        'x-jireh-session': token
      },
      body: '{}'
    });
    if (!r.ok) return null;
    const me = await r.json();
    return me && me.role ? me : null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  const me = await sessionUser(request);
  if (!me) return json(401, { error: 'Tu sesión venció. Vuelve a iniciar sesión.' });

  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return json(415, { error: 'Formato de imagen no permitido.' });

  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return json(400, { error: 'La imagen llegó vacía.' });
  if (buf.byteLength > MAX_BYTES) return json(413, { error: 'La imagen es demasiado grande.' });

  const kind = new URL(request.url).searchParams.get('k') === 'card' ? 'card' : 'foto';
  try {
    const blob = await put(`propiedades/${kind}.${ext}`, buf, {
      access: 'public',
      contentType: type,
      addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365
    });
    return json(200, { url: blob.url });
  } catch (e) {
    return json(500, { error: 'No se pudo guardar la foto: ' + (e?.message || 'error desconocido') });
  }
}

export async function DELETE(request) {
  const me = await sessionUser(request);
  if (!me) return json(401, { error: 'Tu sesión venció. Vuelve a iniciar sesión.' });

  let urls = [];
  try { urls = (await request.json())?.urls; } catch { /* cuerpo inválido */ }
  const ours = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && OURS.test(u));
  if (ours.length) {
    try { await del(ours); } catch (e) { return json(500, { error: e?.message || 'No se pudieron borrar' }); }
  }
  return json(200, { deleted: ours.length });
}
