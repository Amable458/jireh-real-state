// ============================================================
// Respaldo diario de la base de datos de Jireh.
// Lo ejecuta GitHub Actions (.github/workflows/backup.yml) cada noche y
// guarda el resultado en el repo privado Amable458/jireh-backups.
//
// Mismo formato (versión 3) que el botón "Exportar" de la app, así que el
// archivo se puede restaurar desde Respaldo → Restaurar.
//
// Necesita la clave SECRETA (service role / secret key) de Supabase: es la
// única que lee todas las tablas por encima de RLS, incluida `users`.
// ============================================================
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.JIREH_DB_URL;
const KEY = process.env.JIREH_BACKUP_DB_KEY;
const OUT_DIR = process.env.OUT_DIR || 'backups';

// [tabla, clave primaria]
const TABLES = [
  ['users', 'id'], ['rentals', 'id'], ['sales', 'id'], ['expenses', 'id'],
  ['properties', 'id'], ['tenants', 'id'], ['agents', 'id'],
  ['distributionConfig', 'key'], ['activityLog', 'id'], ['settings', 'key'], ['ownerReports', 'id']
];
const PAGE = 1000;

if (!BASE || !KEY) {
  console.error('Faltan JIREH_DB_URL o JIREH_BACKUP_DB_KEY.');
  process.exit(1);
}

async function fetchTable(table, pk) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const url = `${BASE}/rest/v1/${encodeURIComponent(table)}?select=*&order=${pk}.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Range-Unit': 'items',
        Range: `${from}-${from + PAGE - 1}`
      }
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} — ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const out = { exportedAt: new Date().toISOString(), version: 3, source: 'github-actions', data: {} };
for (const [table, pk] of TABLES) {
  out.data[table] = await fetchTable(table, pk);
  console.log(`  ${table.padEnd(20)} ${out.data[table].length}`);
}

// Salvaguarda: con la clave pública, RLS devuelve listas vacías y el respaldo
// "saldría bien" sin contener nada. Mejor fallar en voz alta.
if (out.data.users.length === 0) {
  console.error('\n✗ No se pudo leer la tabla users: la clave configurada no es la SECRETA de Supabase.');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, `${out.exportedAt.slice(0, 10)}.json`);
await writeFile(file, JSON.stringify(out, null, 2), 'utf8');
const total = Object.values(out.data).reduce((s, r) => s + r.length, 0);
console.log(`\n✓ Respaldo guardado en ${file} (${total} registros)`);
