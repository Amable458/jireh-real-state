export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const b64u = (obj) => {
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function makeToken(payload, secret = 'jireh-secret') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const unsigned = `${b64u(header)}.${b64u(body)}`;
  const sig = await sha256(unsigned + secret);
  return `${unsigned}.${sig}`;
}

export function decodeToken(token) {
  try {
    const [, body] = token.split('.');
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}
