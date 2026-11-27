"""Draws the museum gallery panels for the animated hero on /archives.

Each panel is one bay of the gallery, built in the same classical style as the
building outside: half a fluted Corinthian column on each edge (two bays side
by side make one whole column), a cornice, dentils and a carved frieze taken
from the building's own frieze, and between the columns an arched niche with a
scallop-shell half dome, a keystone and carved roundels. In each niche stands
one real museum piece, a public-domain photo from The Met's Open Access
collection cut out by scripts/archives-cutout.py (see archives-art/CREDITS.md).

The stonework is modelled as a height map and lit, so mouldings, flutes and the
niche cast real shadows.

Run from the repo root (needs Python 3 with Pillow and numpy):
    python3 scripts/archives-museum.py            # every bay
    python3 scripts/archives-museum.py 0 3        # only bays 0 and 3
It writes assets/archives/bay-NN-{720,1080,1440}.webp, and with --css it
prints the hero's timing keyframes (pasted into archives/index.html between
the museum:start and museum:end comments).
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'archives')
ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'archives-art')
BUILDING = os.path.join(OUT, 'building-2048.webp')

W, H = 1440, 1920           # working size; saved at 1440x1920, 1080x1440 and 720x960
CX = W / 2

# vertical layout (pixels from the top)
CORNICE = (22, 108)
DENTILS = (108, 138)
EGG = (138, 150)
FRIEZE = (150, 240)
ARCHITRAVE = (240, 315)
ABACUS = (315, 340)
CAPITAL = (340, 470)
NECK = (470, 482)
SHAFT = (482, 1395)
FLOOR = 1517
R_TOP, R_BOT = 102, 116     # column radius under the capital and at the foot

NICHE_A = 330               # half width of the niche opening
NICHE_CY = 760              # where the arch springs
NICHE_D = 240               # depth of the niche
BAND = 58                   # width of the moulded frame round the niche
SILL = 1225                 # top of the shelf the piece stands on


# ---------------------------------------------------------------- helpers
def norm(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def value_noise(h, w, scale, seed=0):
    rng = np.random.default_rng(seed)
    gh, gw = int(h / scale) + 3, int(w / scale) + 3
    g = rng.random((gh, gw))
    ys, xs = np.mgrid[0:h, 0:w] / scale
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = ys - y0, xs - x0
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = g[y0, x0] * (1 - fx) + g[y0, x0 + 1] * fx
    b = g[y0 + 1, x0] * (1 - fx) + g[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def fbm(h, w, scale, octaves=4, seed=0):
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for i in range(octaves):
        out += amp * value_noise(h, w, scale / (2 ** i), seed + i)
        tot += amp
        amp *= 0.5
    return out / tot


def to_img(rgb, alpha=None):
    rgb = np.clip(rgb, 0, 1)
    if alpha is None:
        return Image.fromarray((rgb * 255).astype(np.uint8), 'RGB')
    a = np.clip(alpha, 0, 1)
    return Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8), 'RGBA')


def blur(a, r):
    """Gaussian blur of a 2D float array (separable, numpy only)."""
    k = int(max(1, round(r * 3)))
    x = np.arange(-k, k + 1)
    g = np.exp(-x * x / (2.0 * r * r))
    g /= g.sum()
    a = np.asarray(a, np.float32)
    p = np.pad(a, ((k, k), (0, 0)), mode='edge')
    a = sum(g[i] * p[i:i + a.shape[0]] for i in range(2 * k + 1))
    p = np.pad(a, ((0, 0), (k, k)), mode='wrap')   # bays repeat left to right
    return sum(g[i] * p[:, i:i + a.shape[1]] for i in range(2 * k + 1))


def shift(a, dy, dx):
    """a moved by (dy, dx) pixels: wraps left/right (bays repeat), clamps top/bottom."""
    a = np.roll(a, dx, axis=1)
    if dy > 0:
        a = np.concatenate([np.repeat(a[:1], dy, 0), a[:-dy]], 0)
    elif dy < 0:
        a = np.concatenate([a[-dy:], np.repeat(a[-1:], -dy, 0)], 0)
    return a


YS, XS = np.mgrid[0:H, 0:W].astype(np.float32)
DXC = XS - CX                                   # from the bay's centre line
DCOL = np.where(XS < W / 2, XS, XS - W)         # signed, from the nearest column axis


def wrap_fbm(scale, octaves, seed):
    """Noise that runs on from the right edge into the left, so bays join."""
    g = fbm(H, 2 * W, scale, octaves, seed=seed).astype(np.float32)
    t = XS / W
    return g[:, :W] * t + g[:, W:] * (1 - t)


def band(y, top, bot):
    return (y >= top) & (y < bot)


def frieze_relief():
    """The building's own carved frieze, as a relief, one bay wide."""
    b = np.asarray(Image.open(BUILDING).convert('L')).astype(np.float32) / 255
    strip = b[574:620, 240:1860]
    # remove the sunlight gradient, keep the carving
    hp = strip - blur(strip, 6)
    hp = hp / (np.abs(hp).max() + 1e-6)
    hgt = FRIEZE[1] - FRIEZE[0] - 16
    k = hgt / hp.shape[0]
    wid = int(W / k)
    img = Image.fromarray(((hp[:, 300:300 + wid] * 0.5 + 0.5) * 255).astype(np.uint8))
    img = img.resize((W, hgt), Image.LANCZOS)
    return (np.asarray(img).astype(np.float32) / 255 - 0.5) * 2


