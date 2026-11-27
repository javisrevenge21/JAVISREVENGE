"""Cuts the museum pieces for the /archives hero out of their studio photos.

The photos are public-domain (CC0) images from The Metropolitan Museum of Art's
Open Access collection; CREDITS.md in scripts/archives-art lists each one.
The cut-outs this writes are committed, so this only needs running again to
redo one.

    python3 scripts/archives-cutout.py PHOTO_DIR [name.png ...]

PHOTO_DIR holds the photos as name.png. Each photo's backdrop is modelled as a
smooth gradient; the piece is whatever is connected to the middle and doesn't
fit it. The soft shadow the piece casts on the backdrop is kept as its own
layer (name-shadow.webp) so it can be laid on the gallery shelf.
Needs Pillow and numpy only.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'archives-art')
MAX_SIDE = 1000


def poly_terms(x, y, deg):
    return np.stack([x**i * y**j for i in range(deg+1) for j in range(deg+1-i)], -1)

def fit_bg(img, deg=3, iters=6, seed_mask=None):
    h, w, _ = img.shape
    s = 4
    small = img[::s, ::s]
    ys, xs = np.mgrid[0:small.shape[0], 0:small.shape[1]]
    X = poly_terms(xs.ravel()/small.shape[1]*2-1, ys.ravel()/small.shape[0]*2-1, deg)
    use = np.zeros(small.shape[:2], bool)
    b = max(3, small.shape[0]//25)
    use[:b] = use[-b:] = True; use[:, :b] = use[:, -b:] = True
    use = use.ravel()
    Y = small.reshape(-1, 3)
    for it in range(iters):
        coef, *_ = np.linalg.lstsq(X[use], Y[use], rcond=None)
        pred = X @ coef
        res = np.abs(Y - pred).max(1)
        thr = min(0.07, max(0.025, np.median(res[use]) * 5))
        use = res < thr
    ysf, xsf = np.mgrid[0:h, 0:w]
    Xf = poly_terms(xsf.ravel()/w*2-1, ysf.ravel()/h*2-1, deg)
    return (Xf @ coef).reshape(h, w, 3), thr

def blur(a, r):
    """Gaussian blur of a float array (separable, numpy only)."""
    k = int(max(1, round(r * 3)))
    x = np.arange(-k, k + 1)
    g = np.exp(-x * x / (2 * r * r)); g /= g.sum()
    a = np.asarray(a, np.float32)
    p = np.pad(a, ((k, k), (0, 0)), mode='edge')
    a = sum(g[i] * p[i:i + a.shape[0]] for i in range(2 * k + 1))
    p = np.pad(a, ((0, 0), (k, k)), mode='edge')
    return sum(g[i] * p[:, i:i + a.shape[1]] for i in range(2 * k + 1))


def smooth01(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lum(x):
    return x[..., 0] * 0.3 + x[..., 1] * 0.59 + x[..., 2] * 0.11

def cut(path, out_dir, grad_t=0.010, chroma_t=0.03, deg=5, ratio_hi=1.12, extra_seeds=(), no_top=False, crop_bottom=None, hole_res=0.06, force=None, holes=False, luma=None, erode=0, hole_box=None):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255
    if crop_bottom:
        im = im[:crop_bottom]
    bg, thr = fit_bg(im, deg)
    L = lum(im); Lb = np.maximum(lum(bg), 0.01)
    Ls = blur(L, 1.2)
    gy, gx = np.gradient(Ls)
    grad = np.hypot(gx, gy)
    gradb = blur(grad, 2.0)
    ch = im / np.maximum(L, 0.03)[..., None] - bg / Lb[..., None]
    chroma = np.abs(ch).max(-1) * np.clip(L / 0.12, 0, 1)
    ratio = L / Lb
    dark_bg = (L < 0.07) & (np.abs(im - bg).max(-1) < 0.05)
    cand = ((gradb < grad_t) & (chroma < chroma_t) & (ratio < ratio_hi) & (ratio > 0.15)) | (dark_bg & (gradb < grad_t * 1.5))
    if luma:
        # dark backdrops: anything not clearly brighter than the backdrop is backdrop
        cand |= ((L - Lb) < luma) & (L < 0.4)
    m = Image.fromarray(cand.astype(np.uint8) * 255).copy()
    h, w = cand.shape
    seeds = [(x, y) for x in range(0, w, 6) for y in ((h - 1,) if no_top else (0, h - 1))] + [(x, y) for y in range(0, h, 6) for x in (0, w - 1)]
    for (x, y) in list(seeds) + list(extra_seeds):
        if m.getpixel((x, y)) == 255:
            ImageDraw.floodfill(m, (x, y), 128)
    if crop_bottom:
        # the bottom edge is a cut through the object: never seed there
        pass
    # enclosed pockets of plain backdrop (inside handles, between arms)
    res = np.abs(im - bg).max(-1)
    arr = np.asarray(m).copy()
    for y in (range(4, h - 4, 10) if holes else ()):
        for x in range(4, w - 4, 10):
            if hole_box and not (hole_box[0] <= x / w < hole_box[2] and hole_box[1] <= y / h < hole_box[3]):
                continue
            if arr[y, x] == 255:
                ImageDraw.floodfill(m, (x, y), 60)
                arr = np.asarray(m).copy()
                reg = arr == 60
                n = reg.sum()
                ok = n > 300 and float(np.median(res[reg])) < hole_res
                ImageDraw.floodfill(m, (x, y), 128 if ok else 1)
                arr = np.asarray(m).copy()
    bgm = arr == 128
    if force:
        fm = Image.new('L', (w, h), 0)
        ImageDraw.Draw(fm).polygon(force, fill=255)
        bgm &= np.asarray(fm) == 0
    obj = Image.fromarray((~bgm).astype(np.uint8) * 255)
    obj = obj.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # drop specks
    obj = obj.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))   # close gaps
    obj = obj.filter(ImageFilter.MinFilter(3))                                    # pull edge in 1px
    for _ in range(erode):
        obj = obj.filter(ImageFilter.MinFilter(3))
    # keep only the main piece: the part connected to the middle of the mask
    oa = np.asarray(obj)
    yy, xx = np.where(oa > 127)
    cy, cx = np.median(yy), np.median(xx)
    i = np.argmin((yy - cy) ** 2 + (xx - cx) ** 2)
    obj = obj.copy()
    ImageDraw.floodfill(obj, (int(xx[i]), int(yy[i])), 200)
    obj = Image.fromarray(((np.asarray(obj) == 200) * 255).astype(np.uint8))
    a = np.asarray(obj.filter(ImageFilter.GaussianBlur(1.1))).astype(np.float32) / 255
    # shadow left on the background: how much darker than the fitted backdrop
    sh = np.clip(1 - ratio, 0, 1) * (1 - a) * smooth01(Lb, 0.12, 0.3)
    sh = blur(sh, 2.0)
    fg = np.where(a[..., None] > 0.97, im, np.clip((im - (1 - a[..., None]) * bg * (1 - sh[..., None])) / np.maximum(a[..., None], 0.05), 0, 1))
    ys, xs = np.where((a > 0.05) | (sh > 0.06))
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = Image.fromarray((np.dstack([fg, a])[y0:y1, x0:x1] * 255).astype(np.uint8), 'RGBA')
    shadow = Image.fromarray((sh[y0:y1, x0:x1] * 255).astype(np.uint8), 'L')
    k = min(1.0, MAX_SIDE / max(rgba.size))
    if k < 1:
        size = (round(rgba.width * k), round(rgba.height * k))
        rgba = rgba.resize(size, Image.LANCZOS)
        shadow = shadow.resize(size, Image.LANCZOS)
    name = os.path.splitext(os.path.basename(path))[0]
    rgba.save(os.path.join(out_dir, name + '.webp'), quality=90, method=6)
    shadow.convert('RGB').save(os.path.join(out_dir, name + '-shadow.webp'), quality=80, method=6)
    return (x1 - x0, y1 - y0)

PARAMS = {
    'is_bottle.png': {'holes': True},
    'is_hanukkah.png': {'holes': True, 'ratio_hi': 2.0, 'chroma_t': 0.06, 'hole_res': 0.2, 'grad_t': 0.014,
                        'hole_box': (0, 0.72, 1, 1)},
    'pe_lion.png': {'ratio_hi': 1.5, 'grad_t': 0.014, 'chroma_t': 0.09},
    'fr_reliquary.png': {'grad_t': 0.014, 'chroma_t': 0.2, 'ratio_hi': 3.0},
    'it_augustus.png': {'chroma_t': 0.15, 'luma': 0.05, 'erode': 1},
    'eg_canopic.png': {'luma': 0.06, 'erode': 1},
    'it_bowl.png': {'luma': 0.04},
    'eg_cat.png': {'force': [(93, 905), (575, 866), (812, 948), (815, 1082), (430, 1198), (95, 1046)]},
}



if __name__ == '__main__':
    src = sys.argv[1]
    names = sys.argv[2:] or sorted(f for f in os.listdir(src) if f.endswith('.png'))
    for f in names:
        cut(os.path.join(src, f), OUT, **PARAMS.get(f, {}))
        print(f)
