import React from 'react';
import { C, F, fraunces } from '../brand';
import { E, ramp, useT } from '../lib/anim';

type WordsProps = {
  readonly text: string;
  /** Second at which the first word starts to rise. */
  readonly at: number;
  /** Second at which the line leaves (optional — omit to hold). */
  readonly out?: number;
  readonly size: number;
  readonly color?: string;
  readonly accent?: string;
  readonly weight?: number;
  readonly stagger?: number;
  readonly dur?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly lineHeight?: number;
  readonly font?: 'display' | 'body';
  readonly italicAccent?: boolean;
  readonly tracking?: number;
  readonly style?: React.CSSProperties;
};

type Token = { word: string; accent: boolean };

const parse = (text: string): Token[][] => {
  let on = false;
  return text.split('\n').map((line) =>
    line
      .split(' ')
      .filter(Boolean)
      .map((raw) => {
        let word = raw;
        const starts = word.startsWith('*');
        if (starts) {
          on = true;
          word = word.slice(1);
        }
        const accent = on;
        if (word.endsWith('*')) {
          on = false;
          word = word.slice(0, -1);
        }
        return { word, accent };
      }),
  );
};

/**
 * Kinetic headline: each word rises out of its own mask, one after another.
 * `*stars*` mark the accent words. The hall reads the line as it lands.
 */
export const Words: React.FC<WordsProps> = ({
  text,
  at,
  out,
  size,
  color = C.cream,
  accent = C.emberA,
  weight = 620,
  stagger = 0.075,
  dur = 0.85,
  align = 'left',
  lineHeight = 1.04,
  font = 'display',
  italicAccent = true,
  tracking = -0.022,
  style,
}) => {
  const { t } = useT();
  const lines = parse(text);
  let n = 0;
  const leave = out === undefined ? 0 : ramp(t, out, 0.45, E.in);
  const family =
    font === 'display' ? fraunces(weight) : ({ fontFamily: F.body, fontWeight: weight } as const);

  return (
    <div
      style={{
        ...family,
        fontSize: size,
        lineHeight,
        letterSpacing: `${tracking}em`,
        color,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end',
        ...style,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{ display: 'flex', flexWrap: 'nowrap', gap: '0.24em' }}>
          {line.map((tok, wi) => {
            const p = ramp(t, at + n * stagger, dur, E.out);
            n++;
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  overflow: 'hidden',
                  // room for descenders and italic overhang inside the mask
                  padding: '0.12em 0.08em 0.22em',
                  margin: '-0.12em -0.08em -0.22em',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'nowrap',
                    transform: `translateY(${(1 - p) * 118 - leave * 118}%) rotate(${(1 - p) * 5}deg)`,
                    transformOrigin: '0% 100%',
                    opacity: p <= 0 ? 0 : 1 - leave,
                    color: tok.accent ? accent : undefined,
                    fontStyle: tok.accent && italicAccent ? 'italic' : 'normal',
                  }}
                >
                  {tok.word}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

type FadeProps = {
  readonly at: number;
  readonly out?: number;
  readonly dur?: number;
  readonly rise?: number;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
};

/** Small supporting text: fades and lifts in as one block. */
export const Fade: React.FC<FadeProps> = ({ at, out, dur = 0.7, rise = 24, children, style }) => {
  const { t } = useT();
  const p = ramp(t, at, dur, E.out);
  const leave = out === undefined ? 0 : ramp(t, out, 0.4, E.in);
  return (
    <div
      style={{
        opacity: p * (1 - leave),
        transform: `translateY(${(1 - p) * rise - leave * rise}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Eyebrow: React.FC<{
  readonly at: number;
  readonly out?: number;
  readonly children: React.ReactNode;
  readonly color?: string;
  readonly size?: number;
  readonly style?: React.CSSProperties;
}> = ({ at, out, children, color = C.sprout, size = 30, style }) => {
  const { t } = useT();
  const p = ramp(t, at, 0.8, E.out);
  const leave = out === undefined ? 0 : ramp(t, out, 0.4, E.in);
  return (
    <div
      style={{
        fontFamily: F.mono,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: '0.2em',
        color,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        opacity: p * (1 - leave),
        ...style,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 56 * p,
          height: 3,
          borderRadius: 2,
          background: color,
        }}
      />
      <span>{children}</span>
    </div>
  );
};
