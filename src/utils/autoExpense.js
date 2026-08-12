// ============================================================
// Distingue los gastos que crea el propio sistema de los que registra
// una persona.
//
// Cada generador automático marca sus gastos con un recurringKey de
// prefijo conocido. Centralizar la lista aquí evita el fallo que tuvo el
// módulo de Gastos: comprobaba solo 'tenant_owner_', así que el bono de
// administración (creado solo al abrir el Dashboard) pasaba por gasto
// manual, el mes parecía ya trabajado y los recurrentes del mes anterior
// no se copiaban nunca.
//
// Al añadir un generador nuevo, añade aquí su prefijo.
// ============================================================

export const AUTO_EXPENSE_PREFIXES = [
  'tenant_owner_',  // pago al propietario al cobrar la renta  (tenantCharges.js)
  'admin_bonus_',   // bono de administración por inquilino    (adminBonus.js)
  'contract_',      // desglose del contrato de renta          (contractCharges.js)
  'sale_colega_'    // reparto de comisión con colegas         (saleColegas.js)
];

export const isAutoExpense = (e) =>
  AUTO_EXPENSE_PREFIXES.some((p) => String(e?.recurringKey || '').startsWith(p));
