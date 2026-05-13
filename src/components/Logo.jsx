// La "J" de JIREH está estilizada como una llave:
//  - círculo arriba (cabeza de la llave)
//  - barra vertical
//  - dos dientes hacia la IZQUIERDA (afuera del texto)
//  - curva inferior hacia la IZQUIERDA (gancho de la J)
export function LogoMark({ size = 48, className = '' }) {
  // size = altura en píxeles. viewBox 64x96 → ratio 2:3
  const w = (size * 64) / 96;
  return (
    <svg
      viewBox="0 0 64 96"
      width={w}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* Cabeza de la llave */}
      <circle cx="40" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="5" />
      {/* Cuerpo vertical */}
      <rect x="37.5" y="23" width="5" height="55" fill="currentColor" />
      {/* Diente superior (más largo) — hacia la izquierda */}
      <rect x="20" y="44" width="17.5" height="5" fill="currentColor" />
      {/* Diente inferior (más corto) — hacia la izquierda */}
      <rect x="26" y="55" width="11.5" height="5" fill="currentColor" />
      {/* Curva inferior — gancho hacia la izquierda */}
      <path
        d="M 37.5 78 L 37.5 86 Q 37.5 93 30 93 L 26 93"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="square"
      />
    </svg>
  );
}

// Wordmark "JIREH" donde la J es la llave.
// size = altura del mark en píxeles.
export default function Logo({ size = 60, vertical = false, withTagline = false, className = '' }) {
  const textSize = size * 0.62;
  const taglineSize = size * 0.16;

  if (vertical) {
    return (
      <div className={`inline-flex flex-col items-center text-current ${className}`} style={{ lineHeight: 1 }}>
        <div className="inline-flex items-center" style={{ gap: size * 0.03 }}>
          <LogoMark size={size} />
          <span
            className="font-extrabold"
            style={{ fontSize: textSize, lineHeight: 1, letterSpacing: '-0.01em' }}
          >
            IREH
          </span>
        </div>
        {withTagline && (
          <span
            className="mt-2 tracking-[0.32em] uppercase opacity-90"
            style={{ fontSize: taglineSize, lineHeight: 1 }}
          >
            real estate
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center text-current ${className}`} style={{ gap: size * 0.03, lineHeight: 1 }}>
      <LogoMark size={size} />
      <span
        className="font-extrabold"
        style={{ fontSize: textSize, lineHeight: 1, letterSpacing: '-0.01em' }}
      >
        IREH
      </span>
    </div>
  );
}
