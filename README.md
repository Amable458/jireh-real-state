# Jireh Real State

Sistema de Gestión Inmobiliaria construido con React + Vite + Tailwind CSS.

## Características

- **Autenticación**: Login con SHA-256 + JWT simulado, sesión 8h o 30 días con "recordarme".
- **Roles**: SuperAdmin, Admin, Operativo (rutas protegidas).
- **Persistencia**: IndexedDB vía Dexie.js, datos históricos por año/mes sin límite.
- **Respaldo/restauración**: exportar/importar todo en JSON.

### Módulos
1. Dashboard (KPIs, gráfica anual, alertas).
2. Ingresos por Renta.
3. Ingresos por Venta (con comisiones).
4. Gastos Mensuales (quincena 1 y 2, recurrentes auto-copiados).
5. Distribución de Fondos (porcentajes configurables).
6. Bonificaciones (cálculo automático por agente).
7. Propiedades e Inquilinos (alertas de vencimiento 30d).
8. Reportes (PDF + Excel multi-hoja).
9. Usuarios + Bitácora.
10. Respaldo / restauración.

## Usuarios por defecto

| Usuario      | Contraseña         | Rol         |
| ------------ | ------------------ | ----------- |
| `superadmin` | `SuperAdmin2024!`  | SuperAdmin  |
| `admin`      | `Admin2024!`       | Admin       |
| `usuario1`   | `User2024!`        | Operativo   |

## Instalación

```bash
npm install
npm run dev
```

Build para producción:

```bash
npm run build
npm run preview
```

## Stack

- React 18, React Router 6, Zustand
- Tailwind CSS 3
- Dexie.js (IndexedDB)
- Recharts (gráficas)
- jsPDF + AutoTable (PDF)
- SheetJS xlsx (Excel)
- Lucide React (iconos)

Idioma: español. Moneda: pesos dominicanos (DOP).