# --------------------------------------------------------------- the stone
def architecture():
    """Height map (pixels toward the viewer) and base colour of one bay."""
    h = np.zeros((H, W), np.float32)
    kind = np.zeros((H, W), np.uint8)      # 0 wall, 1 column, 2 niche back, 3 shell, 4 entablature, 5 floor, 6 ceiling
    y, x = YS, XS

    # ashlar wall with sunk joints (blocks 360 wide, four to a bay, so bays join)
    course = 136
    row = np.floor((y - ARCHITRAVE[1]) / course)
    jy = np.abs((y - ARCHITRAVE[1]) - (row + 0.5) * course) > course / 2 - 2.5
    jx = np.abs(((x + (row % 2) * 180) % 360) - 180) > 177.5
    h -= 2.2 * (jy | jx)
    # wall plinth course and its moulding along the floor
    sk = band(y, 1408, FLOOR)
    h = np.where(sk, 16.0, h)
    cy = band(y, 1396, 1408)
    h = np.where(cy, 16 + 8 * np.sin((y - 1396) / 12 * math.pi), h)

    # --- niche
    ax = np.abs(DXC)
    rho = np.hypot(DXC, y - NICHE_CY)
    open_rect = (ax < NICHE_A) & (y >= NICHE_CY) & (y < SILL)
    open_dome = (rho < NICHE_A) & (y < NICHE_CY)
    rect_depth = -NICHE_D * np.sqrt(np.clip(1 - (DXC / NICHE_A) ** 2, 0, 1))
    dome_depth = -NICHE_D * np.sqrt(np.clip(1 - (rho / NICHE_A) ** 2, 0, 1))
    h = np.where(open_rect, rect_depth, h)
    kind = np.where(open_rect, 2, kind)
    # scallop shell in the half dome: ribs fanning out from the springing line
    phi = np.arctan2(NICHE_CY - y, DXC)              # 0 .. pi across the dome
    ribs = np.abs(np.cos(phi * 11)) ** 0.6
    fade = np.clip((rho - 40) / 120, 0, 1) * np.clip((NICHE_A - 26 - rho) / 30, 0, 1)
    scallop = np.clip((NICHE_A - rho) / 26, 0, 1)
    shell = dome_depth + 14 * ribs * fade + 10 * (1 - np.abs(np.cos(phi * 11))) * (1 - scallop) * (rho < NICHE_A)
    shell += 12 * np.exp(-(rho / 46) ** 2)          # the hinge boss
    h = np.where(open_dome, shell, h)
    kind = np.where(open_dome, 3, kind)

    # moulded frame round the opening: archivolt over the arch, jambs down the sides
    s_arch = (rho - NICHE_A) / BAND
    s_jamb = (ax - NICHE_A) / BAND
    s = np.where(y < NICHE_CY, s_arch, s_jamb)
    frame = (s >= 0) & (s < 1) & (y < SILL + 4)
    prof = np.select([s < 0.28, s < 0.56, s < 0.82], [20.0, 27.0, 33.0], 33 + 7 * np.sin((s - 0.82) / 0.18 * math.pi))
    prof -= 3 * (np.abs(s - 0.28) < 0.025) + 3 * (np.abs(s - 0.56) < 0.025)
    h = np.where(frame, prof, h)
    # imposts where the arch springs
    imp = band(y, NICHE_CY - 8, NICHE_CY + 22) & (ax >= NICHE_A - 6) & (ax < NICHE_A + BAND + 16)
    ip = 42 - 10 * ((y - (NICHE_CY - 8)) / 30) ** 2
    h = np.where(imp, ip, h)
    # keystone
    kt, kb = NICHE_CY - NICHE_A - BAND - 26, NICHE_CY - NICHE_A + 26
    kw = 30 + (kb - y) * 0.16
    key = band(y, kt, kb) & (ax < kw)
    kh = 50 - 6 * np.clip((ax - (kw - 8)) / 8, 0, 1) - 3 * (np.abs(ax - kw * 0.45) < 2.5)
    kh += 6 * np.exp(-((ax / 9) ** 2 + ((y - (kt + kb) / 2) / 18) ** 2))
    h = np.where(key, kh, h)

    # carved roundels in the spandrels
    for rx in (CX - 425, CX + 425):
        d = np.hypot(x - rx, y - 455)
        ang = np.arctan2(y - 455, x - rx)
        ring = (d < 70)
        rh = np.where(d > 58, 24 + 4 * np.sin((d - 58) / 12 * math.pi), 10.0)
        petals = np.clip(np.cos(ang * 8), 0, 1) ** 1.5 * np.clip(1 - d / 54, 0, 1) * 16
        rh = np.where(d <= 58, rh + petals + 14 * np.exp(-(d / 11) ** 2), rh)
        h = np.where(ring, rh, h)

    # shelf the piece stands on, with two scroll brackets under it
    sw = NICHE_A + BAND + 26
    shelf = band(y, SILL, SILL + 38) & (ax < sw)
    t = (y - SILL) / 38
    h = np.where(shelf, 62 - 22 * t ** 2 - 4 * (np.abs(t - 0.35) < 0.05), h)
    for bx in (CX - NICHE_A - 20, CX + NICHE_A + 20):
        dxb = x - bx
        br = band(y, SILL + 38, SILL + 120) & (np.abs(dxb) < 26 - (y - SILL - 38) * 0.12)
        sc = np.hypot(dxb, y - (SILL + 92))
        bh = 40 + 6 * np.cos(sc / 5) * (sc < 22) - 6 * np.clip((np.abs(dxb) - 16) / 8, 0, 1)
        h = np.where(br, bh, h)
    # dado panel under the shelf
    pnl = band(y, 1290, 1392) & (ax < 300)
    inner = band(y, 1306, 1376) & (ax < 284)
    h = np.where(pnl, 12.0, h)
    h = np.where(inner, 6.0, h)

    # --- columns (half on each edge)
    d = DCOL
    t = np.clip((y - SHAFT[0]) / (SHAFT[1] - SHAFT[0]), 0, 1)
    r = R_TOP + (R_BOT - R_TOP) * t ** 1.3
    shaft = band(y, *SHAFT) & (np.abs(d) < r)
    th = np.arcsin(np.clip(d / r, -1, 1))
    u = (th * 24 / (2 * math.pi)) % 1.0
    flute = np.where(np.abs(u - 0.5) < 0.38, 9 * np.sqrt(np.clip(1 - ((u - 0.5) / 0.38) ** 2, 0, 1)), 0)
    # flutes end in rounded tops and bottoms
    ends = np.clip((y - SHAFT[0] - 24) / 30, 0, 1) * np.clip((SHAFT[1] - 30 - y) / 30, 0, 1)
    ch = 40 + np.sqrt(np.clip(r * r - d * d, 0, None)) - flute * ends
    h = np.where(shaft, ch, h)
    kind = np.where(shaft, 1, kind)
    # astragal ring under the capital
    rr = R_TOP + 8
    neck = band(y, *NECK) & (np.abs(d) < rr)
    h = np.where(neck, 40 + np.sqrt(np.clip(rr * rr - d * d, 0, None)) + 5 * np.sin((y - NECK[0]) / 12 * math.pi), h)
    kind = np.where(neck, 1, kind)
    # capital: a bell flaring upward, two rows of acanthus leaves, volutes at the corners
    ct = (CAPITAL[1] - y) / (CAPITAL[1] - CAPITAL[0])          # 0 at the bottom, 1 at the top
    rb = R_TOP + 34 * np.clip(ct, 0, 1) ** 1.6
    cap = band(y, *CAPITAL) & (np.abs(d) < rb + 18)
    bell = 40 + np.sqrt(np.clip(rb * rb - d * d, 0, None))
    thc = np.arcsin(np.clip(d / (rb + 18), -1, 1))
    leaves = np.zeros_like(h)
    for row_, (n_off, top_t, amp) in enumerate(((0.0, 0.55, 22.0), (0.5, 0.85, 16.0))):
        ph = (thc / (math.pi / 4) + n_off) % 1.0 - 0.5            # -0.5..0.5 across one leaf
        lt = np.clip(ct / top_t, 0, 1)
        wid = 0.42 * np.clip(np.sin(lt * math.pi), 0, 1) ** 0.5 + 0.02
        inside = (np.abs(ph) < wid) & (ct < top_t)
        lobe = 0.5 + 0.5 * np.cos(np.abs(ph) / wid * math.pi * 3) * 0.35
        curl = np.exp(-((ct - top_t * 0.9) / 0.08) ** 2) * 10
        midrib = 3 * np.exp(-(ph / 0.03) ** 2)
        val = amp * np.sqrt(np.clip(1 - (ph / wid) ** 2, 0, 1)) * lobe + curl + midrib
        leaves = np.where(inside, np.maximum(leaves, val + row_ * 4), leaves)
    cv = np.maximum(bell, 40 + np.sqrt(np.clip((rb + 6) ** 2 - d * d, 0, None)) * 0.9 + leaves)
    h = np.where(cap & ((np.abs(d) < rb) | (leaves > 0)), cv, h)
    kind = np.where(cap & ((np.abs(d) < rb) | (leaves > 0)), 1, kind)
    for sgn in (-1, 1):
        vx = np.where(XS < W / 2, sgn * (R_TOP + 34), W + sgn * (R_TOP + 34))
        vd = np.hypot(XS - vx, y - 366)
        va = np.arctan2(y - 366, XS - vx)
        spiral = np.cos(2 * math.pi * (vd / 6.5 - va / (2 * math.pi)))
        vol = vd < 24
        h = np.where(vol, 40 + R_TOP + 34 + 8 * np.sqrt(np.clip(1 - (vd / 24) ** 2, 0, 1)) + 4 * spiral, h)
        kind = np.where(vol, 1, kind)
    # abacus, with concave sides
    aw = R_TOP + 54 - 10 * np.sin((y - ABACUS[0]) / 25 * math.pi)
    ab = band(y, *ABACUS) & (np.abs(d) < aw)
    h = np.where(ab, 40 + R_TOP + 40 + 4 * np.sin((y - ABACUS[0]) / 25 * math.pi), h)
    kind = np.where(ab, 1, kind)
    # attic base: torus, scotia, torus, square plinth
    def ring(top, bot, rad, amp, sign=1):
        m = band(y, top, bot) & (np.abs(d) < rad)
        v = 40 + np.sqrt(np.clip(rad * rad - d * d, 0, None)) + sign * amp * np.sin((y - top) / (bot - top) * math.pi)
        return m, v
    for top, bot, rad, amp, sg in ((1395, 1422, R_BOT + 12, 8, 1), (1422, 1440, R_BOT + 4, 5, -1),
                                   (1440, 1472, R_BOT + 22, 10, 1)):
        m, v = ring(top, bot, rad, amp, sg)
        h = np.where(m, v, h)
        kind = np.where(m, 1, kind)
    pl = band(y, 1472, FLOOR) & (np.abs(d) < R_BOT + 30)
    h = np.where(pl, 40 + R_BOT + 30 - 6 * np.clip((1480 - y) / 8, 0, 1), h)
    kind = np.where(pl, 1, kind)

    # --- entablature across the top
    ent = y < ARCHITRAVE[1]
    kind = np.where(ent, 4, kind)
    a0 = ARCHITRAVE[0]
    h = np.where(band(y, a0 + 50, ARCHITRAVE[1]), 46.0, h)
    h = np.where(band(y, a0 + 25, a0 + 50), 52.0, h)
    h = np.where(band(y, a0 + 5, a0 + 25), 58.0, h)
    h = np.where(band(y, a0, a0 + 5), 62 + 2 * np.sin((y - a0) / 5 * math.pi), h)
    fr = frieze_relief()
    f0 = FRIEZE[0] + 8
    fz = band(y, *FRIEZE)
    relief = np.zeros_like(h)
    relief[f0:f0 + fr.shape[0]] = fr
    # plain blocks over the columns hide where one bay's frieze meets the next
    block = np.abs(DCOL) < 80
    rel = np.where(block, 0.0, relief * 9)
    blockface = np.where(block, 8.0 + 6 * np.exp(-((np.abs(DCOL) / 22) ** 2 + ((y - 195) / 22) ** 2)), 0)
    h = np.where(fz, 56 + rel + blockface - 3 * (band(y, FRIEZE[0], FRIEZE[0] + 4) | band(y, FRIEZE[1] - 4, FRIEZE[1])), h)
    # egg and dart
    ex = (x % 40) - 20
    eg = band(y, *EGG)
    egg = 6 * np.sqrt(np.clip(1 - (ex / 13) ** 2 - ((y - EGG[0] - 6) / 7) ** 2, 0, 1))
    h = np.where(eg, 64 + egg, h)
    # dentils
    dx_ = (x % 30)
    dn = band(y, *DENTILS)
    h = np.where(dn, np.where(dx_ < 19, 74.0, 66.0), h)
    # corona and top moulding
    h = np.where(band(y, CORNICE[0] + 26, CORNICE[1]), 92 - 4 * (band(y, CORNICE[1] - 6, CORNICE[1])), h)
    h = np.where(band(y, CORNICE[0], CORNICE[0] + 26), 92 + 8 * np.sin((y - CORNICE[0]) / 26 * math.pi), h)
    ceil = y < CORNICE[0]
    h = np.where(ceil, 70.0, h)
    kind = np.where(ceil, 6, kind)

    # floor
    fl = y >= FLOOR
    h = np.where(fl, 0.0, h)
    kind = np.where(fl, 5, kind)
    return h, kind


