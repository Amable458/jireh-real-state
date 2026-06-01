import { useSettings } from '../store/settings.js';
import { CURRENCIES } from '../utils/currency.js';

// Selector de moneda + tasa de cambio (esta última solo si USD).
// Controlado: recibe `currency` y `exchangeRate` y los actualiza vía onChange.
export default function CurrencyFields({ currency, exchangeRate, onChange, amountLabel = 'Monto' }) {
  const { usdToDop } = useSettings();
  const isUSD = currency === 'USD';

  const setCurrency = (value) => {
    // Al cambiar a USD, prefijar la tasa global si está vacía
    const patch = { currency: value };
    if (value === 'USD' && !exchangeRate) patch.exchangeRate = usdToDop;
    if (value === 'DOP') patch.exchangeRate = '';
    onChange(patch);
  };

  return (
    <>
      <div>
        <label className="label">Moneda</label>
        <select className="input" value={currency || 'DOP'} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      {isUSD && (
        <div>
          <label className="label">Tasa USD → DOP</label>
          <input
            type="number" step="0.01" min="0" className="input"
            value={exchangeRate ?? ''}
            placeholder={`global: ${usdToDop}`}
            onChange={(e) => onChange({ exchangeRate: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
