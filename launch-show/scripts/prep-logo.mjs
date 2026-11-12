// Splits the official Fooducia leaf mark into its three leaves so each can be animated on its own.
//
// The mark ships as one flattened PNG (the SVG master embeds raster gradients), so the leaves are
// recovered by connected-component labelling on the alpha channel: the three leaves do not touch.
// Output: src/assets/leaf-{top,mid,ember}.png (cropped) + src/assets/leaves.json (placement on a
// 1000-unit square, the same grid the wordmark SVG uses).
//
//   node scripts/prep-logo.mjs "/path/to/Fooducia_Logo_02-01.png"

import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'assets');
mkdirSync(outDir, { recursive: true });

const src = process.argv[2];
if (!src) throw new Error('Pass the path to the leaf-mark PNG');

const W = 1600; // working resolution: big enough that the hairline gaps between leaves survive
const { data, info } = await sharp(src)
  .resize(W, W)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const ch = info.channels;
const solid = (i) => data[i * ch + 3] > 96;

// 4-connected flood fill
const label = new Int32Array(W * W).fill(0);
const comps = [];
const stack = [];
for (let start = 0; start < W * W; start++) {
  if (label[start] || !solid(start)) continue;
  const id = comps.length + 1;
  const c = { id, n: 0, x0: W, y0: W, x1: 0, y1: 0 };
  stack.push(start);
  label[start] = id;
  while (stack.length) {
    const p = stack.pop();
    const x = p % W;
    const y = (p / W) | 0;
    c.n++;
    if (x < c.x0) c.x0 = x;
    if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y;
    if (y > c.y1) c.y1 = y;
    if (x > 0 && !label[p - 1] && solid(p - 1)) (label[p - 1] = id), stack.push(p - 1);
    if (x < W - 1 && !label[p + 1] && solid(p + 1)) (label[p + 1] = id), stack.push(p + 1);
    if (y > 0 && !label[p - W] && solid(p - W)) (label[p - W] = id), stack.push(p - W);
    if (y < W - 1 && !label[p + W] && solid(p + W)) (label[p + W] = id), stack.push(p + W);
  }
  comps.push(c);
}

const big = comps.filter((c) => c.n > 2000).sort((a, b) => a.y0 - b.y0);
console.log(
  'components:',
  comps.length,
  '| large:',
  big.map((c) => `${c.n}px @ y${c.y0}-${c.y1}`),
);
if (big.length !== 3) throw new Error(`Expected 3 leaves, found ${big.length}`);

const names = ['top', 'mid', 'ember'];
const meta = {};
const OUT = 1000; // final unit grid
for (let k = 0; k < 3; k++) {
  const c = big[k];
  const pad = 6;
  const x0 = Math.max(0, c.x0 - pad);
  const y0 = Math.max(0, c.y0 - pad);
  const x1 = Math.min(W - 1, c.x1 + pad);
  const y1 = Math.min(W - 1, c.y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sp = (y0 + y) * W + (x0 + x);
      const di = (y * w + x) * 4;
      // keep this leaf's pixels plus its own soft anti-aliased fringe (unlabelled, low alpha)
      const mine = label[sp] === c.id;
      const fringe =
        !label[sp] &&
        ((x0 + x > 0 && label[sp - 1] === c.id) ||
          (x0 + x < W - 1 && label[sp + 1] === c.id) ||
          (y0 + y > 0 && label[sp - W] === c.id) ||
          (y0 + y < W - 1 && label[sp + W] === c.id));
      if (mine || fringe) {
        buf[di] = data[sp * ch];
        buf[di + 1] = data[sp * ch + 1];
        buf[di + 2] = data[sp * ch + 2];
        buf[di + 3] = data[sp * ch + 3];
      }
    }
  }
  const scale = OUT / W;
  const file = `leaf-${names[k]}.png`;
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .resize(Math.round(w * scale * 1.2)) // 1.2x the unit grid: crisp when the mark is shown large
    .png({ compressionLevel: 9, palette: false })
    .toFile(join(outDir, file));
  meta[names[k]] = {
    file,
    x: +(x0 * scale).toFixed(2),
    y: +(y0 * scale).toFixed(2),
    w: +(w * scale).toFixed(2),
    h: +(h * scale).toFixed(2),
  };
}
writeFileSync(join(outDir, 'leaves.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(meta);
