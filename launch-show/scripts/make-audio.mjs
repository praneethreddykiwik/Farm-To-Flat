// Synthesises the launch sting — no samples, no licences, nothing downloaded.
//
// It is scored to S7Launch frame-for-frame:
//   0.00  the key press: a soft rising breath
//   0.85  one held beat of silence
//   0.90  THE BURST: a warm, round hit + a bright bell chord (soft, not a trailer boom)
//   3.60  the name grows to fill the screen: a slow swell …
//   4.90  … landing on a second, higher chord
//   7.50  "Officially launched": a single clear bell
//  10.7+  the three codes arrive: three small rising notes
//
//   node scripts/make-audio.mjs   →  src/assets/launch.wav

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const DUR = 16;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);

let seed = 20261129;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const add = (i, l, r) => {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
};

/** A struck bell/marimba tone: a few inharmonic partials, fast attack, exponential ring-out. */
const bell = (at, freq, gain, decay = 2.2, pan = 0) => {
  const partials = [
    [1, 1],
    [2.01, 0.5],
    [3.02, 0.22],
    [4.2, 0.12],
    [5.43, 0.06],
  ];
  const start = Math.floor(at * SR);
  const len = Math.floor(decay * 3 * SR);
  const gl = gain * (1 - pan * 0.5);
  const gr = gain * (1 + pan * 0.5);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.004);
    let s = 0;
    for (const [mult, amp] of partials) {
      s += amp * Math.sin(2 * Math.PI * freq * mult * t) * Math.exp((-t / decay) * (1 + (mult - 1) * 0.9));
    }
    s *= attack;
    add(start + i, s * gl, s * gr);
  }
};

/** A soft, round low hit — felt more than heard. */
const thump = (at, gain) => {
  const start = Math.floor(at * SR);
  const len = Math.floor(1.4 * SR);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 46 + 70 * Math.exp(-t * 22);
    phase += (2 * Math.PI * f) / SR;
    const s = Math.sin(phase) * Math.exp(-t * 3.4) * Math.min(1, t / 0.003) * gain;
    add(start + i, s, s);
  }
};

/** Filtered noise — breath, air, shimmer — with a swelling or fading envelope. */
const air = (at, dur, gain, { rise = true, bright = 0.12, pan = 0 } = {}) => {
  const start = Math.floor(at * SR);
  const len = Math.floor(dur * SR);
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len;
    const env = rise ? p * p * Math.min(1, (1 - p) / 0.04) : (1 - p) ** 2.4 * Math.min(1, p / 0.01);
    const k = bright * (rise ? 0.35 + p * 0.9 : 1);
    lp += k * (rand() * 2 - 1 - lp);
    hp += 0.02 * (lp - hp);
    const s = (lp - hp) * env * gain * 3;
    add(start + i, s * (1 - pan * 0.4), s * (1 + pan * 0.4));
  }
};

/** A rising sine glide under the breath. */
const glide = (at, dur, f0, f1, gain) => {
  const start = Math.floor(at * SR);
  const len = Math.floor(dur * SR);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len;
    const f = f0 * (f1 / f0) ** p;
    phase += (2 * Math.PI * f) / SR;
    const env = p * p * Math.min(1, (1 - p) / 0.05);
    const s = Math.sin(phase) * env * gain;
    add(start + i, s, s);
  }
};

// ── the score ────────────────────────────────────────────────────────────────
const T0 = 0.9;

// the key press → the breath in
air(0.0, 0.84, 0.5, { rise: true, bright: 0.2 });
glide(0.0, 0.84, 180, 900, 0.1);
bell(0.0, 1174.66, 0.1, 0.5); // the press itself: one tiny tick

// the burst — D major, voiced warm and wide
thump(T0, 0.9);
air(T0, 2.6, 0.55, { rise: false, bright: 0.3 });
[
  [146.83, 0.3, 0],
  [293.66, 0.3, -0.3],
  [369.99, 0.24, 0.3],
  [440.0, 0.24, -0.5],
  [587.33, 0.22, 0.5],
  [880.0, 0.14, 0],
].forEach(([f, g, pan]) => bell(T0, f, g, 2.6, pan));
// petals: a quick upward sparkle
[1174.66, 1479.98, 1760, 2349.32, 2959.96].forEach((f, i) => bell(T0 + 0.1 + i * 0.085, f, 0.07, 1.1, i % 2 ? 0.6 : -0.6));

// the name fills the room
air(3.55, 1.35, 0.42, { rise: true, bright: 0.16 });
glide(3.55, 1.35, 146.83, 293.66, 0.12);
thump(4.9, 0.5);
[
  [196.0, 0.26, 0],
  [293.66, 0.24, -0.4],
  [392.0, 0.22, 0.4],
  [493.88, 0.2, -0.2],
  [587.33, 0.2, 0.2],
  [783.99, 0.12, 0],
].forEach(([f, g, pan]) => bell(4.9, f, g, 2.8, pan));

// "Officially launched"
bell(7.5, 587.33, 0.2, 2.0, -0.2);
bell(7.62, 880.0, 0.16, 2.2, 0.2);
bell(8.0, 1174.66, 0.08, 1.6, 0);

// the three codes
[
  [10.75, 440.0],
  [10.97, 554.37],
  [11.19, 659.25],
].forEach(([at, f], i) => bell(at, f, 0.15, 1.3, (i - 1) * 0.6));
bell(12.7, 587.33, 0.12, 2.4, 0);
bell(12.7, 880.0, 0.08, 2.4, 0);

// ── a small room: a few feedback delays stand in for reverb ──────────────────
const reverb = (buf, taps) => {
  const out = new Float32Array(buf);
  for (const [ms, fb] of taps) {
    const d = Math.floor((ms / 1000) * SR);
    const line = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const fed = i >= d ? line[i - d] * fb : 0;
      line[i] = buf[i] * 0.22 + fed;
      out[i] += i >= d ? line[i - d] : 0;
    }
  }
  return out;
};
const wetL = reverb(L, [
  [61, 0.55],
  [89, 0.5],
  [127, 0.46],
  [173, 0.4],
]);
const wetR = reverb(R, [
  [67, 0.55],
  [97, 0.5],
  [137, 0.46],
  [181, 0.4],
]);

// ── normalise, fade the tail, write 16-bit stereo ────────────────────────────
// the held beat: everything drops to true silence for the last few hundredths before the burst
const duck = (t) => (t < 0.8 ? 1 : t < 0.86 ? 1 - (t - 0.8) / 0.06 : t < T0 ? 0 : 1);
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(wetL[i]), Math.abs(wetR[i]));
const norm = 0.89 / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const tail = Math.min(1, (N - i) / (SR * 1.5)) * duck(i / SR);
  // soft-clip so a loud PA never gets a harsh edge
  const l = Math.tanh(wetL[i] * norm * 1.15) * tail;
  const r = Math.tanh(wetR[i] * norm * 1.15) * tail;
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32767), 46 + i * 4);
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'assets', 'launch.wav');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, pcm);
console.log(`launch.wav  ${(pcm.length / 1024 / 1024).toFixed(2)} MB  peak-normalised, ${DUR}s`);
