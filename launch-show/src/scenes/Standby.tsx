import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from '../brand';
import { E, ramp, useT, wave } from '../lib/anim';
import { Grain } from '../components/Stage';
import { LeafMark, Wordmark } from '../components/Logo';
import { HOLD_BG } from './S6Hold';

export const STANDBY_INTRO = 2;
export const STANDBY_LOOP = 6;

/** What is on the screen before the segment starts: just the name, breathing. Safe to leave up. */
export const Standby: React.FC = () => {
  const { t } = useT();
  return (
    <AbsoluteFill style={{ background: HOLD_BG }}>
      <div
        style={{
          position: 'absolute',
          left: 960 - 620,
          top: 500 - 620,
          width: 1240,
          height: 1240,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(30,122,76,0.34) 0%, rgba(30,122,76,0) 62%)',
          transform: `scale(${1 + wave(t, 6) * 0.05})`,
        }}
      />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: ramp(t, 0.1, 1.2, E.out) }}>
        <LeafMark size={340} sway={wave(t, 6) * 1.5} />
        <Wordmark width={640} ink={C.cream} style={{ marginTop: -22 }} />
      </AbsoluteFill>
      <Grain opacity={0.05} />
    </AbsoluteFill>
  );
};
