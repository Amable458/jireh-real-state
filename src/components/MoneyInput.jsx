import { useEffect, useRef, useState } from 'react';

// ============================================================
// Campo de importe que entiende cómo se escriben los montos en RD.
//
// Antes los importes eran <input type="number">: si alguien escribía
// «6,300» (coma de miles) el navegador lo consideraba inválido y entregaba
// un campo VACÍO, aunque en pantalla se siguiera viendo 6,300. El monto se
// perdía sin aviso. Y «6.300» se guardaba como 6.3.
//
// Aquí se acepta 6300 · 6,300 · 6,300.50 · RD$6,300 · 6.300 (punto de
// miles) · 1.234.567,89, y si algo no se entiende el campo se marca en rojo y
// el formulario no se deja guardar.
// ============================================================

// Devuelve el número, null si está vacío, o NaN si no se entiende.
export function parseMoney(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v).trim().replace(/\s+/g, '').replace(/^(RD|US)?\$/i, '').replace(/^(DOP|USD)/i, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');           // 1.234.567,89
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');                               // 6.300 → 6300 (punto de miles)
  } else if (/^-?\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');                                // 6300,5 → decimal con coma
  } else if (s.includes(',')) {
    // Comas de miles bien agrupadas: 6,300 · 1,234,567.50 (no «6,30,0»)
    if (!/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) return NaN;
    s = s.replace(/,/g, '');
  }
  // Admite "6300." mientras se escribe, sin marcarlo en rojo a mitad de tecleo
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// ¿El texto tiene algo escrito que no es un monto válido?
export const isBadMoney = (v) => Number.isNaN(parseMoney(v));

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const display = (v) => {
  const n = parseMoney(v);
  return n == null || Number.isNaN(n) ? (v ?? '') : nf.format(n);
};

/**
 * value/onChange como cualquier campo controlado. onChange recibe un texto
 * numérico limpio ('6300', '6300.5'), '' si está vacío, o el texto tal cual
 * si no se entiende (para que el formulario pueda bloquear el guardado).
 */
export default function MoneyInput({ value, onChange, className = 'input', ...rest }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => display(value));

  // Si el valor cambia desde fuera (otro registro, autocompletado), reflejarlo
  useEffect(() => { if (!focused) setText(display(value)); }, [value, focused]);

  const bad = isBadMoney(text);
  // Bloquea el envío de los formularios <form> con un mensaje claro
  useEffect(() => {
    ref.current?.setCustomValidity(bad ? 'Monto no válido. Escribe solo números, por ejemplo 6,300 o 6300.50' : '');
  }, [bad]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      {...rest}
      value={text}
      aria-invalid={bad || undefined}
      className={`${className} tnum ${bad ? '!border-red-500 !ring-2 !ring-red-500/25' : ''}`}
      onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); setText(display(text)); rest.onBlur?.(e); }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = parseMoney(t);
        onChange?.(n == null ? '' : Number.isNaN(n) ? t : String(n));
      }}
    />
  );
}
