import React, { useId, useMemo } from 'react';
import QRCode from 'qrcode';
import { C } from '../brand';

type QRProps = {
  readonly value: string;
  readonly size: number;
  /** 0→1: the code prints itself top to bottom. */
  readonly reveal?: number;
  readonly color?: string;
};

/**
 * A real, scannable QR code drawn as vectors.
 * Dark modules on white with the full 4-module quiet zone, error-correction M — the combination
 * phone cameras lock onto fastest from a distance.
 */
export const QR: React.FC<QRProps> = ({ value, size, reveal = 1, color = C.forestDeep }) => {
  const { d, n } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const data = qr.modules.data;
    let path = '';
    for (let y = 0; y < count; y++) {
      let run = 0;
      for (let x = 0; x <= count; x++) {
        const on = x < count && data[y * count + x];
        if (on) run++;
        else if (run) {
          path += `M${x - run},${y}h${run}v1h${-run}z`;
          run = 0;
        }
      }
    }
    return { d: path, n: count };
  }, [value]);

  const clipId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const quiet = 4;
  const total = n + quiet * 2;
  const shown = Math.max(0, Math.min(1, reveal));
  return (
    <svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${total} ${total}`} shapeRendering="crispEdges" style={{ display: 'block' }}>
      <rect x={-quiet} y={-quiet} width={total} height={total} fill="#FFFFFF" />
      <clipPath id={clipId}>
        <rect x={-quiet} y={-quiet} width={total} height={total * shown} />
      </clipPath>
      <path d={d} fill={color} clipPath={`url(#${clipId})`} />
      {shown > 0 && shown < 1 ? (
        <rect x={-quiet} y={-quiet + total * shown - 0.5} width={total} height={1} fill={C.leafBright} opacity={0.9} />
      ) : null}
    </svg>
  );
};
