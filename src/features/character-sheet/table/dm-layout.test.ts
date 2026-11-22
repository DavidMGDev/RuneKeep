import { clearSpot, DEFAULT_LOOK, DM_STARTING_LOOK, seatControls, STARTING_LOOK, TABLE_PRESETS, WILD_TABLES } from './deck-look';

// The felt beside the port at 1100x640, 1280x720, 1600x900 and 1920x1080.
const FELTS = [[791, 640], [936, 720], [1182, 900], [1423, 1080]];
const looks = [DEFAULT_LOOK, STARTING_LOOK, DM_STARTING_LOOK, ...TABLE_PRESETS.map((p) => p.look), ...WILD_TABLES];
const PAD = 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

it('gives the seven control dice room on every ready-made table, at every desktop size', () => {
  const clashes: string[] = [];
  looks.forEach((l, n) => {
    if (l.controls !== 'dice') return;
    for (const [w, h] of FELTS) {
      const handH = Math.round((h - PAD * 2) * (l.areaSize / 100));
      const top = l.areaY >= 0 ? clamp(l.areaY * h - handH / 2, PAD, h - PAD - handH) : l.areaPos === 'top' ? PAD : l.areaPos === 'middle' ? (h - handH) / 2 : h - PAD - handH;
      const felt = { left: PAD, top: PAD, right: w - PAD, bottom: h - PAD };
      const hand = { left: PAD, top, right: w - PAD, bottom: top + handH };
      const at = seatControls(l, 7, l.ctlDir === 'row' ? 88 : 92, felt, hand, { x: clamp(l.supX * w, 200, w - 200), y: clamp(l.supY * h, 50, h - 50) }, { x: clamp(l.catX * w, 66, w - 66), y: clamp(l.catY * h, 66, h - 66) });
      if (!at.clear) clashes.push(`table ${n} at ${w}x${h}`);
    }
  });
  expect(clashes).toEqual([]);
});

it('leaves a row alone where nothing is in its way', () => {
  expect(clearSpot({ x: 500, y: 400 }, { x: 100, y: 50 }, { left: 0, top: 0, right: 1000, bottom: 800 }, [])).toEqual({ x: 500, y: 400, clear: true });
});
