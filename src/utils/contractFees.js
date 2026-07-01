// Desglose por defecto del "Contrato de renta".
// Son las cuentas por pagar a terceros; el residual (renta − suma) es el
// ingreso real de la empresa y NO se lista aquí.
export const DEFAULT_CONTRACT_FEES = [
  { id: 'notario',              label: 'Abogado notario',            amount: 500 },
  { id: 'abogado_inmobiliaria', label: 'Abogado inmobiliaria',       amount: 500 },
  { id: 'datacredito',          label: 'Depuración (Data crédito)',  amount: 500 },
  { id: 'gestor',               label: 'Depuración (Gestor)',        amount: 500 }
];

export const CONTRATO_CATEGORY = 'Contrato de renta';

export const makeFeeId = (label) => {
  const base = String(label || 'concepto')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'concepto';
  return `${base}_${Math.random().toString(36).slice(2, 6)}`;
};

// Normaliza la config: array de {id, label, amount}
export const normalizeFees = (fees) => {
  if (!Array.isArray(fees) || fees.length === 0) return DEFAULT_CONTRACT_FEES.map((f) => ({ ...f }));
  return fees
    .filter((f) => f && (f.label != null))
    .map((f) => ({
      id: f.id || makeFeeId(f.label),
      label: String(f.label || ''),
      amount: Number(f.amount) || 0
    }));
};

export const feesTotal = (fees) => normalizeFees(fees).reduce((s, f) => s + (Number(f.amount) || 0), 0);
