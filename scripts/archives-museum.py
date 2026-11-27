"""Draws the museum gallery panels for the animated hero on /archives.

Each panel is one bay of the gallery: wall, spotlight, floor and one exhibit
(a vase on a plinth, a piece in a glass case, or a framed relief on the wall).
Panels share their edges (a pilaster on each side), so they line up into one
long gallery that the page slides past.

Run from the repo root (needs Python 3 with Pillow and numpy):
    python3 scripts/archives-museum.py
It writes assets/archives/bay-NN-{720,1080,1440}.webp, and with --css it
prints the hero's timing keyframes (pasted into archives/index.html between
the museum:start and museum:end comments).
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'archives')
SRC = os.path.join(OUT, 'building-1254.webp')

W, H = 1440, 1920           # working size; saved at 1080x1440 and 720x960
FLOOR = int(H * 0.79)       # where the wall meets the floor
RNG = np.random.default_rng(7)


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


def env(r):
    """A warm gallery 'environment' for metal reflections: a soft key light up
    and to the left, a dim fill on the right, dark floor below."""
    x, y, z = r[..., 0], r[..., 1], r[..., 2]
    key = np.exp(-((x + 0.45) ** 2 + (y + 0.75) ** 2) / 0.09) * 3.2
    key2 = np.exp(-((x - 0.55) ** 2 + (y + 0.35) ** 2) / 0.05) * 1.1
    sky = smooth(0.4, -0.9, y) * 0.45
    floor = smooth(0.2, 0.9, y) * 0.08
    band = np.exp(-((y + 0.05) ** 2) / 0.004) * 0.35 * (z > -0.2)
    v = key + key2 + sky + floor + band + 0.12
    return v[..., None] * np.array([1.0, 0.86, 0.66])


LIGHT = norm(np.array([-0.45, -0.75, 0.55]))


# ------------------------------------------------- surfaces of revolution
def revolve(profile, h, material, pattern=None, rim=True, ss=1):
    """Render a vase-like object around a vertical axis.

    profile: array of radii (pixels) for each row 0..h-1 (0 = no surface).
    material: 'terracotta' | 'gold' | 'bronze' | 'marble' | 'white'
    pattern(u, v, x) -> (color array or None, mask 0..1) to paint the body.
    Returns an RGBA image (w = 2*max radius + margin).
    """
    r = np.asarray(profile, float)
    rmax = r.max()
    w = int(rmax * 2 + 8)
    cx = w / 2
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    xs = xs + 0.5 - cx
    rr = r[ys.astype(int)]
    inside = np.abs(xs) < rr
    z = np.sqrt(np.maximum(rr ** 2 - xs ** 2, 0))
    dr = np.gradient(r)[ys.astype(int)]
    rho = np.maximum(rr, 1e-6)
    n = norm(np.dstack([xs / rho, -dr, z / rho]))
    u = np.arcsin(np.clip(xs / rho, -1, 1))      # -pi/2..pi/2 across the front
    v = ys
    ndl = np.clip((n * LIGHT).sum(-1), 0, 1)
    view = np.array([0, 0, 1.0])
    refl = 2 * n[..., 2:3] * n - view
    fres = (1 - np.clip(n[..., 2], 0, 1)) ** 3

    if material in ('gold', 'bronze'):
        tint = np.array([1.0, 0.78, 0.38]) if material == 'gold' else np.array([0.78, 0.52, 0.30])
        col = env(refl) * tint * (0.85 if material == 'gold' else 0.6)
        col += tint * (0.10 + 0.45 * ndl[..., None]) * (0.9 if material == 'gold' else 0.6)
        if material == 'bronze':
            patina = fbm(h, w, 40, 4, seed=3)
            pm = smooth(0.55, 0.75, patina)[..., None] * 0.55
            col = col * (1 - pm) + pm * (np.array([0.20, 0.36, 0.30]) * (0.3 + ndl[..., None]))
    else:
        if material == 'terracotta':
            base = np.array([0.72, 0.36, 0.18])
            gloss, rough = 0.35, 18
        elif material == 'marble':
            noise = fbm(h, w, 90, 5, seed=11)
            veins = np.abs(np.sin((xs * 0.012 + ys * 0.02 + noise * 6.0)))
            veins = 1 - smooth(0.0, 0.08, veins) * 0.0
            vein = (1 - smooth(0.0, 0.09, np.abs(np.sin(xs * 0.012 + ys * 0.02 + noise * 9)))) * 0.55
            base = np.array([0.78, 0.75, 0.70])[None, None, :] - vein[..., None] * np.array([0.42, 0.43, 0.45])
            gloss, rough = 0.3, 40
        else:  # white-ground ceramic
            base = np.array([0.90, 0.85, 0.74])
            gloss, rough = 0.4, 30
        base = np.broadcast_to(base, (h, w, 3)).copy()
        if pattern is not None:
            pc, pm = pattern(u, v, xs)
            base = base * (1 - pm[..., None]) + pc * pm[..., None]
            gloss_m = gloss + 0.25 * pm
        else:
            gloss_m = np.full((h, w), gloss)
        spec = np.clip((refl * LIGHT).sum(-1), 0, 1) ** rough * gloss_m
        spec += np.exp(-((refl[..., 0] - 0.6) ** 2 + (refl[..., 1] + 0.3) ** 2) / 0.02) * 0.15 * gloss_m
        amb = 0.16 + 0.10 * (n[..., 1] < 0)
        col = base * (amb + 0.95 * ndl)[..., None] + spec[..., None] * np.array([1.0, 0.93, 0.8])
        col += fres[..., None] * np.array([0.25, 0.18, 0.1]) * 0.6

    # contact shadow toward the bottom, and a soft dark edge
    yb = np.where(r > 0)[0]
    bottom = yb.max() if len(yb) else h
    ao = 1 - 0.35 * smooth(bottom - 30, bottom, ys)
    col = col * ao[..., None]
    alpha = np.clip(rr - np.abs(xs) + 0.5, 0, 1) * inside
    img = to_img(col, alpha)

    if rim:
        top = yb.min()
        rt = r[top]
        d = ImageDraw.Draw(img)
        e = max(4, rt * 0.22)
        d.ellipse([cx - rt, top - e, cx + rt, top + e], fill=(25, 16, 10, 255))
        inner = rt * 0.86
        d.ellipse([cx - inner, top - e * 0.82, cx + inner, top + e * 0.82], fill=(10, 6, 4, 255))
        rim_col = (235, 200, 140, 255) if material in ('gold', 'bronze') else (205, 150, 110, 255)
        d.arc([cx - rt, top - e, cx + rt, top + e], 180, 360, fill=rim_col, width=max(2, int(rt * 0.04)))
    return img


def profile_from(points, h):
    """points: list of (y fraction, radius) -> smooth profile of length h."""
    ys = np.array([p[0] for p in points]) * (h - 1)
    rs = np.array([p[1] for p in points])
    yy = np.arange(h)
    r = np.interp(yy, ys, rs)
    sigma = max(3, h * 0.018)
    k = int(sigma * 3)
    g = np.exp(-np.arange(-k, k + 1) ** 2 / (2 * sigma ** 2))
    g /= g.sum()
    r = np.convolve(np.pad(r, k, mode='edge'), g, 'same')[k:-k]
    r[: int(ys[0])] = 0
    r[int(ys[-1]) + 1:] = 0
    return r


def tube(img, pts, width, dark, light):
    """A shaded round handle along a list of points."""
    d = ImageDraw.Draw(img)
    for i, f in enumerate((1.0, 0.8, 0.6, 0.4, 0.22)):
        t = i / 4
        col = tuple(int(dark[c] + (light[c] - dark[c]) * t) for c in range(3)) + (255,)
        off = -(width * (1 - f)) * 0.35
        d.line([(x + off, y + off) for x, y in pts], fill=col, width=max(1, int(width * f)), joint='curve')


def meander(u, v, y0, y1, scale, phase=0.0):
    """Greek key band between rows y0..y1. Returns a 0..1 mask of black glaze."""
    band = (v >= y0) & (v <= y1)
    s = (u * scale + phase) % 1.0
    t = (v - y0) / max(y1 - y0, 1)
    key = ((s < 0.18) | ((t < 0.2) & (s < 0.75)) | ((t > 0.8) & (s > 0.25)) |
           ((s > 0.55) & (s < 0.73) & (t > 0.2) & (t < 0.65)) | ((t > 0.45) & (t < 0.62) & (s > 0.36) & (s < 0.73)))
    return (band & key).astype(float)


# ----------------------------------------------------------------- objects
def amphora():
    h = 820
    pts = [(0.0, 74), (0.03, 74), (0.05, 58), (0.2, 52), (0.27, 100), (0.34, 160), (0.42, 176),
           (0.55, 166), (0.7, 120), (0.82, 66), (0.88, 50), (0.93, 62), (0.97, 84), (1.0, 84)]
    prof = profile_from(pts, h)

    def pat(u, v, x):
        black = np.array([0.06, 0.04, 0.03])
        m = ((v < h * 0.25) | (v > h * 0.79)).astype(float)
        m = np.maximum(m, meander(u, v, h * 0.285, h * 0.33, 3.2))
        m = np.maximum(m, ((v > h * 0.335) & (v < h * 0.342)).astype(float))
        rays = ((v > h * 0.66) & (v < h * 0.77))
        s_ = (u * 5.2) % 1.0
        tip = (v - h * 0.66) / (h * 0.11)
        m = np.maximum(m, (rays & (np.abs(s_ - 0.5) < 0.5 * tip)).astype(float))
        m = np.maximum(m, ((v > h * 0.645) & (v < h * 0.652)).astype(float))
        panel = (v > h * 0.37) & (v < h * 0.62) & (np.abs(u) < 0.95)
        fu, fv = u / 0.95, (v - h * 0.37) / (h * 0.25)
        fig = np.zeros_like(v, bool)
        for cxu, flip in ((-0.36, 1), (0.36, -1)):
            du = (fu - cxu) * flip
            head = (du ** 2 + ((fv - 0.12) * 1.5) ** 2) < 0.010
            crest = (np.abs(du + 0.02) < 0.11) & (np.abs(fv - 0.04 + du * 0.2) < 0.025)
            body = (np.abs(du + (fv - 0.3) * 0.12) < 0.065) & (fv > 0.18) & (fv < 0.6)
            legs = (np.abs(np.abs(du + 0.01) - (fv - 0.58) * 0.32) < 0.04) & (fv > 0.56) & (fv < 0.97)
            shield = ((du - 0.12) ** 2 + ((fv - 0.42) * 1.15) ** 2) < 0.03
            spear = (np.abs(du + 0.2 - fv * 0.42) < 0.011) & (fv > 0.0) & (fv < 0.96)
            fig |= head | crest | body | legs | shield | spear
        ring = (((fu) ** 2 + ((fv - 0.45) * 1.15) ** 2) < 0.012) & (((fu) ** 2 + ((fv - 0.45) * 1.15) ** 2) > 0.006)
        fig |= ring
        m = np.maximum(m, (panel & fig).astype(float))
        return black, m
    body = revolve(prof, h, 'terracotta', pat)
    img = Image.new('RGBA', (body.width + 120, h), (0, 0, 0, 0))
    cx = img.width / 2
    for side in (-1, 1):
        pts = []
        for i in range(33):
            t = i / 32 * math.pi
            x = cx + side * (52 + 118 * math.sin(t) ** 0.8)
            y = h * 0.065 + (h * 0.235) * (1 - math.cos(t)) / 2 - 26 * math.sin(t)
            pts.append((x, y))
        tube(img, pts, 22, (22, 12, 8), (120, 66, 40))
    img.alpha_composite(body, (60, 0))
    return img


def chalice():
    h = 700
    pts = [(0.0, 150), (0.05, 148), (0.25, 120), (0.38, 70), (0.44, 26), (0.5, 20), (0.56, 34),
           (0.6, 22), (0.84, 26), (0.92, 80), (1.0, 120)]
    prof = profile_from(pts, h)
    return revolve(prof, h, 'gold')


def krater():
    h = 620
    pts = [(0.0, 230), (0.06, 222), (0.14, 200), (0.3, 196), (0.55, 170), (0.72, 110),
           (0.78, 60), (0.86, 56), (0.92, 96), (1.0, 104)]
    prof = profile_from(pts, h)
    body = revolve(prof, h, 'bronze')
    img = Image.new('RGBA', (body.width + 100, h), (0, 0, 0, 0))
    cx = img.width / 2
    for side in (-1, 1):
        pts2 = []
        for i in range(25):
            t = i / 24 * math.pi
            pts2.append((cx + side * (196 + 62 * math.sin(t)), h * 0.10 + h * 0.30 * (1 - math.cos(t)) / 2))
        tube(img, pts2, 20, (40, 26, 14), (200, 150, 90))
    img.alpha_composite(body, (50, 0))
    return img


def lekythos():
    h = 880
    pts = [(0.0, 46), (0.05, 40), (0.12, 22), (0.2, 22), (0.24, 70), (0.28, 92), (0.8, 84),
           (0.86, 60), (0.9, 34), (0.94, 50), (1.0, 56)]
    prof = profile_from(pts, h)

    def pat(u, v, x):
        black = np.array([0.07, 0.05, 0.04])
        gold = np.array([0.80, 0.58, 0.22])
        m = ((v < h * 0.26) | (v > h * 0.84)).astype(float)
        m = np.maximum(m, meander(u, v, h * 0.30, h * 0.34, 2.6))
        m = np.maximum(m, meander(u, v, h * 0.76, h * 0.80, 2.6, 0.5))
        # gold palmette/leaf garland in the middle
        leaf = (v > h * 0.42) & (v < h * 0.66)
        s = (u * 4) % 1.0
        t = (v - h * 0.42) / (h * 0.24)
        petal = ((s - 0.5) ** 2 * 6 + (t - 0.5 - 0.3 * np.sin(s * 6.28)) ** 2) < 0.06
        col = np.where((leaf & petal)[..., None], gold, black)
        m = np.maximum(m, (leaf & petal).astype(float))
        return col, m
    return revolve(prof, h, 'white', pat)


def marble_urn():
    h = 760
    pts = [(0.0, 126), (0.035, 126), (0.06, 104), (0.12, 96), (0.2, 150), (0.36, 182), (0.5, 170),
           (0.64, 120), (0.74, 62), (0.82, 52), (0.88, 70), (0.93, 112), (1.0, 116)]
    prof = profile_from(pts, h)
    body = revolve(prof, h, 'marble')
    img = Image.new('RGBA', (body.width + 80, h), (0, 0, 0, 0))
    cx = img.width / 2
    for side in (-1, 1):
        pts2 = []
        for i in range(25):
            t = i / 24 * math.pi
            pts2.append((cx + side * (150 + 46 * math.sin(t)), h * 0.17 + h * 0.13 * (1 - math.cos(t)) / 2))
        tube(img, pts2, 18, (70, 66, 60), (210, 204, 192))
    img.alpha_composite(body, (40, 0))
    return img


def column_drum():
    """A fluted marble column fragment on a square base."""
    h, rad, flutes = 760, 170, 20
    w = rad * 2 + 8
    cx = w / 2
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    xs = xs + 0.5 - cx
    inside = np.abs(xs) < rad
    u = np.arcsin(np.clip(xs / rad, -1, 1))
    z = np.sqrt(np.maximum(rad ** 2 - xs ** 2, 0))
    ph = (u * flutes / math.pi) % 1.0
    tilt = np.cos(ph * 2 * math.pi) * 0.55 * np.sign(np.sin(ph * 2 * math.pi) + 1e-9)
    tilt = np.sin(ph * 2 * math.pi) * 0.6
    nx = np.sin(u + tilt * 0.5)
    nz = np.cos(u + tilt * 0.5)
    n = norm(np.dstack([nx, np.zeros_like(nx), nz]))
    ndl = np.clip((n * LIGHT).sum(-1), 0, 1)
    noise = fbm(h, w, 70, 5, seed=21)
    vein = (1 - smooth(0.0, 0.05, np.abs(np.sin(xs * 0.008 - ys * 0.012 + noise * 8)))) * 0.3
    base = np.array([0.92, 0.88, 0.82])[None, None, :] - vein[..., None] * 0.35
    groove = (1 - np.abs(np.cos(ph * math.pi))) ** 6
    col = base * (0.18 + 0.9 * ndl)[..., None] * (1 - 0.25 * groove[..., None])
    # broken top edge
    edge = 40 + 26 * value_noise(1, w, 18, 5)[0] + 20 * np.sin(xs[0] / 50)
    alpha = inside & (ys >= edge[None, :])
    col = np.where((ys < edge[None, :] + 10)[..., None], col * 0.75, col)
    img = to_img(col, alpha.astype(float))
    return img


def orb():
    s = 560
    rad = 210
    ys, xs = np.mgrid[0:s, 0:s].astype(float)
    cx, cy = s / 2, s / 2 + 40
    dx, dy = xs - cx, ys - cy
    d2 = dx ** 2 + dy ** 2
    inside = d2 < rad ** 2
    z = np.sqrt(np.maximum(rad ** 2 - d2, 0))
    n = norm(np.dstack([dx, dy, z]))
    refl = 2 * n[..., 2:3] * n - np.array([0, 0, 1.0])
    col = env(refl) * np.array([1.0, 0.78, 0.38]) * 0.85
    # jewelled band around the equator and a meridian
    band = np.abs(dy / rad) < 0.06
    mer = np.abs(dx / rad) < 0.05
    col = np.where((band | mer)[..., None], col * 0.6 + np.array([0.12, 0.05, 0.02]), col)
    alpha = np.clip(rad - np.sqrt(d2) + 0.5, 0, 1)
    img = to_img(col, alpha)
    d = ImageDraw.Draw(img)
    for gx in (-120, -60, 0, 60, 120):
        rr = 13 * math.cos(gx / rad * 1.2)
        colr = (150, 10, 30, 255) if gx % 120 == 0 else (20, 70, 160, 255)
        d.ellipse([cx + gx - rr, cy - rr, cx + gx + rr, cy + rr], fill=colr)
        d.ellipse([cx + gx - rr * 0.4 - 3, cy - rr * 0.6, cx + gx - rr * 0.4 + 2, cy - rr * 0.6 + 5],
                  fill=(255, 240, 230, 255))
    # cross on top
    top = cy - rad
    d.rectangle([cx - 9, top - 110, cx + 9, top + 4], fill=(215, 170, 80, 255))
    d.rectangle([cx - 44, top - 82, cx + 44, top - 66], fill=(215, 170, 80, 255))
    d.line([cx - 3, top - 108, cx - 3, top], fill=(255, 235, 170, 255), width=4)
    return img


def crown():
    w, h = 640, 520
    rad, band_top, band_bot = 260, 250, 380
    img = Image.new('RGBA', (w, h + 60), (0, 0, 0, 0))
    cx = w / 2
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    xs = xs + 0.5 - cx
    inside = np.abs(xs) < rad
    u = np.arcsin(np.clip(xs / rad, -1, 1))
    z = np.sqrt(np.maximum(rad ** 2 - xs ** 2, 0))
    n = norm(np.dstack([xs / rad, np.zeros_like(xs), z / rad]))
    refl = 2 * n[..., 2:3] * n - np.array([0, 0, 1.0])
    gold = env(refl) * np.array([1.0, 0.78, 0.38]) * 0.85
    # spikes along the top edge, seen from slightly above: the band curves
    curve = 34 * np.cos(u)
    k = 8
    s = (u * k / math.pi + 0.5) % 1.0
    spike = np.maximum(0, 1 - np.abs(s - 0.5) * 2.4) * 150
    top = band_top + curve - spike
    bot = band_bot + curve
    front = inside & (ys >= top) & (ys <= bot)
    # back of the crown: the inside of the far band, darker, visible above
    btop = band_top - curve * 0.6 - spike * 0.92
    back = inside & (ys >= btop) & (ys <= band_bot - curve) & ~front
    col = np.where(front[..., None], gold, gold * 0.32)
    alpha = (front | back).astype(float)
    # beaded rims
    rim = (np.abs(ys - (band_bot + curve - 8)) < 6) | (np.abs(ys - (band_top + curve + 6)) < 5)
    col = np.where((rim & front)[..., None], gold * 1.2 + 0.05, col)
    crown_img = to_img(col, alpha)
    img.alpha_composite(crown_img, (0, 0))
    d = ImageDraw.Draw(img)
    mid = (band_top + band_bot) / 2
    for i, uu in enumerate(np.linspace(-1.25, 1.25, 7)):
        x = cx + rad * math.sin(uu)
        y = mid + 34 * math.cos(uu)
        rr = 20 * math.cos(uu) + 4
        colr = [(170, 12, 34), (18, 90, 60), (20, 60, 170)][i % 3]
        d.ellipse([x - rr, y - rr * 1.2, x + rr, y + rr * 1.2], fill=colr + (255,))
        d.ellipse([x - rr * 0.5, y - rr * 0.8, x - rr * 0.1, y - rr * 0.3], fill=(255, 235, 230, 220))
    # pearls on spike tips
    for j in range(-3, 4):
        uu = (j + 0.0) * math.pi / k
        if abs(uu) > 1.45:
            continue
        x = cx + rad * math.sin(uu)
        y = band_top + 34 * math.cos(uu) - 150
        rr = 13 * (0.5 + 0.5 * math.cos(uu))
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(240, 232, 215, 255))
        d.ellipse([x - rr * 0.5, y - rr * 0.6, x, y - rr * 0.1], fill=(255, 255, 255, 255))
    return img


def cushion(wid):
    h = int(wid * 0.32)
    ys, xs = np.mgrid[0:h, 0:wid].astype(float)
    nx = (xs - wid / 2) / (wid / 2)
    ny = (ys - h / 2) / (h / 2)
    d = np.abs(nx) ** 4 + np.abs(ny) ** 2.2
    inside = d < 1
    z = np.sqrt(np.clip(1 - d, 0, 1))
    n = norm(np.dstack([nx * 0.6, ny * 1.2, z]))
    ndl = np.clip((n * LIGHT).sum(-1), 0, 1)
    sheen = (1 - n[..., 2]) ** 2 * 0.6
    base = np.array([0.42, 0.04, 0.08])
    col = base * (0.25 + 0.9 * ndl)[..., None] + sheen[..., None] * np.array([0.5, 0.12, 0.15])
    return to_img(col, smooth(1.0, 0.96, d))


def coin(size, seed):
    """A gold coin with a raised border and an embossed monogram, tilted back."""
    s = size
    hm = Image.new('L', (s, s), 0)
    d = ImageDraw.Draw(hm)
    d.ellipse([0, 0, s - 1, s - 1], fill=120)
    d.ellipse([s * 0.06, s * 0.06, s * 0.94, s * 0.94], fill=60)
    d.ellipse([s * 0.1, s * 0.1, s * 0.9, s * 0.9], fill=90)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', int(s * 0.36))
        fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', int(s * 0.075))
    except OSError:
        f = fs = ImageFont.load_default()
    d.text((s / 2, s / 2), 'JR', fill=200, font=f, anchor='mm')
    # dots around the rim
    for i in range(36):
        a = i / 36 * 2 * math.pi
        x, y = s / 2 + math.cos(a) * s * 0.42, s / 2 + math.sin(a) * s * 0.42
        d.ellipse([x - s * 0.012, y - s * 0.012, x + s * 0.012, y + s * 0.012], fill=150)
    hm = hm.filter(ImageFilter.GaussianBlur(s * 0.006))
    a = np.asarray(hm, float) / 255
    gy, gx = np.gradient(a * s * 0.08)
    n = norm(np.dstack([-gx, -gy, np.ones_like(a)]))
    refl = 2 * n[..., 2:3] * n - np.array([0, 0, 1.0])
    # tilt the environment so a flat coin catches the key light
    refl = refl + np.array([0.0, -0.55, 0.0])
    col = env(norm(refl)) * np.array([1.0, 0.78, 0.38]) * 0.7
    wear = fbm(s, s, 30, 3, seed=seed)
    col *= (0.85 + 0.3 * wear)[..., None]
    mask = np.asarray(Image.new('L', (s, s), 0), float)
    mimg = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mimg).ellipse([0, 0, s - 1, s - 1], fill=255)
    img = to_img(col, np.asarray(mimg, float) / 255)
    img = img.resize((s, int(s * 0.42)), Image.LANCZOS)   # seen from above at an angle
    # coin edge (thickness)
    edge = Image.new('RGBA', (s, int(s * 0.42) + 14), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.ellipse([0, 12, s - 1, int(s * 0.42) + 12], fill=(120, 82, 30, 255))
    edge.alpha_composite(img, (0, 0))
    return edge


# --------------------------------------------------------- the gallery bay
def wall_and_floor(seed):
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    # wall: deep warm plaster with faint texture
    tex = fbm(H, W, 220, 4, seed=1)  # same seed on every bay so edges agree
    wall = np.array([0.105, 0.075, 0.048])[None, None, :] * (0.85 + 0.3 * tex)[..., None]
    # spotlight pool on the wall above the exhibit
    cx, cy = W / 2, H * 0.40
    pool = np.exp(-(((xs - cx) / (W * 0.30)) ** 2 + ((ys - cy) / (H * 0.36)) ** 2))
    cone = np.exp(-(((xs - cx) / (60 + (ys) * 0.24)) ** 2)) * smooth(H * 0.82, 0, ys) * 0.5
    light = 0.28 + 2.9 * pool + 0.7 * cone
    col = wall * light[..., None]
    # ceiling shadow
    col *= (0.35 + 0.65 * smooth(0, H * 0.16, ys))[..., None]
    # dado rail
    rail = H * 0.62
    col = np.where((np.abs(ys - rail) < 6)[..., None], col * 1.9 + 0.02, col)
    col = np.where(((ys > rail + 6) & (ys < rail + 12))[..., None], col * 0.6, col)
    col = np.where((ys > rail + 12)[..., None] & (ys < FLOOR)[..., None], col * 0.78, col)
    # skirting board
    col = np.where(((ys > FLOOR - 40) & (ys < FLOOR))[..., None], col * 0.55 + 0.012, col)
    col = np.where((np.abs(ys - (FLOOR - 40)) < 2)[..., None], col * 2.2, col)
    # floor: dark polished stone with a light pool and horizontal joints
    f = ys >= FLOOR
    fy = (ys - FLOOR) / (H - FLOOR)
    grain = fbm(H, W, 60, 4, seed=2)
    stone = np.array([0.13, 0.095, 0.065])[None, None, :] * (0.75 + 0.45 * grain)[..., None]
    fpool = np.exp(-(((xs - cx) / (W * 0.34)) ** 2 + ((ys - (FLOOR + 150)) / 190) ** 2))
    floor = stone * (0.4 + 1.7 * fpool)[..., None]
    joints = np.zeros_like(ys, bool)
    for k in range(1, 7):
        jy = FLOOR + (H - FLOOR) * (k / 7) ** 1.6
        joints |= np.abs(ys - jy) < 1.2 + k * 0.3
    floor = np.where(joints[..., None], floor * 0.55, floor)
    floor *= (1 - 0.4 * fy)[..., None]
    col = np.where(f[..., None], floor, col)
    # pilasters on the two edges (half on each side so bays join)
    pw = 70
    for edge_x in (0, W):
        dx = np.abs(xs - edge_x)
        p = (dx < pw) & (ys < FLOOR)
        shade = 0.16 + 0.10 * np.cos(dx / pw * math.pi / 2)
        fl = (np.sin(dx / pw * math.pi * 3) > 0.7)
        pc = np.array([0.20, 0.15, 0.10])[None, None, :] * (shade / 0.2)[..., None]
        pc = np.where(fl[..., None], pc * 0.7, pc)
        col = np.where(p[..., None], pc, col)
        cap = (dx < pw + 16) & (np.abs(ys - H * 0.13) < 26)
        col = np.where(cap[..., None], np.array([0.24, 0.18, 0.12]), col)
        basep = (dx < pw + 12) & (ys > FLOOR - 60) & (ys < FLOOR)
        col = np.where(basep[..., None], np.array([0.17, 0.12, 0.08]), col)
    img = to_img(col)
    # the spotlight fixture
    d = ImageDraw.Draw(img)
    d.rectangle([W / 2 - 4, 0, W / 2 + 4, 70], fill=(18, 14, 10))
    d.polygon([(W / 2 - 34, 70), (W / 2 + 34, 70), (W / 2 + 24, 130), (W / 2 - 24, 130)], fill=(28, 22, 16))
    d.ellipse([W / 2 - 24, 120, W / 2 + 24, 140], fill=(255, 230, 170))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W / 2 - 70, 90, W / 2 + 70, 170], fill=(255, 210, 140, 90))
    img = Image.alpha_composite(img.convert('RGBA'), glow.filter(ImageFilter.GaussianBlur(30)))
    return img


def plinth(img, cx, top, wid, height, marble=False):
    """A plinth whose top face is at y=top; returns the y of its top surface."""
    d = ImageDraw.Draw(img)
    depth = wid * 0.16
    x0, x1 = cx - wid / 2, cx + wid / 2
    # floor shadow
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([x0 - 60, top + height - 30, x1 + 60, top + height + 70], fill=(0, 0, 0, 170))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(28)))
    # front face with vertical light falloff
    face = np.zeros((int(height), int(wid), 3))
    yy = np.linspace(0, 1, int(height))[:, None]
    xx = np.linspace(-1, 1, int(wid))[None, :]
    base = np.array([0.13, 0.10, 0.08]) if not marble else np.array([0.62, 0.58, 0.53])
    shade = (1.15 - 0.75 * yy) * (1 - 0.18 * xx ** 2)
    face = base * shade[..., None]
    if marble:
        nz = fbm(int(height), int(wid), 60, 4, seed=int(cx) % 97)
        face = face * (0.9 + 0.2 * nz[..., None])
    img.alpha_composite(to_img(face).convert('RGBA'), (int(x0), int(top)))
    # top face (lit)
    topc = tuple(int(c * 255) for c in (base * 1.9).clip(0, 1)) + (255,)
    d.polygon([(x0, top), (x1, top), (x1 - depth * 0.4, top - depth * 0.55), (x0 + depth * 0.4, top - depth * 0.55)],
              fill=topc)
    d.line([(x0, top), (x1, top)], fill=tuple(min(255, int(c * 1.3)) for c in topc[:3]) + (255,), width=3)
    # cornice and base mouldings
    d.rectangle([x0 - 10, top, x1 + 10, top + 18], fill=tuple(int(c * 255) for c in (base * 1.4).clip(0, 1)))
    d.rectangle([x0 - 14, top + height - 26, x1 + 14, top + height],
                fill=tuple(int(c * 255) for c in (base * 0.9).clip(0, 1)))
    # brass plaque
    pw, ph = 120, 46
    py = top + height * 0.42
    d.rectangle([cx - pw / 2, py, cx + pw / 2, py + ph], fill=(150, 112, 52))
    d.rectangle([cx - pw / 2 + 4, py + 4, cx + pw / 2 - 4, py + ph - 4], outline=(205, 165, 90), width=2)
    for i in range(3):
        d.line([cx - pw / 2 + 16, py + 14 + i * 9, cx + pw / 2 - 16 - (i == 2) * 30, py + 14 + i * 9],
               fill=(95, 66, 28), width=3)
    return top - depth * 0.28


def glass_case(img, cx, bottom, wid, hgt):
    """Draw a glass vitrine whose base sits at y=bottom."""
    x0, x1, y0 = cx - wid / 2, cx + wid / 2, bottom - hgt
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rectangle([x0, y0, x1, bottom], fill=(190, 210, 220, 16))
    # top: seen from slightly below, a thin lit cap
    d.rectangle([x0 - 6, y0 - 12, x1 + 6, y0], fill=(30, 24, 18, 255))
    d.line([(x0 - 6, y0 - 12), (x1 + 6, y0 - 12)], fill=(200, 160, 90, 255), width=3)
    # edges
    for x in (x0, x1):
        d.line([(x, y0), (x, bottom)], fill=(235, 225, 210, 110), width=4)
    back = wid * 0.08
    d.line([(x0 + back, y0 + back * 0.6), (x1 - back, y0 + back * 0.6)], fill=(235, 225, 210, 50), width=2)
    for x in (x0 + back, x1 - back):
        d.line([(x, y0 + back * 0.6), (x, bottom - back * 0.3)], fill=(235, 225, 210, 45), width=2)
    # reflections: two diagonal streaks
    streak = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(streak)
    sx = x0 + wid * 0.14
    sd.polygon([(sx, bottom), (sx + wid * 0.08, bottom), (sx + wid * 0.46, y0), (sx + wid * 0.38, y0)],
               fill=(255, 245, 230, 34))
    sx2 = x0 + wid * 0.6
    sd.polygon([(sx2, bottom), (sx2 + wid * 0.03, bottom), (sx2 + wid * 0.25, y0), (sx2 + wid * 0.22, y0)],
               fill=(255, 245, 230, 26))
    clip = Image.new('L', img.size, 0)
    ImageDraw.Draw(clip).rectangle([x0, y0, x1, bottom], fill=255)
    streak.putalpha(Image.fromarray(np.minimum(np.asarray(streak.split()[3]), np.asarray(clip))))
    layer.alpha_composite(streak.filter(ImageFilter.GaussianBlur(2)))
    img.alpha_composite(layer)


def place(img, obj, cx, bottom, shadow=True, scale=1.0):
    if scale != 1.0:
        obj = obj.resize((int(obj.width * scale), int(obj.height * scale)), Image.LANCZOS)
    x = int(cx - obj.width / 2)
    y = int(bottom - obj.height)
    if shadow:
        sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse([x + obj.width * 0.1, bottom - 16, x + obj.width * 0.9, bottom + 14],
                                   fill=(0, 0, 0, 200))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    img.alpha_composite(obj, (x, y))
    return obj


def reflect(img, obj_img, cx, floor_y, strength=0.16):
    """Faint mirror image of an object in the polished floor."""
    r = obj_img.transpose(Image.FLIP_TOP_BOTTOM)
    a = np.asarray(r.split()[3], float)
    fade = np.linspace(strength, 0, r.height)[:, None]
    r.putalpha(Image.fromarray((a * fade).astype(np.uint8)))
    r = r.filter(ImageFilter.GaussianBlur(3))
    img.alpha_composite(r, (int(cx - r.width / 2), int(floor_y)))


def framed(img, art, cx, cy, wid):
    """Hang a picture in a heavy gold frame on the wall."""
    art = art.resize((int(wid), int(wid * art.height / art.width)), Image.LANCZOS).convert('RGBA')
    fw = int(wid * 0.07)
    x0, y0 = int(cx - art.width / 2), int(cy - art.height / 2)
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle([x0 - fw + 16, y0 - fw + 30, x0 + art.width + fw + 16, y0 + art.height + fw + 40],
                                 fill=(0, 0, 0, 200))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(24)))
    fh, fwid = art.height + 2 * fw, art.width + 2 * fw
    ys, xs = np.mgrid[0:fh, 0:fwid].astype(float)
    dist = np.minimum(np.minimum(xs, fwid - 1 - xs), np.minimum(ys, fh - 1 - ys)) / fw
    ridge = np.sin(dist * math.pi * 2.2)
    ny = np.where(ys < fh / 2, -1, 1) * (dist < 1)
    lit = 0.55 + 0.45 * ridge - 0.15 * (ys / fh) + 0.15 * (xs < fwid / 2)
    col = np.array([0.85, 0.62, 0.26]) * np.clip(lit, 0.15, 1.3)[..., None]
    frame = to_img(col, (dist < 1.0).astype(float))
    img.alpha_composite(frame, (x0 - fw, y0 - fw))
    inner = Image.new('RGBA', (art.width + 8, art.height + 8), (40, 28, 14, 255))
    img.alpha_composite(inner, (x0 - 4, y0 - 4))
    # warm grade and soft light falloff on the picture
    a = np.asarray(art, float) / 255
    ys2 = np.linspace(-1, 1, art.height)[:, None]
    xs2 = np.linspace(-1, 1, art.width)[None, :]
    fall = 1.05 - 0.35 * (xs2 ** 2 + (ys2 + 0.3) ** 2)
    a[..., :3] = a[..., :3] * fall[..., None]
    img.alpha_composite(to_img(a[..., :3], a[..., 3]), (x0, y0))
    # a small brass label under it
    d = ImageDraw.Draw(img)
    ly = y0 + art.height + fw + 40
    d.rectangle([cx - 50, ly, cx + 50, ly + 26], fill=(140, 104, 48))
    d.line([cx - 34, ly + 13, cx + 34, ly + 13], fill=(90, 62, 26), width=3)


def stanchions(img, y):
    """Brass posts with a velvet rope in front of a wall piece."""
    d = ImageDraw.Draw(img)
    posts = [W * 0.22, W * 0.78]
    for x in posts:
        d.ellipse([x - 40, y - 10, x + 40, y + 14], fill=(60, 44, 20))
        d.rectangle([x - 8, y - 260, x + 8, y], fill=(170, 128, 58))
        d.line([x - 3, y - 258, x - 3, y - 4], fill=(240, 205, 130), width=3)
        d.ellipse([x - 18, y - 290, x + 18, y - 254], fill=(190, 146, 66))
        d.ellipse([x - 9, y - 284, x - 1, y - 274], fill=(255, 230, 170))
    pts = []
    for i in range(41):
        t = i / 40
        x = posts[0] + (posts[1] - posts[0]) * t
        pts.append((x, y - 268 + 70 * math.sin(math.pi * t)))
    d.line(pts, fill=(110, 10, 22), width=16, joint='curve')
    d.line([(px, py - 4) for px, py in pts], fill=(170, 40, 50), width=4, joint='curve')


# ------------------------------------------------------------- the bays
def building_crop(box):
    im = Image.open(SRC).convert('RGB')
    c = im.crop(box)
    return c.resize((c.width * 3, c.height * 3), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 70, 2))


def bay_pedestal(obj, plinth_w=380, plinth_h=None, marble=False, case=None, obj_scale=1.0, extra=None):
    img = wall_and_floor(0)
    plinth_h = plinth_h or int(H * 0.27)
    top = FLOOR + 40 - plinth_h
    surface = plinth(img, W / 2, top, plinth_w, plinth_h, marble)
    if extra:
        extra(img, surface)
    o = place(img, obj, W / 2, surface + 6, scale=obj_scale)
    if case:
        glass_case(img, W / 2, surface + 4, case[0], case[1])
    return img


def bay_wall(art):
    img = wall_and_floor(0)
    framed(img, art, W / 2, H * 0.36, W * 0.66)
    stanchions(img, FLOOR + 120)
    return img


def sword_pair():
    top = Image.open(os.path.join(ROOT, 'assets', 'sword-top-q82.webp')).convert('RGBA')
    bot = Image.open(os.path.join(ROOT, 'assets', 'sword-bottom-q82.webp')).convert('RGBA')
    wd = 860
    top = top.resize((wd, int(top.height * wd / top.width)), Image.LANCZOS)
    bot = bot.resize((wd, int(bot.height * wd / bot.width)), Image.LANCZOS)
    # lift the dark steel a little so it reads under the spotlight
    def lift(im):
        a = np.asarray(im, float) / 255
        rgb = a[..., :3] * 1.25 + 0.03
        return to_img(rgb, a[..., 3])
    top, bot = lift(top), lift(bot)
    out = Image.new('RGBA', (wd, top.height + bot.height - 40), (0, 0, 0, 0))
    out.alpha_composite(top, (0, 0))
    out.alpha_composite(bot, (0, top.height - 40))
    return out


def coins_group():
    out = Image.new('RGBA', (720, 260), (0, 0, 0, 0))
    for i, (x, y, s) in enumerate([(20, 120, 230), (250, 70, 260), (490, 120, 220)]):
        out.alpha_composite(coin(s, i), (x, y))
    return out


def crown_on_cushion():
    cu = cushion(620)
    cr = crown()
    out = Image.new('RGBA', (640, cr.height + cu.height - 120), (0, 0, 0, 0))
    out.alpha_composite(cu, (10, out.height - cu.height))
    out.alpha_composite(cr, (0, 0))
    return out


def orb_on_stand():
    o = orb()
    h = 160
    pts = [(0.0, 40), (0.3, 26), (0.6, 30), (0.85, 70), (1.0, 90)]
    st = revolve(profile_from(pts, h), h, 'gold', rim=False)
    out = Image.new('RGBA', (o.width, o.height + h - 50), (0, 0, 0, 0))
    out.alpha_composite(st, (int(o.width / 2 - st.width / 2), out.height - h))
    out.alpha_composite(o, (0, 0))
    return out


def bays():
    return [
        ('amphora', lambda: bay_pedestal(amphora(), 420, obj_scale=0.92)),
        ('relief-center', lambda: bay_wall(building_crop((500, 150, 760, 282)))),
        ('chalice', lambda: bay_pedestal(chalice(), 400, case=(470, 640), obj_scale=0.78)),
        ('krater', lambda: bay_pedestal(krater(), 520, marble=True, obj_scale=0.9)),
        ('coins', lambda: bay_pedestal(coins_group(), 640, case=(700, 380), obj_scale=0.88)),
        ('relief-right', lambda: bay_wall(building_crop((650, 165, 970, 300)))),
        ('urn', lambda: bay_pedestal(marble_urn(), 420, obj_scale=0.9)),
        ('orb', lambda: bay_pedestal(orb_on_stand(), 420, case=(480, 720), obj_scale=0.9)),
        ('sword', lambda: bay_pedestal(sword_pair(), 900, plinth_h=int(H * 0.25), case=(960, 560), obj_scale=1.0)),
        ('lekythos', lambda: bay_pedestal(lekythos(), 360, obj_scale=0.9)),
        ('column', lambda: bay_pedestal(column_drum(), 480, marble=True, obj_scale=0.95)),
        ('crown', lambda: bay_pedestal(crown_on_cushion(), 560, case=(640, 640), obj_scale=0.82)),
        ('relief-left', lambda: bay_wall(building_crop((290, 175, 560, 300)))),
    ]


def main(only=None):
    os.makedirs(OUT, exist_ok=True)
    for i, (name, fn) in enumerate(bays()):
        if only is not None and i not in only:
            continue
        img = fn().convert('RGB')
        for w in (1440, 1080, 720):
            h = int(w * H / W)
            img.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, f'bay-{i:02d}-{w}.webp'),
                                                   quality=78 if w >= 1080 else 76, method=6)
        print(f'bay-{i:02d} {name}')


# ------------------------------------------------------------ the timing
LOOP = 120.0          # seconds for the whole loop
DIVE_START = 8.0      # slow push on the building until here
DIVE_END = 11.0       # through the doorway
MUSEUM = 11.3         # first exhibit centred
SLOT = 8.0            # seconds per exhibit
DWELL = 5.0           # of which this long looking at it
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