def albedo(kind):
    tex = wrap_fbm(140, 4, 3)
    fine = wrap_fbm(18, 2, 5)
    stone = np.array([0.80, 0.60, 0.38], np.float32)
    col = stone[None, None, :] * (0.88 + 0.16 * tex + 0.08 * fine)[..., None]
    column = np.array([0.86, 0.67, 0.45], np.float32)[None, None, :] * (0.92 + 0.1 * fine)[..., None]
    col = np.where((kind == 1)[..., None], column, col)
    back = np.array([0.34, 0.10, 0.065], np.float32)[None, None, :] * (0.9 + 0.14 * tex)[..., None]
    col = np.where((kind == 2)[..., None], back, col)
    ceil = np.array([0.20, 0.14, 0.09], np.float32)
    col = np.where((kind == 6)[..., None], ceil, col)
    return col


def floor_colour():
    """Polished two-tone marble, tiles a sixth of a bay wide so bays join."""
    y, x = YS, XS
    fy = np.clip((y - FLOOR) / (H - FLOOR), 0, 1)
    edges = [0.0, 0.07, 0.17, 0.32, 0.53, 0.80, 1.01]
    row = np.zeros_like(y)
    for e in edges[1:-1]:
        row += fy >= e
    tile = np.floor(x / 180)
    dark = ((row + tile) % 2) == 1
    vein = wrap_fbm(70, 5, 11)
    v = np.exp(-((vein - 0.5) / 0.03) ** 2)
    light = np.array([0.44, 0.36, 0.27]) * (0.92 + 0.12 * vein[..., None]) * (1 - 0.25 * v[..., None])
    darkc = np.array([0.07, 0.045, 0.035]) * (0.9 + 0.3 * vein[..., None]) + 0.06 * v[..., None]
    col = np.where(dark[..., None], darkc, light)
    joint = np.zeros_like(y, bool)
    for e in edges[1:-1]:
        joint |= np.abs(fy - e) * (H - FLOOR) < 1.2
    joint |= (np.abs((x % 180) - 0) < 1.0) | (np.abs((x % 180) - 180) < 1.0)
    col = np.where(joint[..., None], col * 0.5, col)
    return col.astype(np.float32)


