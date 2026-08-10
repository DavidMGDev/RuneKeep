/**
 * The dice button (v0.40.1, owner) — the Evasion and Armor panel's mirror, drawn from scratch.
 *
 * v0.40.0 made this by reflecting that panel's own artwork behind a clip, which got the shape and the
 * alignment exactly right and left one thing wrong: the clip cut the asset open, so the left side was
 * bare fill with no gold rail. An asset cut in half cannot close itself, and nothing painted over the
 * top of it can be masked to the fill either, which is what the decoration needs.
 *
 * So the shape is a POLYGON now, and it is not hand-drawn: the panel's two paths were flattened,
 * mapped through the same non-uniform scale the panel is stretched by, mirrored about the diamond's
 * centre line, clipped at the hit points panel's left edge, and simplified. The result is nine
 * straight edges, because the artwork is nine straight edges. It is the same shape in the same place
 * as before, now with a rail all the way round and an interior the decoration can be clipped to.
 *
 *   OUTER is the gold silhouette. INNER is the same shape inset by the rail's width, and it is both
 *   the dark fill and the clip path for the pattern.
 *
 * The decoration says what the button will GIVE you rather than what it is: closed, it offers dice, so
 * it carries numbers; open, it offers your hit points back, so it turns red and carries hearts.
 */
import { memo } from 'react';
import Svg, { ClipPath, Defs, G, Path, Polygon, Text as SvgText } from 'react-native-svg';

import { Body, Rune } from '@/constants/theme';

/** The panel, in its own box: 46 wide, 95 tall, origin at the hit points panel's left edge. */
export const DICE_PANEL = { w: 46, h: 95 };

const OUTER = '0,94.89 1.17,94.89 2.12,94.01 11.9,82.95 45.96,82.86 15.55,52.5 11.32,48.74 22.77,37.49 0,15.02';
const INNER = '1.7,92.34 10.66,81.61 43.26,81.59 10.48,48.59 21.52,37.72 1.7,18.25';

const RAIL = Rune.goldEdge;
const INK = '#0A0D11';
const RED = '#A11A18';
const NUMBER_INK = 'rgba(244,220,160,0.9)';
const HEART_INK = 'rgba(255,255,255,0.92)';

/**
 * The diagonal rows.
 *
 * A square lattice sheared half a step per row, which is what makes the rows read as diagonals rather
 * than as a grid, and then filtered: a cell survives only if its whole glyph fits inside the panel.
 *
 * The filter is the difference between decoration and mess. Clipping alone leaves half a "18" against
 * the rail, which does not read as a pattern running under an edge, it reads as a mistake, and a
 * cut-off digit is a different digit. Testing the glyph's four corners against the polygon costs
 * nothing once at module load and leaves only whole numbers.
 */
const STEP = 7.0;
const GLYPH = 5.0;
/** How much of the glyph must be inside. Its ink is well within its box, so a little under half is right. */
const INSET = 0.32;

/** Ray casting, the ordinary way. */
function inside(poly: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const INNER_PTS: [number, number][] = INNER.split(' ').map((p) => p.split(',').map(Number) as [number, number]);

const CELLS: { x: number; y: number; i: number }[] = (() => {
  const out: { x: number; y: number; i: number }[] = [];
  const h = GLYPH * INSET;
  let i = 0;
  for (let r = 0; r < 16; r++) {
    for (let c = -2; c < 9; c++) {
      const x = c * STEP + r * (STEP / 2) - 6;
      const y = 10 + r * STEP;
      const fits = [
        [x - h, y - h], [x + h, y - h], [x - h, y + h], [x + h, y + h],
      ].every(([px, py]) => inside(INNER_PTS, px, py));
      if (fits) out.push({ x, y, i: i++ });
    }
  }
  return out;
})();

/**
 * Fixed, not random-per-render: a pattern that reshuffled on every repaint would be a flicker.
 *
 * Single digits only. A two-digit number in a 5dp cell is either unreadable or wider than the lattice,
 * and at this size the pattern's job is texture rather than arithmetic.
 */
const FACES = [4, 7, 2, 9, 6, 3, 8, 5, 1, 7, 4, 9, 2, 6, 8, 3, 5, 1, 9, 4];

/** A small heart, drawn in a 10x10 box with its own top-left at (0,0). */
const HEART = 'M5 9.1 C1.4 6.6 0.4 5 0.4 3.4 C0.4 1.9 1.6 0.8 3 0.8 C3.9 0.8 4.6 1.25 5 1.9 C5.4 1.25 6.1 0.8 7 0.8 C8.4 0.8 9.6 1.9 9.6 3.4 C9.6 5 8.6 6.6 5 9.1 z';

export const DiceButtonArt = memo(function DiceButtonArt({ on }: { on: boolean }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${DICE_PANEL.w} ${DICE_PANEL.h}`}>
      <Defs>
        <ClipPath id="dicePanelFill">
          <Polygon points={INNER} />
        </ClipPath>
      </Defs>
      {/* the rail, and the fill inset inside it: the left edge is a real edge now, not a cut */}
      <Polygon points={OUTER} fill={RAIL} />
      <Polygon points={INNER} fill={on ? RED : INK} />
      <G clipPath="url(#dicePanelFill)">
        {CELLS.map((c) =>
          on ? (
            <Path key={c.i} d={HEART} fill={HEART_INK} transform={`translate(${c.x - GLYPH / 2} ${c.y - GLYPH / 2}) scale(${GLYPH / 10})`} />
          ) : (
            <SvgText key={c.i} x={c.x} y={c.y + GLYPH * 0.36} fill={NUMBER_INK} fontSize={GLYPH} fontFamily={Body.bold} textAnchor="middle">
              {FACES[c.i % FACES.length]}
            </SvgText>
          ),
        )}
      </G>
    </Svg>
  );
});
