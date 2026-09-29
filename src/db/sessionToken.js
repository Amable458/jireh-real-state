// Token de la sesión activa, compartido por el cliente de Supabase y la capa
// de datos. Vive en su propio módulo para que supabaseClient.js pueda leerlo
// sin importar database.js (que a su vez importa supabaseClient.js).
let token = null;

export const setSessionToken = (t) => { token = t || null; };
export const getSessionToken = () => token;
