export function LogoMark({ size = 48, className = '' }) {
  return (
    <svg
      viewBox="0 0 64 96"
      width={size}
      height={(size * 96) / 64}
      className={className}
      aria-hidden="true"
    >
      {/* Cabeza de la llave */}
      <circle cx="32" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="5" />
      {/* Cuerpo vertical */}
      <rect x="29.5" y="23" width="5" height="55" fill="currentColor" />
      {/* Diente superior */}
      <rect x="34.5" y="44" width="18" height="5" fill="currentColor" />
      {/* Diente inferior */}
      <rect x="34.5" y="55" width="12" height="5" fill="currentColor" />
      {/* Curva inferior (gancho de la J) */}
      <path
        d="M 29.5 78 L 29.5 86 Q 29.5 93 22 93 L 18 93"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export default function Logo({ size = 40, vertical = false, className = '' }) {
  return (
    <div className={`inline-flex items-center ${vertical ? 'flex-col gap-2' : 'gap-3'} ${className}`}>
      <LogoMark size={size} />
      <div className={`leading-none ${vertical ? 'text-center' : ''}`}>
        <div className="font-extrabold tracking-[0.18em] text-current" style={{ fontSize: size * 0.55 }}>
          JIREH
        </div>
        <div className="tracking-[0.18em] text-current/80 mt-1" style={{ fontSize: size * 0.22 }}>
          real estate
        </div>
      </div>
    </div>
  );
}
