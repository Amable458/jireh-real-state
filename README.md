# Jireh Real State

Sistema de Gestión Inmobiliaria — React + Vite + Tailwind + **Supabase** (Postgres en la nube).

Datos centralizados, sincronizados entre dispositivos, sin instalación.

## 🚀 Setup inicial (una sola vez)

### 1. Crear proyecto Supabase

1. Entra a https://supabase.com → **Sign up** (gratis).
2. **New project**:
   - Name: `jireh-real-state`
   - Database password: genera una y guárdala (no la usarás en código).
   - Region: `East US` o `South America (São Paulo)`.
3. Espera ~2 minutos a que provisione.

### 2. Ejecutar el schema

1. En el dashboard del proyecto → menú izquierdo **SQL Editor** → **New query**.
2. Copia y pega el contenido completo de [`supabase/schema.sql`](./supabase/schema.sql).
3. Click **Run** (esquina inferior derecha).
4. Verifica en **Table Editor** que aparecen 11 tablas: users, agents, properties, tenants, rentals, sales, expenses, distributionConfig, distributions, activityLog, settings.

### 3. Obtener las credenciales

En el dashboard → ⚙️ **Project Settings** → **API**:

- **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
- **anon public** key (la primera, larga, empieza con `eyJ...`)

### 4. Configurar variables de entorno

**Local (desarrollo):**

```bash
cp .env.example .env
# Edita .env y pega tus credenciales
```

**Vercel (producción):**

Opción A — Dashboard: https://vercel.com → tu proyecto → Settings → Environment Variables → Add:
- `VITE_SUPABASE_URL` = `https://xxx.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `eyJ...`

Opción B — CLI:
```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

### 5. Listo

Abre https://jireh-real-state.vercel.app — al primer login los usuarios por defecto se siembran automáticamente.

## 🔐 Credenciales por defecto

| Usuario      | Contraseña         | Rol         |
| ------------ | ------------------ | ----------- |
| `superadmin` | `SuperAdmin2024!`  | SuperAdmin  |
| `admin`      | `Admin2024!`       | Admin       |
| `usuario1`   | `User2024!`        | Operativo   |

Cámbialas tras el primer ingreso (Sidebar → Usuarios).

## 📦 Módulos

1. **Dashboard** — KPIs, gráfica anual, alertas de contratos y pagos.
2. **Ingresos por Renta** — CRUD por mes/año, estados pagado/parcial/pendiente.
3. **Ingresos por Venta** — Cierres con comisión por agente.
4. **Gastos Mensuales** — Quincena 1 (día 15) y Quincena 2 (día 30); recurrentes se auto-copian al siguiente mes.
5. **Distribución de Fondos** — Categorías configurables (añadir/quitar/renombrar). Categoría "Bonos equipo" protegida.
6. **Bonificaciones** — Pool calculado automáticamente, repartido proporcional a cierres por agente.
7. **Propiedades / Inquilinos / Agentes** — Catálogos con alertas de vencimiento a 30 días.
8. **Reportes** — Filtros mes/año/rango. Export PDF (jsPDF + AutoTable) y Excel (SheetJS) multi-hoja.
9. **Usuarios + Bitácora** — Roles, bloqueo, log de actividad.
10. **Respaldo** — Export/import JSON, datos de ejemplo, validador de BD, limpieza.

## 🛠️ Desarrollo

```bash
npm install
npm run dev
```

Build:
```bash
npm run build
npm run preview
```

## 🔒 Nota sobre seguridad

Para iniciar rápido, las tablas tienen **RLS deshabilitado** (cualquiera con la `anon key` —que viaja en el bundle del frontend— puede leer/escribir).

Para un sistema en producción real, considera:
- **Habilitar RLS** y crear políticas por rol.
- Mover escrituras sensibles a **Vercel Functions** con `service_role` key.
- Usar **Supabase Auth** en vez del login SHA-256 simulado.

## 🧰 Stack

- **Frontend**: React 18, React Router 6, Zustand, Tailwind CSS 3
- **Backend**: Supabase (Postgres 15 + REST API)
- **Cliente**: @supabase/supabase-js v2
- **PDF**: jsPDF + AutoTable
- **Excel**: SheetJS xlsx
- **Iconos**: Lucide React

Idioma: español. Moneda: pesos dominicanos (DOP).
