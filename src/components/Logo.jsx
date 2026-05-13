import { useState, useEffect } from 'react';

// Si existe /logo.svg o /logo.png en /public, lo usa.
// Si no, fallback al SVG dibujado a mano.
const CUSTOM_LOGO_URLS = ['/logo.svg', '/logo.png'];

function useCustomLogo() {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    (async () => {
      for (const url of CUSTOM_LOGO_URLS) {
        try {
          const r = await fetch(url, { method: 'HEAD' });
          if (r.ok) { setSrc(url); return; }
        } catch { /* ignore */ }
      }
    })();
  }, []);
  return src;
}

// ============================================================
// Mark dibujado a mano (fallback)
// "J" de JIREH estilizada como una llave:
//   - círculo arriba (cabeza)
//   - barra vertical
//   - dos dientes horizontales hacia la IZQUIERDA
//   - pequeño gancho inferior hacia la IZQUIERDA
// ============================================================
export function LogoMark({ size = 48, className = '' }) {
  const custom = useCustomLogo();
  if (custom) {
    return (
      <img
        src={custom}
        alt="Jireh"
        style={{ height: size, width: 'auto' }}
        className={className}
      />
    );
  }
  const w = (size * 60) / 100; // ratio 3:5
  return (
    <svg
      viewBox="0 0 60 100"
      width={w}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* Cabeza de la llave */}
      <circle cx="42" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="5" />
      {/* Cuerpo vertical */}
      <rect x="39.5" y="25" width="5" height="58" fill="currentColor" />
      {/* Diente superior largo */}
      <rect x="14" y="45" width="25.5" height="5" fill="currentColor" />
      {/* Diente inferior más corto */}
      <rect x="22" y="58" width="17.5" height="5" fill="currentColor" />
      {/* Pequeño gancho inferior hacia la izquierda */}
      <path
        d="M 39.5 83 L 39.5 89 Q 39.5 94 33 94 L 28 94"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="square"
      />
    </svg>
  );
}

// ============================================================
// Wordmark "JIREH" — la llave hace de J + IREH a la derecha
// ============================================================
export default function Logo({ size = 60, vertical = false, withTagline = false, className = '' }) {
  const custom = useCustomLogo();

  // Si hay logo custom, lo mostramos completo (asume que ya incluye texto)
  if (custom) {
    const heightFactor = vertical ? 1.6 : 1.4;
    return (
      <img
        src={custom}
        alt="Jireh Real Estate"
        style={{ height: size * heightFactor, width: 'auto' }}
        className={className}
      />
    );
  }

  const textSize = size * 0.62;
  const taglineSize = size * 0.16;

  const wordmark = (
    <div className="inline-flex items-center" style={{ gap: size * 0.04, lineHeight: 1 }}>
      <LogoMark size={size} />
      <span
        className="font-extrabold"
        style={{ fontSize: textSize, lineHeight: 1, letterSpacing: '-0.01em' }}
      >
        IREH
      </span>
    </div>
  );

  if (vertical) {
    return (
      <div className={`inline-flex flex-col items-center text-current ${className}`} style={{ lineHeight: 1 }}>
        {wordmark}
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

  return <div className={`text-current ${className}`}>{wordmark}</div>;
}
