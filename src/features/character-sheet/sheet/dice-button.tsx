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
const NUMBER_INK = 'rgba(246,222,164,0.94)';
const HEART_INK = 'rgba(255,255,255,0.94)';

/**
 * The weave (v0.40.2, owner: "it looks like if someone just dropped a bag of numbers on that UI").
 *
 * v0.40.1 sheared a lattice and then threw away every cell whose glyph did not fit whole. Throwing
 * cells away is what wrecked it: the survivors were sparse, unaligned with each other and upright, so
 * they read as spillage rather than as a pattern, and the shape was mostly empty.
 *
 * The fix is the opposite of a filter. ONE rotated grid, regular, dense, drawn past every edge of the
 * panel and then MASKED by it. Rotating the whole group rather than each glyph is what makes it a
 * pattern: the rows are straight lines running off the panel at {@link ANGLE}, the glyphs are turned
 * with them, and the spacing is identical everywhere because it is one grid. A glyph the rail cuts
 * through is correct rather than embarrassing, because a pattern is supposed to run under its frame.
 *
 * v0.41.0 makes it CHEAP (owner: "it causes incredible lag during the transition"). Two things cost:
 *
 *  1. The grid was generated over the shape's bounding CIRCLE in the rotated frame, which is most of a
 *     square: about 175 cells, of which the panel's tapering wedge shows perhaps a quarter. Every one
 *     of the rest was still a real node in the tree, laid out and clipped away. They are now tested
 *     against the panel itself, once at module load, and the misses never reach the renderer.
 *  2. Toggling swapped 175 text nodes for 175 paths, which is a mount and an unmount of the whole
 *     pattern in the same frame that the vitals were cross-fading. Both layers are mounted ONCE now
 *     and the toggle only changes their opacity, so pressing the button touches three properties
 *     instead of rebuilding a subtree.
 */
const ANGLE = -32;
const STEP = 8.4;
const GLYPH = 6.2;
/** The panel's centre, which the grid turns about, and how far the grid must reach to cover a corner. */
const CX = DICE_PANEL.w / 2;
const CY = DICE_PANEL.h / 2;
const REACH = Math.hypot(CX, CY) + STEP;

const INNER_PTS: [number, number][] = INNER.split(' ').map((q) => q.split(',').map(Number) as [number, number]);

/** Ray casting, the ordinary way. */
function inside(poly: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const RAD = (ANGLE * Math.PI) / 180;
/** Where a cell of the rotated grid actually lands on the panel. */
function onPanel(x: number, y: number): boolean {
  const dx = x - CX, dy = y - CY;
  const px = CX + dx * Math.cos(RAD) - dy * Math.sin(RAD);
  const py = CY + dx * Math.sin(RAD) + dy * Math.cos(RAD);
  // A glyph the rail clips is still drawn, so the test is generous by half a cell on every side.
  const r = GLYPH / 2;
  return (
    inside(INNER_PTS, px, py) ||
    inside(INNER_PTS, px - r, py - r) || inside(INNER_PTS, px + r, py - r) ||
    inside(INNER_PTS, px - r, py + r) || inside(INNER_PTS, px + r, py + r)
  );
}

const CELLS: { x: number; y: number; i: number }[] = (() => {
  const out: { x: number; y: number; i: number }[] = [];
  let i = 0;
  for (let v = -REACH; v <= REACH; v += STEP) {
    // Every other row is offset half a step, so the rows interlock instead of stacking into columns.
    const shift = (Math.round((v + REACH) / STEP) % 2) * (STEP / 2);
    for (let u = -REACH; u <= REACH; u += STEP) {
      const x = CX + u + shift;
      const y = CY + v;
      if (onPanel(x, y)) out.push({ x, y, i: i++ });
    }
  }
  return out;
})();

/**
 * Fixed, not random-per-render: a pattern that reshuffled on every repaint would be a flicker.
 *
 * Single digits. Two-digit numbers at this size are a smudge, and they make the cells different
 * widths, which is the one thing a lattice cannot absorb.
 */
const FACES = [4, 7, 2, 9, 6, 3, 8, 5, 1, 7, 4, 9, 2, 6, 8, 3, 5, 1, 9, 4, 6, 2, 7, 3];

/** A small heart, drawn in a 10x10 box with its own top-left at (0,0). */
const HEART = 'M5 9.1 C1.4 6.6 0.4 5 0.4 3.4 C0.4 1.9 1.6 0.8 3 0.8 C3.9 0.8 4.6 1.25 5 1.9 C5.4 1.25 6.1 0.8 7 0.8 C8.4 0.8 9.6 1.9 9.6 3.4 C9.6 5 8.6 6.6 5 9.1 z';

/** Both layers exist for the life of the button; only their opacity changes when it is pressed. */
const Numbers = memo(function Numbers() {
  return (
    <>
      {CELLS.map((c) => (
        <SvgText key={c.i} x={c.x} y={c.y + GLYPH * 0.36} fill={NUMBER_INK} fontSize={GLYPH} fontFamily={Body.bold} textAnchor="middle">
          {FACES[c.i % FACES.length]}
        </SvgText>
      ))}
    </>
  );
});

const Hearts = memo(function Hearts() {
  return (
    <>
      {CELLS.map((c) => (
        <Path key={c.i} d={HEART} fill={HEART_INK} transform={`translate(${c.x - GLYPH / 2} ${c.y - GLYPH / 2}) scale(${GLYPH / 10})`} />
      ))}
    </>
  );
});

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
      {/* The clip sits on the OUTER group so it stays in the panel's own axes; the rotation is inside
          it, so the pattern turns and the mask does not. Both layers stay mounted (see the note on
          the weave): pressing the button changes opacity, it does not rebuild a subtree. */}
      <G clipPath="url(#dicePanelFill)">
        <G transform={`rotate(${ANGLE} ${CX} ${CY})`}>
          <G opacity={on ? 0 : 1}><Numbers /></G>
          <G opacity={on ? 1 : 0}><Hearts /></G>
        </G>
      </G>
    </Svg>
  );
});
