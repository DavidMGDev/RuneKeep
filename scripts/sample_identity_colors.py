"""Sample class + domain identity colors from the card banners and emit theme-ready tokens.

For each class: median banner color of its first subclass foundation card.
For each domain: median banner color of its level-1 first card.
Each color is emitted twice, per DESIGN.md "class colors stay subordinate":
  deep   — desaturated + darkened toward ink (panel fills at rest; gold text stays AA on it)
  bright — lifted toward the banner's true hue (selected states, glyph tints, hairlines)

Usage: python scripts/sample_identity_colors.py  (prints a TS object to paste into theme)
"""

from __future__ import annotations

import colorsys
import statistics
from pathlib import Path

from PIL import Image

CARDS = Path(__file__).resolve().parent.parent / "assets" / "extracted_cards"
PATCH = (38, 60, 55, 200)

CLASS_CARD = {
    "bard": "Subclass/Bard/troubadour-1-foundation.webp",
    "druid": "Subclass/Druid/warden-of-the-elements-1-foundation.webp",
    "guardian": "Subclass/Guardian/stalwart-1-foundation.webp",
    "ranger": "Subclass/Ranger/beastbound-1-foundation.webp",
    "rogue": "Subclass/Rogue/nightwalker-1-foundation.webp",
    "seraph": "Subclass/Seraph/divine-wielder-1-foundation.webp",
    "sorcerer": "Subclass/Sorcerer/elemental-origin-1-foundation.webp",
    "warrior": "Subclass/Warrior/call-of-the-brave-1-foundation.webp",
    "wizard": "Subclass/Wizard/school-of-knowledge-1-foundation.webp",
}
DOMAINS = ["Arcana", "Blade", "Bone", "Codex", "Grace", "Midnight", "Sage", "Splendor", "Valor"]


def sample(path: Path) -> tuple[int, int, int]:
    im = Image.open(path).convert("RGB")
    px = list(im.crop(PATCH).getdata())
    return tuple(int(statistics.median(p[i] for p in px)) for i in range(3))


def hx(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{round(c):02X}" for c in rgb)


def variants(rgb: tuple[int, int, int]) -> tuple[str, str]:
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    deep = colorsys.hsv_to_rgb(h, min(s, 0.52), max(0.16, min(v * 0.55, 0.34)))
    bright = colorsys.hsv_to_rgb(h, min(s * 1.05, 0.75), max(v, 0.62))
    return hx(tuple(c * 255 for c in deep)), hx(tuple(c * 255 for c in bright))


print("export const ClassColors = {")
for cls, rel in CLASS_CARD.items():
    deep, bright = variants(sample(CARDS / rel))
    print(f"  {cls}: {{ deep: '{deep}', bright: '{bright}' }},")
print("} as const;\n")

print("export const DomainColors = {")
for dom in DOMAINS:
    deep, bright = variants(sample(CARDS / "Domains" / dom / f"{dom.lower()}-01-1.webp"))
    print(f"  {dom.lower()}: {{ deep: '{deep}', bright: '{bright}' }},")
print("} as const;")
