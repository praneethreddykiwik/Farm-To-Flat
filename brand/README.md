# Fooducia — the sprout F

One stem, two leaves. It reads as an **F** at a glance and as a **seedling** a moment later, which is
the whole product in one shape: something that was still growing this morning.

Drawn on a 256 grid, in the app's own palette — nothing new was invented for it.

|               |                                                              |
| ------------- | ------------------------------------------------------------ |
| Ground        | `#1e7a4c` → `#135a37` → `#0b1510` (leaf → leaf-deep → night) |
| Mark on dark  | `#cdf56a` stem, `#9fd12c`→`#cdf56a` leaves (sprout)          |
| Mark on light | `#135a37` stem, `#135a37`→`#1e7a4c` leaves                   |
| One colour    | `#0e1b14` (ink) — no veins, for stamps, invoices, embroidery |

## Files

`fooducia-mark.svg` and `fooducia-badge.svg` are the masters; everything else is generated from the
same geometry by `render.py`. There is no SVG rasteriser on the build machine (no rsvg, inkscape or
cairo, and npm cannot install), so that script flattens the beziers and draws them with Pillow at 4x
before downsampling — which is where the anti-aliasing comes from.

    python3 brand/render.py

| File                             | Use                                 |
| -------------------------------- | ----------------------------------- |
| `fooducia-badge-1024.png`        | store listings, press               |
| `fooducia-badge-512.png`         | Android `icon-512`, PWA             |
| `fooducia-badge-192.png`         | PWA, maskable source                |
| `fooducia-badge-180.png`         | `apple-touch-icon`                  |
| `fooducia-badge-{64,32,16}.png`  | favicons                            |
| `fooducia-mark-1024.png`         | mark on a light ground, transparent |
| `fooducia-mark-onnight-1024.png` | mark on the dark ground             |
| `fooducia-mark-mono-1024.png`    | single colour                       |

## Drawing it

The leaves sit **behind** the stem. Drawn in front, each leaf's base pokes a small nub past the
stem's left edge; behind, the stem covers the join. Keep that order in any new rendition.

In the badge the mark is scaled 1.14 and nudged `(6, -4)` — optically centred, not mathematically
centred, because the latter always reads low and left against a squircle.

## Lockup

Mark, then the word in **Fraunces 600**, tracking `-0.025em`, with a gap of `0.28 ×` the mark's
height. Cap height of the word matches the mark's height. The wordmark is live text rather than
outlines so it stays correctable; set it in Fraunces, which the app and the site already load.

## Clear space

Keep free space on all sides equal to the width of the stem (24 units on the 256 grid). Never
recolour the mark outside the four combinations above, and never put the light-ground version on a
dark one — the veins disappear and it reads as a blob.
