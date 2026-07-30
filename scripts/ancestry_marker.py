"""
Build the ancestry line-marking tool for an expansion's printed cards.

WHY THIS EXISTS
---------------
A mixed-ancestry character keeps the FIRST feature of one ancestry and the SECOND feature of the
other, so the app strikes a black line through every text line of the half the player did not take.
When an ancestry card is a flat image (the base game's are, and Hope and Fear's are becoming so),
the app has no idea where those text lines sit, so somebody has to measure them once. Guessing puts
the strike through the flavour paragraph or through nothing at all.

The base game's numbers in `src/data/ancestry-trait-regions.ts` were measured by hand in a throwaway
HTML page that was never committed and is now gone. This script is that page, kept.

It does three things:

1. Crops each ancestry card face out of the publisher PDF at print resolution.
2. PRE-FILLS the marks by reading the PDF's own text geometry, so every line is already placed
   before a human looks at it. The PDF knows where its glyphs are; there is no reason to click 40
   times to rediscover that.
3. Writes ONE self-contained HTML file (images inlined) that opens by double-click, with the marks
   drawn on the cards to drag, add, delete and export.

So the manual step is verification, not measurement.

USAGE
-----
    python scripts/ancestry_marker.py                     # Hope and Fear ancestries
    python scripts/ancestry_marker.py --out D:/marks.html

Output is deliberately NOT written into the repo: it is a 2 MB working file, not source. The script
is the artifact worth keeping, since it regenerates the page in a second.

Requires PyMuPDF (`pip install pymupdf`).
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import re
import sys

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover - operator-facing
    sys.exit("PyMuPDF is missing. Run:  pip install pymupdf")


# --- What to cut up ---------------------------------------------------------------------------
#
# The six Hope and Fear ancestries share one page, laid out in a 3-wide, 2-tall grid. These bounds
# come from the page's own image rectangles (the art plates start each card box), so they are
# measured rather than eyeballed. Card ids match `src/data/void-ancestries.ts` so the exported JSON
# can be pasted straight in.

PAGE = 5  # 0-based; page 6 of HOPEANDFEAR_Cards.pdf holds ancestries + communities

# The card grid is owned by extract_hf_cards, which measures it against the rendered page. Importing
# it rather than repeating it means the marks and the faces can never be cut on different grids, which
# would slide every strike off its line.
from extract_hf_cards import CARD_H, CARD_W, COL_X, ROW_Y, card_rect  # noqa: E402

CARDS = [
    ("ancestry-aetheris", "Aetheris", 0, 0),
    ("ancestry-skykin", "Skykin", 0, 1),
    ("ancestry-earthkin", "Earthkin", 1, 0),
    ("ancestry-tidekin", "Tidekin", 1, 1),
    ("ancestry-emberkin", "Emberkin", 2, 0),
    ("ancestry-gnome", "Gnome", 2, 1),
]

DPI = 250  # 182pt wide card -> ~630px, plenty to mark against and small enough to inline




def write_faces(page: fitz.Page, out_dir: pathlib.Path) -> None:
    """
    Write each card face as a 750x1050 webp, the size every other card art in the app uses.

    These become the ancestry cards themselves, replacing the app-rendered text version, so they have
    to match the forged card's pixel dimensions exactly or the strike positions land off the lines.
    The `_lod` twins are a gitignored build artifact: run `scripts/generate_lods.py` after this.
    """
    from PIL import Image  # only needed for this path, so not a hard dependency of the marker
    import io

    out_dir.mkdir(parents=True, exist_ok=True)
    for card_id, title, col, row in CARDS:
        rect = card_rect(col, row)
        # Render well above target, then downsample: the PDF's text is vector, so oversampling and
        # shrinking is what keeps the small print legible at 750px.
        pix = page.get_pixmap(clip=rect, dpi=600)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        img = img.resize((750, 1050), Image.LANCZOS)
        name = card_id.replace("ancestry-", "")
        path = out_dir / f"{name}.webp"
        img.save(path, "WEBP", quality=90, method=6)
        print(f"  {title:10} -> {path.name}  ({path.stat().st_size / 1024:.0f} KB)")


def crop(page: fitz.Page, rect: fitz.Rect) -> str:
    """The card face as a base64 JPEG, so the tool is one file with no loose assets."""
    pix = page.get_pixmap(clip=rect, dpi=DPI)
    return base64.b64encode(pix.tobytes("jpeg", jpg_quality=88)).decode("ascii")


def prefill(page: fitz.Page, rect: fitz.Rect) -> dict:
    """
    Guess the two features' text lines from the PDF's own layout.

    Every one of these cards is built the same way: a title block, a flavour paragraph, feature one,
    feature two, then the copyright footer. So the two feature blocks are simply the third and fourth
    text blocks down the card. Each line's strike sits at its vertical middle, as a fraction of card
    height, which is the same coordinate space the app strikes in.

    A card that does not match the expected shape returns empty lists rather than wrong ones: better
    to mark six lines by hand than to trust a bad guess.
    """
    blocks = [b for b in page.get_text("dict", clip=rect)["blocks"] if b.get("lines")]
    blocks.sort(key=lambda b: b["bbox"][1])
    if len(blocks) < 4:
        return {"a": [], "b": [], "guessed": False}

    def centres(block) -> list[float]:
        out = []
        for line in block["lines"]:
            _, y0, _, y1 = line["bbox"]
            out.append(round((((y0 + y1) / 2) - rect.y0) / rect.height, 4))
        return out

    return {"a": centres(blocks[2]), "b": centres(blocks[3]), "guessed": True}


def feature_names(page: fitz.Page, rect: fitz.Rect) -> tuple[str, str]:
    """The two feature names, shown as labels so the marker knows which block is which."""
    blocks = [b for b in page.get_text("dict", clip=rect)["blocks"] if b.get("lines")]
    blocks.sort(key=lambda b: b["bbox"][1])
    names = []
    for b in blocks[2:4]:
        text = "".join(s["text"] for line in b["lines"] for s in line["spans"])
        names.append(text.split(":")[0].strip() if ":" in text else "?")
    while len(names) < 2:
        names.append("?")
    return names[0], names[1]


# Raw, so the `\n` escapes in the JavaScript below survive Python's own string escaping.
HTML = r"""<!doctype html>
<meta charset="utf-8">
<title>Ancestry line marker</title>
<style>
  :root { --gold:#C9A227; --red:#C0392B; --ink:#12161D; --panel:#1B212B; --edge:#2E3846; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--ink); color:#E7E3D8;
         font:14px/1.5 system-ui,"Segoe UI",sans-serif; }
  header { position:sticky; top:0; z-index:5; background:var(--panel);
           border-bottom:1px solid var(--edge); padding:12px 20px;
           display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:15px; margin:0; letter-spacing:.08em; text-transform:uppercase; }
  .hint { color:#8C97A8; font-size:12px; }
  button { background:#2A3342; color:#E7E3D8; border:1px solid var(--edge);
           padding:7px 13px; border-radius:6px; cursor:pointer; font-size:13px; }
  button:hover { background:#354054; }
  button.on { background:var(--gold); color:#1A1206; border-color:var(--gold); font-weight:600; }
  button.b.on { background:var(--red); color:#fff; border-color:var(--red); }
  main { display:flex; flex-wrap:wrap; gap:26px; padding:22px; }
  .card { background:var(--panel); border:1px solid var(--edge); border-radius:10px; padding:12px; }
  .name { font-weight:600; margin-bottom:2px; }
  .legend { font-size:11px; color:#8C97A8; margin-bottom:9px; }
  .legend b { color:var(--gold); font-weight:600; }
  .legend i { color:var(--red); font-style:normal; font-weight:600; }
  .stage { position:relative; width:340px; cursor:crosshair; user-select:none; }
  .stage img { width:100%; display:block; border-radius:4px; }
  .line { position:absolute; height:0; border-top:2px solid var(--gold); cursor:ns-resize; }
  .line.b { border-top-color:var(--red); }
  /* Lines sit ~14px apart, so a permanent delete button on each one is a pile of overlapping
     circles. Only the line under the cursor shows its own. */
  .line .x { display:none; position:absolute; right:-23px; top:-10px; width:19px; height:19px;
             border-radius:50%; background:#2A3342; color:#B9C2D0; border:1px solid var(--edge);
             font-size:12px; line-height:17px; text-align:center; cursor:pointer; }
  .line:hover { border-top-width:3px; }
  .line:hover .x { display:block; }
  .line .x:hover { background:var(--red); color:#fff; }
  .count { font-size:11px; color:#8C97A8; margin-top:8px; }
  #out { width:100%; height:190px; background:#0D1117; color:#9FD1A0; border:1px solid var(--edge);
         border-radius:8px; padding:12px; font:12px/1.5 ui-monospace,Consolas,monospace;
         white-space:pre; overflow:auto; }
  footer { padding:0 22px 30px; }
  label { font-size:12px; color:#8C97A8; }
  input[type=number] { width:74px; background:#0D1117; color:#E7E3D8; border:1px solid var(--edge);
                       border-radius:5px; padding:5px 7px; }
</style>

<header>
  <h1>Ancestry line marker</h1>
  <span class="hint">Click a card to add a line. Drag to move. Click the circle to delete.</span>
  <button id="mA" class="on">Marking feature 1</button>
  <button id="mB" class="b">Marking feature 2</button>
  <span style="flex:1"></span>
  <label>x0 <input type="number" id="x0" step="0.005" min="0" max="1"></label>
  <label>x1 <input type="number" id="x1" step="0.005" min="0" max="1"></label>
  <button id="reset">Reset to the PDF's own line positions</button>
  <button id="save">Export JSON</button>
</header>

<main id="cards"></main>

<footer>
  <p class="hint">Paste this into <code>src/data/ancestry-trait-regions.ts</code>. It updates as you
    mark, and your work is kept in this browser if you close the page.</p>
  <div id="out"></div>
</footer>

<script>
const DATA = __DATA__;
const KEY  = 'rk-ancestry-marks-' + DATA.pack;

// The marks: { id: {a:[y...], b:[y...]} }, y as a fraction of card height. Restored from the last
// session if there is one, so closing the tab mid-way costs nothing.
let marks = {}, x0 = 0.065, x1 = 0.935, mode = 'a';

function fresh() {
  marks = {};
  for (const c of DATA.cards) marks[c.id] = { a: [...c.pre.a], b: [...c.pre.b] };
}
const saved = localStorage.getItem(KEY);
if (saved) { try { const s = JSON.parse(saved); marks = s.marks; x0 = s.x0 ?? x0; x1 = s.x1 ?? x1; } catch { fresh(); } }
else fresh();

const $ = (s) => document.querySelector(s);
const store = () => localStorage.setItem(KEY, JSON.stringify({ marks, x0, x1 }));

function build() {
  $('#cards').innerHTML = '';
  for (const c of DATA.cards) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="name">${c.title}</div>
      <div class="legend"><b>1 &mdash; ${c.f1}</b> &nbsp;/&nbsp; <i>2 &mdash; ${c.f2}</i></div>
      <div class="stage" data-id="${c.id}"><img src="data:image/jpeg;base64,${c.img}" draggable="false"></div>
      <div class="count" data-count="${c.id}"></div>`;
    $('#cards').appendChild(el);
  }
  for (const stage of document.querySelectorAll('.stage')) {
    stage.addEventListener('mousedown', (e) => {
      if (e.target !== stage && e.target.tagName !== 'IMG') return;
      const r = stage.getBoundingClientRect();
      marks[stage.dataset.id][mode].push(+(((e.clientY - r.top) / r.height).toFixed(4)));
      marks[stage.dataset.id][mode].sort((p, q) => p - q);
      draw();
    });
  }
  draw();
}

function draw() {
  for (const stage of document.querySelectorAll('.stage')) {
    const id = stage.dataset.id;
    stage.querySelectorAll('.line').forEach((n) => n.remove());
    for (const key of ['a', 'b']) {
      marks[id][key].forEach((y, i) => {
        const line = document.createElement('div');
        line.className = 'line' + (key === 'b' ? ' b' : '');
        line.style.top = (y * 100) + '%';
        line.style.left = (x0 * 100) + '%';
        line.style.width = ((x1 - x0) * 100) + '%';
        line.innerHTML = '<span class="x">&times;</span>';
        line.querySelector('.x').onmousedown = (e) => {
          e.stopPropagation();
          marks[id][key].splice(i, 1);
          draw();
        };
        line.onmousedown = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const r = stage.getBoundingClientRect();
          const move = (ev) => {
            marks[id][key][i] = +Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)).toFixed(4);
            draw();
          };
          const up = () => {
            marks[id][key].sort((p, q) => p - q);
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            draw();
          };
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
        };
        stage.appendChild(line);
      });
    }
    stage.parentElement.querySelector('[data-count]').textContent =
      `${marks[id].a.length} line(s) on feature 1, ${marks[id].b.length} on feature 2`;
  }
  emit();
  store();
}

// The exact shape ANCESTRY_STRIKES wants, so it is a paste rather than a translation.
function emit() {
  const rows = DATA.cards.map((c) => {
    const m = marks[c.id];
    return `  '${c.id}': { a: [${m.a.join(', ')}], b: [${m.b.join(', ')}] },`;
  });
  $('#out').textContent =
    `export const ANCESTRY_STRIKES: Record<string, { a: number[]; b: number[] }> = {\n` +
    rows.join('\n') + `\n};\n\nexport const STRIKE_X0 = ${x0};\nexport const STRIKE_X1 = ${x1};`;
}

$('#mA').onclick = () => { mode = 'a'; $('#mA').classList.add('on'); $('#mB').classList.remove('on'); };
$('#mB').onclick = () => { mode = 'b'; $('#mB').classList.add('on'); $('#mA').classList.remove('on'); };
$('#reset').onclick = () => { if (confirm('Throw away your marks and start from the PDF again?')) { fresh(); draw(); } };
$('#x0').value = x0; $('#x1').value = x1;
$('#x0').oninput = (e) => { x0 = +e.target.value; draw(); };
$('#x1').oninput = (e) => { x1 = +e.target.value; draw(); };
$('#save').onclick = () => {
  const blob = new Blob([JSON.stringify({ marks, x0, x1 }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = DATA.pack + '-ancestry-strikes.json';
  a.click();
};

build();
</script>
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pdf", default="D:/Tools/Homebrew/Daggerheart/HOPEANDFEAR_Cards.pdf")
    ap.add_argument("--out", default="ancestry-marker.html")
    ap.add_argument("--pack", default="hope-and-fear")
    ap.add_argument("--faces", metavar="DIR", help="write the card faces as webp and exit")
    args = ap.parse_args()

    doc = fitz.open(args.pdf)
    page = doc[PAGE]

    if args.faces:
        write_faces(page, pathlib.Path(args.faces))
        return

    cards = []
    for card_id, title, col, row in CARDS:
        rect = card_rect(col, row)
        f1, f2 = feature_names(page, rect)
        pre = prefill(page, rect)
        if not pre["guessed"]:
            print(f"  ! {title}: layout not recognised, mark it by hand", file=sys.stderr)
        cards.append(
            {
                "id": card_id,
                "title": title,
                "f1": f1,
                "f2": f2,
                "img": crop(page, rect),
                "pre": {"a": pre["a"], "b": pre["b"]},
            }
        )
        print(f"  {title:10} {len(pre['a'])} + {len(pre['b'])} lines   ({f1} / {f2})")

    data = json.dumps({"pack": args.pack, "cards": cards})
    out = pathlib.Path(args.out)
    out.write_text(HTML.replace("__DATA__", data), encoding="utf-8")
    print(f"\nWrote {out.resolve()}  ({out.stat().st_size / 1e6:.1f} MB)")
    print("Open it in a browser, check the lines, then Export JSON.")


if __name__ == "__main__":
    main()
