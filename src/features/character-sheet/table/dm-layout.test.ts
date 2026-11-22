import { clearSpot, DEFAULT_LOOK, DM_STARTING_LOOK, fitSize, seatControls, STARTING_LOOK, TABLE_PRESETS, WILD_TABLES } from './deck-look';

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

it('keeps the seven off the cards of the starting DM table, whatever the screen beside it leaves (v0.50.2)', () => {
  const l = DM_STARTING_LOOK;
  const covered: string[] = [];
  for (let h = 640; h <= 1100; h += 20) {
    for (let w = 640; w <= 1300; w += 6) {
      const handH = Math.round((h - PAD * 2) * (l.areaSize / 100));
      const top = clamp(l.areaY * h - handH / 2, PAD, h - PAD - handH);
      const cardH = fitSize(l, handH) * 1.4;
      const cardsTop = top + 14 + l.rowY * Math.max(0, handH - cardH - 28) - 8;
      const at = seatControls(l, 7, 88, { left: PAD, top: PAD, right: w - PAD, bottom: h - PAD }, { left: PAD, top, right: w - PAD, bottom: top + handH },
        { x: clamp(l.supX * w, PAD + 179, w - PAD - 179), y: clamp(l.supY * h, PAD + 40, h - PAD - 40) }, { x: clamp(l.catX * w, PAD + 56, w - PAD - 56), y: clamp(l.catY * h, PAD + 56, h - PAD - 56) });
      // The lowest row's dice end 20px above its box's edge: only a label's margin may reach the cards.
      const over = at.y + (at.wrap ? 100 : 52) - cardsTop;
      if (over > 20) covered.push(`${w}x${h} by ${Math.round(over)}`);
    }
  }
  expect(covered.slice(0, 12)).toEqual([]);
});

it('leaves a row alone where nothing is in its way', () => {
  expect(clearSpot({ x: 500, y: 400 }, { x: 100, y: 50 }, { left: 0, top: 0, right: 1000, bottom: 800 }, [])).toEqual({ x: 500, y: 400, clear: true });
});
