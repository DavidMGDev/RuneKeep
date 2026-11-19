"""Pull the Deck of Many Things cards out of the Animated Things rules booklet.

Usage: python scripts/extract-domat.py <Rulebooklet-PNP.pdf>

Writes src/features/character-sheet/table/domat-cards.json (names and rules text, which is SRD 5.1
open game content) and public/domat/<id>.webp (the card art, which is the publisher's product
identity: it stays out of git, see .gitignore, so only a local build shows it).
Cards sit two to a page (left and right) on pages 4 to 14: the art is the 872/909 x 672 image at the
top of each half, the name is one of the two lines of the title block, the text is the block under it.
"""
import io, json, os, re, sys

import fitz  # PyMuPDF
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JSON = os.path.join(ROOT, 'src', 'features', 'character-sheet', 'table', 'domat-cards.json')
OUT_ART = os.path.join(ROOT, 'public', 'domat')


def clean(t: str) -> str:
    t = t.replace('’', "'").replace('−', '-').replace('—', ',').replace('–', '-')
    t = re.sub(r'\s*\n\s*', ' ', t)
    return re.sub(r'\s{2,}', ' ', t).strip()


def main(pdf: str) -> None:
    os.makedirs(OUT_ART, exist_ok=True)
    doc = fitz.open(pdf)
    cards = []
    for pno in range(3, 14):
        page = doc[pno]
        mid = page.rect.width / 2
        blocks = page.get_text('blocks')
        title = next(b for b in blocks if 380 < b[1] < 400)
        names = [clean(n) for n in title[4].strip().split('\n') if n.strip()]
        texts = sorted((b for b in blocks if b[1] > 430), key=lambda b: b[0])
        arts = []
        for img in page.get_images(full=True):
            if img[3] != 672 and img[3] != 671:
                continue
            r = page.get_image_rects(img[0])[0]
            arts.append((r.x0, img[0]))
        arts.sort()
        for side, name in enumerate(names):
            text = next(clean(b[4]) for b in texts if (b[0] < mid) == (side == 0))
            xref = arts[side][1]
            pix = fitz.Pixmap(doc, xref)
            if pix.n - pix.alpha >= 4:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
            im.thumbnail((640, 640))
            cid = re.sub(r'[^a-z]+', '-', name.lower().replace('the ', '')).strip('-')
            im.save(os.path.join(OUT_ART, cid + '.webp'), quality=82)
            cards.append({'id': cid, 'name': name.title(), 'text': text})
    assert len(cards) == 22, len(cards)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(cards, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(len(cards), 'cards:', ', '.join(c['name'] for c in cards))


if __name__ == '__main__':
    main(sys.argv[1])
