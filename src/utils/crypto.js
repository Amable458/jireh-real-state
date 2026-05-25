// SHA-256 hex — usado solo para legacy o si se necesita en cliente.
// La autenticación ahora es 100% server-side con tokens opacos.
export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
