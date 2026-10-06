#!/usr/bin/env python3
"""
Rasterise the Fooducia mark.

There is no SVG rasteriser on this machine (no rsvg/inkscape/cairo, and npm cannot install), so the
geometry is flattened and drawn directly: cubic beziers become polylines, shapes are filled at 4x
and downsampled with Lanczos, which is what gives the edges their anti-aliasing. Deterministic, no
dependencies beyond Pillow, and the SVG beside it stays the master.
"""
from PIL import Image, ImageDraw
import os

S = 256           # design grid
SS = 4            # supersample factor

C = {
    "night":      (11, 21, 16),
    "ink":        (14, 27, 20),
    "canvas":     (243, 245, 239),
    "leaf":       (30, 122, 76),
    "leaf_deep":  (19, 90, 55),
    "sprout":     (205, 245, 106),
    "sprout_dp":  (159, 209, 44),
}

def cubic(p0, p1, p2, p3, n=72):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0]
        y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
        out.append((x, y))
    return out

# ── the mark, in the 256 grid ────────────────────────────────────────────────
STEM   = cubic((100,204), (100,158), (96,112), (102,56))
LEAF_T = cubic((104,90), (128,52), (164,36), (198,44)) + cubic((198,44), (176,80), (138,96), (104,90))
LEAF_B = cubic((100,152), (120,124), (148,110), (172,116)) + cubic((172,116), (156,144), (128,158), (100,152))
RIB_T  = cubic((110,88), (136,70), (168,56), (190,48))
RIB_B  = cubic((106,150), (126,138), (150,127), (166,120))

def sc(pts, k, dx=0, dy=0):
    return [((x + dx) * k, (y + dy) * k) for x, y in pts]

def stroke(d, pts, width, fill, k):
    """
    A stroke as ONE filled polygon, offset either side of the centreline.

    ImageDraw.line with a width draws a rectangle per segment; at this scale every seam between
    them showed as a hairline tick down the stem. Offsetting the path and filling the result once
    leaves no seams at all.
    """
    import math
    w = width * k / 2
    left, right = [], []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        ax, ay = pts[max(i - 1, 0)]
        bx, by = pts[min(i + 1, n - 1)]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L * w, dx / L * w
        left.append((x + nx, y + ny))
        right.append((x - nx, y - ny))
    d.polygon(left + right[::-1], fill=fill)
    for p in (pts[0], pts[-1]):          # round caps
        d.ellipse([p[0]-w, p[1]-w, p[0]+w, p[1]+w], fill=fill)

def linear_gradient(size, a, b, _cache={}):
    """
    Diagonal top-left → bottom-right, the direction the SVG uses.

    Built small and scaled up: a linear ramp survives interpolation exactly, and generating one
    pixel at a time at 8192 square took minutes.
    """
    key = (a, b)
    if key not in _cache:
        n = 128
        small = Image.new("RGB", (n, n))
        px = small.load()
        for y in range(n):
            for x in range(n):
                t = (x / n + y / n) / 2
                px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
        _cache[key] = small
    return _cache[key].resize((size, size), Image.BILINEAR)

def mark_layer(size, stem_c, leaf_a, leaf_b, rib_c, dx=0, dy=0, rib=True, grow=1.0):
    """The mark alone, as RGBA at `size`, leaves filled with a gradient a→b."""
    k = size * SS / S * grow
    big = size * SS
    # keep the grown mark centred on the 256 grid
    cx = S / 2 * (1 / grow - 1)
    dx, dy = dx + cx, dy + cx
    mask = Image.new("L", (big, big), 0)
    md = ImageDraw.Draw(mask)
    md.polygon(sc(LEAF_T, k, dx, dy), fill=255)
    md.polygon(sc(LEAF_B, k, dx, dy), fill=255)
    leaves = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad = linear_gradient(big, leaf_a, leaf_b).convert("RGBA")
    leaves.paste(grad, (0, 0), mask)

    stem_img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stem_img)
    stroke(sd, sc(STEM, k, dx, dy), 24, stem_c + (255,), k)

    # Leaves BEHIND the stem. Drawn in front, each leaf's base poked a small nub past the
    # stem's left edge; behind, the stem covers the join cleanly.
    out = Image.alpha_composite(leaves, stem_img)
    if rib:
        rl = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        rd = ImageDraw.Draw(rl)
        stroke(rd, sc(RIB_T, k, dx, dy), 4, rib_c + (90,), k)
        stroke(rd, sc(RIB_B, k, dx, dy), 3.6, rib_c + (90,), k)
        # veins only read inside the leaves
        rl.putalpha(Image.composite(rl.getchannel("A"), Image.new("L", (big, big), 0), mask))
        out = Image.alpha_composite(out, rl)
    return out.resize((size, size), Image.LANCZOS)

def badge(size):
    """Rounded-square app icon: gradient ground, sprout mark, optically centred."""
    big = size * SS
    ground = linear_gradient(big, C["leaf"], C["night"]).convert("RGBA")
    m = Image.new("L", (big, big), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, big-1, big-1], radius=int(58/S*big), fill=255)
    ground.putalpha(m)
    mk = mark_layer(size, C["sprout"], C["sprout_dp"], C["sprout"], C["leaf_deep"], dx=6, dy=-4, grow=1.14)
    return Image.alpha_composite(ground.resize((size, size), Image.LANCZOS), mk)

def write(img, name):
    img.save(f"brand/{name}", "PNG")
    print(f"  {name:34} {img.size[0]}x{img.size[1]}  {os.path.getsize('brand/'+name)//1024} KB")

if __name__ == "__main__":
    print("badge")
    for s in (1024, 512, 192, 180, 64, 32, 16):
        write(badge(s), f"fooducia-badge-{s}.png")
    print("mark (transparent)")
    write(mark_layer(1024, C["leaf_deep"], C["leaf_deep"], C["leaf"], C["canvas"]), "fooducia-mark-1024.png")
    write(mark_layer(256, C["leaf_deep"], C["leaf_deep"], C["leaf"], C["canvas"]), "fooducia-mark-256.png")
    print("mark on dark")
    write(mark_layer(1024, C["sprout"], C["sprout"], C["sprout"], C["night"]), "fooducia-mark-onnight-1024.png")
    print("mono")
    write(mark_layer(1024, C["ink"], C["ink"], C["ink"], C["canvas"], rib=False), "fooducia-mark-mono-1024.png")
