export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
