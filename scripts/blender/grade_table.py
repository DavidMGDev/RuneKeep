"""
Grade make_table.py's renders into the app's colours and save them as WebP (v0.47.0).

    python scripts/blender/grade_table.py <render dir> public/table

Blender supplies the cloth (its fibre and the way the lamp falls off); the colour is set here, exactly, so the
felt is the sheet's own ink rather than whatever the render's white light made of it.
"""
import sys

from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
INK_LIT = (18, 22, 31)  # under the lamp
INK_DARK = (9, 11, 16)  # the far corners

raw = Image.open(f'{src}/felt.png').convert('L')
light = raw.filter(ImageFilter.GaussianBlur(40))  # the lamp's fall-off
w, h = raw.size
hi = light.getpixel((w // 2, h // 2))
lo = min(light.getpixel((8, 8)), light.getpixel((w - 8, h - 8)))
FIBRE = 2.6  # levels either way: enough to read as cloth up close, never as noise
pr, pl = raw.load(), light.load()
img = Image.new('RGB', (w, h))
op = img.load()
for y in range(h):
    for x in range(w):
        t = max(0.0, min(1.0, (pl[x, y] - lo) / max(1, hi - lo)))
        grain = max(-1.0, min(1.0, (pr[x, y] - pl[x, y]) / 18)) * FIBRE
        op[x, y] = tuple(max(0, round(d + (l - d) * t + grain)) for d, l in zip(INK_DARK, INK_LIT))
img.save(f'{out}/felt.webp', quality=96, method=6)

r = Image.open(f'{src}/rail.png').convert('RGBA')
r.save(f'{out}/rail.webp', quality=88, method=6)
print('ok', img.getpixel((w // 2, h // 2)), img.getpixel((10, 10)))

# The cloth's fibre, as its own small seamless tile laid over the felt (lossy WebP smooths a two-level grain
# away, so the felt carries the lamp and this carries the weave). Light threads white, dark ones black, both
# faint; tiled by the page.
T = 160
hp = raw.crop((600, 400, 600 + 2 * T, 400 + 2 * T))
hp_blur = hp.filter(ImageFilter.GaussianBlur(6))
a, b = hp.load(), hp_blur.load()
tile = Image.new('RGBA', (T, T))
tp = tile.load()
for y in range(T):
    for x in range(T):
        # Cross-fade four offset copies so the tile wraps without a seam.
        wx, wy = x / T, y / T
        acc = 0.0
        for ox, oy, wgt in ((0, 0, (1 - wx) * (1 - wy)), (T, 0, wx * (1 - wy)), (0, T, (1 - wx) * wy), (T, T, wx * wy)):
            sx, sy = (x + T - ox) % (2 * T), (y + T - oy) % (2 * T)
            acc += (a[sx, sy] - b[sx, sy]) * wgt
        g = max(-1.0, min(1.0, acc / 14))
        tp[x, y] = (255, 255, 255, round(g * 46)) if g > 0 else (0, 0, 0, round(-g * 60))
tile.save(f'{out}/weave.png', optimize=True)
print('weave', tile.size)