def light(h, kind):
    L = np.array([-0.42, -0.60, 0.68], np.float32)
    L /= np.linalg.norm(L)
    hs = blur(h, 0.8)
    gy, gx = np.gradient(hs)
    n = np.dstack([-gx, -gy, np.ones_like(gx)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    diff = np.clip((n * L).sum(-1), 0, 1)
    # cast shadows: march toward the light; anything standing higher blocks it
    rise = L[2] / math.hypot(L[0], L[1])
    sx, sy = L[0] / math.hypot(L[0], L[1]), L[1] / math.hypot(L[0], L[1])
    lit = np.ones_like(h)
    for step in range(2, 200, 3):
        o = shift(h, -int(round(sy * step)), -int(round(sx * step)))
        lit = np.minimum(lit, np.clip(1 - (o - h - step * rise) / 6, 0, 1))
    lit = blur(lit, 2.0) * 0.85 + 0.15 * lit
    # ambient occlusion from the height map
    ao = np.clip(1 - np.maximum(0, blur(h, 40) - h) / 140, 0.35, 1) * np.clip(1 - np.maximum(0, blur(h, 6) - h) / 18, 0.45, 1)
    # a soft key light from the upper left, brightest on the niche; a spotlight inside it
    y, x = YS, XS
    pool = np.exp(-((DXC / 640) ** 2 + ((y - 820) / 900) ** 2))
    key = 0.16 + 1.05 * pool
    spot = 1.3 * np.exp(-((DXC / 230) ** 2 + ((y - 960) / 330) ** 2)) * ((kind == 2) | (kind == 3))
    spot += 0.6 * np.exp(-((DXC / 330) ** 2 + ((y - SILL) / 40) ** 2))
    top = 0.38 + 0.62 * np.clip(y / 560, 0, 1)
    return diff, lit, ao, key, spot, top


def tone(c):
    c = 1 - np.exp(-np.maximum(c, 0) * 1.45)
    return np.clip(c ** 1.06, 0, 1)


def render_architecture():
    h, kind = architecture()
    col = albedo(kind)
    diff, lit, ao, key, spot, top = light(h, kind)
    shade = (0.06 * ao + 1.2 * diff * lit * key * ao + 0.9 * spot * ao) * top
    out = col * shade[..., None]
    # warm grade like the building at golden hour
    out *= np.array([1.05, 0.93, 0.78], np.float32)
    # floor: marble, lit from above with a pool in front of the niche, plus a soft reflection
    fl = YS >= FLOOR
    fcol = floor_colour()
    fpool = np.exp(-((DXC / 560) ** 2 + ((YS - (FLOOR + 100)) / 260) ** 2))
    fshade = (0.08 + 0.95 * fpool) * (1 - 0.55 * np.clip((YS - FLOOR) / (H - FLOOR), 0, 1))
    # the column feet and the wall's own shadow along the floor line
    fshade *= 0.55 + 0.45 * np.clip((YS - FLOOR) / 26, 0, 1)
    fimg = fcol * fshade[..., None] * np.array([1.0, 0.92, 0.8], np.float32)
    mir = np.clip(2 * FLOOR - YS, 0, H - 1).astype(int)
    refl = out[mir, XS.astype(int)]
    refl = np.dstack([blur(refl[..., i], 3) for i in range(3)])
    rfade = np.exp(-(YS - FLOOR) / 170)[..., None]
    fimg = fimg + refl * 0.42 * rfade
    out = np.where(fl[..., None], fimg, out)
    return tone(out)


# ----------------------------------------------------------- the pieces
def load_piece(name):
    im = Image.open(os.path.join(ART, name + '.webp')).convert('RGBA')
    sh = Image.open(os.path.join(ART, name + '-shadow.webp')).convert('L')
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 40)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return im, sh, box


def riser(img, cx, bottom, wid, hgt):
    """A small block of dark polished stone for a piece to stand on; returns its top."""
    if hgt <= 0:
        return bottom
    d = ImageDraw.Draw(img)
    wid, hgt = int(wid), int(hgt)
    x0, top = int(cx - wid / 2), int(bottom - hgt)
    yy = np.linspace(0, 1, hgt)[:, None]
    xx = np.linspace(-1, 1, wid)[None, :]
    nz = fbm(hgt, wid, 30, 3, seed=hgt)
    lum = (1.15 - 0.6 * yy) * (1 - 0.35 * xx ** 2) * (0.85 + 0.3 * nz) + 0.5 * np.exp(-((xx + 0.55) / 0.12) ** 2)
    face = np.array([0.26, 0.17, 0.12])[None, None, :] * lum[..., None]
    img.alpha_composite(to_img(tone(face)).convert('RGBA'), (x0, top))
    d.rectangle([x0 - 4, top - 3, x0 + wid + 4, top + 6], fill=(176, 132, 64, 255))
    d.line([x0 - 4, top - 3, x0 + wid + 4, top - 3], fill=(236, 200, 120, 255), width=2)
    d.rectangle([x0 - 6, bottom - 10, x0 + wid + 6, bottom], fill=(40, 26, 18, 255))
    d.line([x0 - 6, bottom - 10, x0 + wid + 6, bottom - 10], fill=(150, 112, 60, 255), width=2)
    return top - 2


def place_piece(img, name, cx, bottom, max_w, max_h, stand=False):
    im, sh, (bx0, by0, bx1, by1) = load_piece(name)
    k = min(max_w / (bx1 - bx0), max_h / (by1 - by0))
    size = (max(1, round(im.width * k)), max(1, round(im.height * k)))
    im = im.resize(size, Image.LANCZOS)
    sh = sh.resize(size, Image.LANCZOS)
    ox = int(round(cx - (bx0 + bx1) / 2 * k))
    oy = int(round(bottom - by1 * k))
    # contact shadow on the shelf
    cs = Image.new('RGBA', img.size, (0, 0, 0, 0))
    w = (bx1 - bx0) * k
    ImageDraw.Draw(cs).ellipse([cx - w * 0.52, bottom - 14, cx + w * 0.52, bottom + 12], fill=(10, 4, 2, 170))
    img.alpha_composite(cs.filter(ImageFilter.GaussianBlur(10)))
    # the piece's own soft shadow from its photo
    dark = Image.new('RGBA', size, (14, 6, 3, 255))
    dark.putalpha(sh.point(lambda v: int(v * 0.8)))
    img.alpha_composite(dark, (ox, oy))
    if stand:
        d = ImageDraw.Draw(img)
        d.rectangle([cx - 4, bottom - (by1 - by0) * k * 0.55, cx + 4, bottom], fill=(120, 88, 40, 255))
    # warm the piece a touch so it sits in the gallery light
    arr = np.asarray(im).astype(np.float32)
    arr[..., :3] *= np.array([1.03, 0.97, 0.88])
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    img.alpha_composite(im, (ox, oy))
    if stand:
        d = ImageDraw.Draw(img)
        for sx in (-1, 1):
            hx = cx + sx * w * 0.22
            d.rounded_rectangle([hx - 7, bottom - 18, hx + 7, bottom + 1], radius=3, fill=(150, 112, 52, 255),
                                outline=(205, 165, 90, 255))


def plaque(img):
    d = ImageDraw.Draw(img)
    pw, ph = 190, 56
    x0, y0 = CX - pw / 2, 1341 - ph / 2
    d.rectangle([x0 + 3, y0 + 4, x0 + pw + 3, y0 + ph + 4], fill=(30, 14, 8, 255))
    d.rectangle([x0, y0, x0 + pw, y0 + ph], fill=(150, 112, 52, 255))
    d.rectangle([x0 + 5, y0 + 5, x0 + pw - 5, y0 + ph - 5], outline=(214, 176, 100, 255), width=2)
    for i, ln in enumerate((0.72, 0.5, 0.6)):
        yy = y0 + 17 + i * 11
        d.line([CX - pw * ln / 2, yy, CX + pw * ln / 2, yy], fill=(92, 64, 26, 255), width=3)


# the order the camera passes them: one culture after another, round and round
PIECES = [
    # name, max width, max height, riser height, on a stand
    ('eg_canopic', 470, 640, 0, False),
    ('fr_armor', 560, 760, 0, False),
    ('it_augustus', 400, 440, 170, False),
    ('pe_lion', 540, 420, 120, False),
    ('is_jug', 520, 520, 70, False),
    ('eg_hippo', 560, 360, 140, False),
    ('fr_reliquary', 500, 540, 80, False),
    ('it_bowl', 520, 520, 0, True),
    ('pe_plate', 540, 540, 0, True),
    ('is_bottle', 440, 520, 70, False),
    ('eg_cat', 500, 620, 0, False),
    ('fr_sevres', 540, 440, 110, False),
    ('it_helmet', 540, 470, 130, False),
    ('pe_rhyton', 420, 620, 40, False),
    ('is_seal', 500, 360, 150, False),
]

_ARCH = None


def bay(i):
    global _ARCH
    if _ARCH is None:
        _ARCH = to_img(render_architecture()).convert('RGBA')
    img = _ARCH.copy()
    plaque(img)
    name, mw, mh, rise, stand = PIECES[i]
    top = riser(img, CX, SILL, min(mw * 0.82, 440), rise)
    place_piece(img, name, CX, top, mw, mh, stand)
    return img.convert('RGB')


def main(only=None):
    os.makedirs(OUT, exist_ok=True)
    for i, piece in enumerate(PIECES):
        if only is not None and i not in only:
            continue
        img = bay(i)
        for w in (1440, 1080, 720):
            hh = int(w * H / W)
            img.resize((w, hh), Image.LANCZOS).save(os.path.join(OUT, f'bay-{i:02d}-{w}.webp'),
                                                    quality=80 if w >= 1080 else 78, method=6)
        print(f'bay-{i:02d} {piece[0]}')


def bays():
    return PIECES


# ------------------------------------------------------------ the timing
LOOP = 120.0          # seconds for the whole loop
DIVE_START = 8.0      # slow push on the building until here
DIVE_END = 11.0       # through the doorway
MUSEUM = 11.3         # first exhibit centred
SLOT = 6.8            # seconds per exhibit
DWELL = 4.4           # of which this long looking at it
DRIFT = 0.07          # slow drift while looking, in bay widths
EXIT = 112.0          # last look ends; fade back outside
EASE = 'cubic-bezier(0.45, 0, 0.25, 1)'


def pct(t):
    return f'{t / LOOP * 100:.3f}%'.replace('.000%', '%')


def css():
    n = len(bays())
    # camera position p(t) in bay widths at each key time, with the easing that leads out of it
    keys = [(0.0, 0.0, 'linear'), (MUSEUM, 0.0, 'linear')]
    for k in range(n):
        t0 = MUSEUM + k * SLOT
        keys.append((t0 + DWELL, k + DRIFT, EASE if k < n - 1 else 'linear'))
        if k < n - 1:
            keys.append((t0 + SLOT, k + 1.0, 'linear'))
    keys.append((LOOP, n - 1 + DRIFT, 'linear'))
    out = []
    for b in range(n):
        # the gallery wraps around: after the last piece comes the first again
        def pos(p):
            return min((v - p for v in (b - n, b, b + n)), key=abs)
        near = [abs(pos(p)) < 3.4 for _, p, _ in keys]
        out.append(f'@keyframes archBay{b} {{')
        for i, (t, p, ease) in enumerate(keys):
            keep = i in (0, len(keys) - 1) or near[i] or near[i - 1] or near[i + 1]
            if not keep:
                continue
            vis = 'visible' if near[i] else 'hidden'
            out.append(f'{pct(t)} {{ transform: translateX({pos(p) * 100:.1f}%); visibility: {vis}; '
                       f'animation-timing-function: {ease}; }}')
        out.append('}')
    for b in range(n):
        out.append(f'.arch-hero.is-ready .arch-bay:nth-child({b + 1}) {{ animation-name: archBay{b}; }}')
    # a gentle push in while looking at each piece, back out while walking
    out.append('@keyframes archCam {')
    out.append(f'0% {{ transform: scale(1.14); animation-timing-function: linear; }}')
    out.append(f'{pct(DIVE_END - 1.0)} {{ transform: scale(1.14); animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1); }}')
    for k in range(n):
        t0 = MUSEUM + k * SLOT
        out.append(f'{pct(t0)} {{ transform: scale(1); animation-timing-function: ease-in-out; }}')
        out.append(f'{pct(t0 + DWELL)} {{ transform: scale(1.045); animation-timing-function: ease-in-out; }}')
    out.append(f'100% {{ transform: scale(1.06); }}')
    out.append('}')
    return '\n'.join(out)


if __name__ == '__main__':
    if sys.argv[1:] == ['--css']:
        print(css())
    else:
        main([int(a) for a in sys.argv[1:]] or None)
