import { useMemo } from "react";
import { encode, QrCodeDataType } from "uqr";

/** Dark modules on a light tile whatever the theme: not every phone camera reads an inverted code. Inks are dark enough to read. */
const INK = "#111111";
/** Module dots this wide (of one module); smaller ones stop some readers. */
const DOT_RADIUS = 0.48;
const FINDER = 7;

/**
 * The pairing link as a QR code: round modules, rounded finder squares and the Sirus mark in a
 * cleared square at its centre. Medium error correction keeps the modules large and still
 * recovers what the mark covers.
 */
function geometry(value: string) {
  const qr = encode(value, { ecc: "M", border: 0 });
  const size = qr.size;
  // An odd span keeps the cleared square centred on a module.
  const span = Math.round(size * 0.2) | 1;
  const start = (size - span) / 2;
  let dots = "";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!qr.data[y]?.[x] || qr.types[y]?.[x] === QrCodeDataType.Position) continue;
      if (x >= start && x < start + span && y >= start && y < start + span) continue;
      dots += `M${x + 0.5 - DOT_RADIUS} ${y + 0.5}a${DOT_RADIUS} ${DOT_RADIUS} 0 1 0 ${DOT_RADIUS * 2} 0a${DOT_RADIUS} ${DOT_RADIUS} 0 1 0 ${-DOT_RADIUS * 2} 0`;
    }
  }
  const far = size - FINDER;
  return { size, dots, span, finders: [[0, 0], [far, 0], [0, far]] as const };
}

export function PairingQrCode({ value, label, size = 176, ink = INK }: { value: string; label: string; size?: number; ink?: string }) {
  const qr = useMemo(() => geometry(value), [value]);
  // The mark sits inside the cleared square with a module of breathing room.
  const mark = ((qr.span - 1.5) / qr.size) * size;
  return <div role="img" aria-label={label} className="pairing-qr">
    <svg aria-hidden="true" viewBox={`0 0 ${qr.size} ${qr.size}`} width={size} height={size}>
      <path d={qr.dots} fill={ink} />
      {qr.finders.map(([x, y]) => <g key={`${x}:${y}`}>
        <rect x={x + 0.5} y={y + 0.5} width={FINDER - 1} height={FINDER - 1} rx={1.9} fill="none" stroke={ink} strokeWidth={1} />
        <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill={ink} />
      </g>)}
    </svg>
    <span aria-hidden="true" className="pairing-qr-mark" style={{ width: mark, height: mark, background: ink }}><i /></span>
  </div>;
}
