import React from 'react';
import { C } from '../brand';
import { E, ramp, useT } from '../lib/anim';

export const SCREEN_W = 390;
export const SCREEN_H = 844;

/** A phone, drawn in logical points (390 × 844 screen) so the UI inside uses the app's real sizes. */
export const PhoneFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'relative', width: SCREEN_W, height: SCREEN_H }}>
    {/* body */}
    <div
      style={{
        position: 'absolute',
        inset: -13,
        borderRadius: 66,
        background: 'linear-gradient(145deg, #2A332E 0%, #0A0F0C 40%, #1B231E 100%)',
        boxShadow: '0 60px 120px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.14) inset',
      }}
    />
    {/* screen */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 54,
        overflow: 'hidden',
        background: C.cream,
      }}
    >
      {children}
    </div>
    {/* island */}
    <div
      style={{
        position: 'absolute',
        left: SCREEN_W / 2 - 56,
        top: 12,
        width: 112,
        height: 32,
        borderRadius: 16,
        background: '#050806',
      }}
    />
  </div>
);

/** A fingertip landing on the screen: a dot that presses and a ring that spreads. */
export const Tap: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const { t } = useT();
  const p = ramp(t, at, 0.65, E.out);
  if (p <= 0 || p >= 1) return null;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 34,
          top: y - 34,
          width: 68,
          height: 68,
          borderRadius: '50%',
          border: `3px solid ${C.leaf}`,
          transform: `scale(${0.3 + p * 0.9})`,
          opacity: (1 - p) * 0.9,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x - 15,
          top: y - 15,
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'rgba(30,122,76,0.55)',
          transform: `scale(${1 - p * 0.5})`,
          opacity: 1 - p,
        }}
      />
    </>
  );
};
