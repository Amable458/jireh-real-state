import { usePeriod } from '../store/period.js';
import { monthsList, yearsList } from '../utils/format.js';

export default function PeriodPicker({ showMonth = true }) {
  const { year, month, setYear, setMonth } = usePeriod();
  return (
    <div className="flex items-center gap-2">
      <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input py-1.5 w-28">
        {yearsList(5, 1).map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      {showMonth && (
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input py-1.5 w-36">
          {monthsList.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      )}
    </div>
  );
}
