#!/usr/bin/env python3
"""Key a white-background render to alpha, then grade it into a pillar's
token family. Usage: process.py <in.png> <out.webp> <pillar> [size] [mode]

The grade is a luminance remap: shadows -> --<pillar>-deep, midtones ->
--<pillar>, highlights -> 65% toward white. Every output pixel therefore
lives inside the pillar's palette family by construction.

mode 'natural' keys and crops but skips the grade — for photographic
subjects whose own colours carry the signal (a dressed figure whose
garment wears the pillar colour). Default mode is 'grade'.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

# light-mode tokens from app/css/app.css lines 63-66
PALETTE = {
    'fitness':  {'deep': '#6E2712', 'main': '#9E3B1E'},
    'culture':  {'deep': '#5C4108', 'main': '#8A6210'},
    'yoga':     {'deep': '#283D21', 'main': '#3C5A31'},
    'wellness': {'deep': '#26244B', 'main': '#3A386C'},
}

BG_THRESH = 34      # flood-fill tolerance for "near white"
HOLE_THRESH = 26     # enclosed near-white (handle windows, limb gaps) keyed too
FEATHER_THRESH = 90  # whiteness distance that maps to full alpha at edges
HI_MIX = 0.72        # highlight = main mixed this far toward white
MID_AT = 0.30        # normalized luminance where the ramp hits the main token
SIZE = 192           # default; optional argv[4] overrides (640 for hero art)
MARGIN = 0.06

def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i+2], 16) for i in (0, 2, 4))

def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def main():
    src, dst, pillar = sys.argv[1], sys.argv[2], sys.argv[3]
    size = int(sys.argv[4]) if len(sys.argv) > 4 else SIZE
    natural = len(sys.argv) > 5 and sys.argv[5] == 'natural'
    pal = PALETTE[pillar]
    deep, mid = hx(pal['deep']), hx(pal['main'])
    hi = mix(mid, (255, 255, 255), HI_MIX)

    img = Image.open(src).convert('RGB')
    # 4px white border guarantees the background is one connected region,
    # so a single corner flood-fill reaches all of it
    pad = Image.new('RGB', (img.width + 8, img.height + 8), (255, 255, 255))
    pad.paste(img, (4, 4))
    fill = pad.copy()
    ImageDraw.floodfill(fill, (0, 0), (255, 0, 255), thresh=BG_THRESH)

    w, h = fill.size
    fillpx, srcpx = fill.load(), pad.load()
    bg = Image.new('L', (w, h), 0)
    bgpx = bg.load()
    for y in range(h):
        for x in range(w):
            if fillpx[x, y] == (255, 0, 255):
                bgpx[x, y] = 255
    # enclosed windows: the corner flood-fill only reaches the OUTER
    # background, so white showing through a handle or between limbs stayed
    # opaque and was graded into the palette — reading as a solid ground
    # behind the mark (TJ, 3 Aug). In grade mode any remaining near-white
    # pixel is background by construction — matte clay never renders that
    # bright — so key it with the same feather. Photographic 'natural' mode
    # is left alone: real subjects may genuinely wear near-white.
    if not natural:
        for y in range(h):
            for x in range(w):
                if not bgpx[x, y]:
                    r, g, b = srcpx[x, y]
                    if max(255 - r, 255 - g, 255 - b) <= HOLE_THRESH:
                        bgpx[x, y] = 255
    # feather band: object pixels touching the removed background
    band = bg.filter(ImageFilter.MaxFilter(5))
    bandpx = band.load()

    alpha = Image.new('L', (w, h), 255)
    apx = alpha.load()
    for y in range(h):
        for x in range(w):
            if bgpx[x, y]:
                apx[x, y] = 0
            elif bandpx[x, y]:
                r, g, b = srcpx[x, y]
                d = max(255 - r, 255 - g, 255 - b)  # distance from white
                apx[x, y] = min(255, d * 255 // FEATHER_THRESH)

    out = Image.new('RGBA', (w, h))
    opx = out.load()
    if natural:
        # photographic mode: the subject keeps its own colours (the garment
        # carries the pillar signal); only the keyed alpha is applied
        for y in range(h):
            for x in range(w):
                a = apx[x, y]
                if a:
                    r, g, b = srcpx[x, y]
                    opx[x, y] = (r, g, b, a)
    else:
        # luminance -> token ramp, applied to per-image NORMALIZED luminance so
        # every asset lands the same tonal distribution as the Vital Panel set
        # (median ~0.47, highlights ~0.72) regardless of how bright the model
        # happened to render it
        grayimg = pad.convert('L')
        gray = grayimg.load()
        obj = sorted(gray[x, y] for y in range(h) for x in range(w)
                     if apx[x, y] > 200)
        p5, p95 = obj[len(obj) // 20], obj[19 * len(obj) // 20]
        span = max(1, p95 - p5)
        lut = []
        for i in range(256):
            t = min(1.0, max(0.0, (i - p5) / span))
            c = mix(deep, mid, t / MID_AT) if t < MID_AT else mix(mid, hi, (t - MID_AT) / (1 - MID_AT))
            lut.append(c)
        for y in range(h):
            for x in range(w):
                a = apx[x, y]
                if a:
                    r, g, b = lut[gray[x, y]]
                    opx[x, y] = (r, g, b, a)

    box = out.getbbox()
    out = out.crop(box)
    side = max(out.width, out.height)
    canvas_side = round(side * (1 + 2 * MARGIN))
    canvas = Image.new('RGBA', (canvas_side, canvas_side), (0, 0, 0, 0))
    canvas.paste(out, ((canvas_side - out.width) // 2, (canvas_side - out.height) // 2))
    canvas = canvas.resize((size, size), Image.LANCZOS)
    canvas.save(dst, 'WEBP', quality=82, alpha_quality=90, method=6)
    cov = sum(1 for p in canvas.getdata() if p[3] == 0) * 100 // (size * size)
    print(f'OK {dst} · {canvas_side}->{size}px · {cov}% transparent')

if __name__ == '__main__':
    main()
