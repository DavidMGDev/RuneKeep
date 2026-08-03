/** Pure, testable helpers extracted from redesigned-sheet.tsx (#300 phase 4). No React/Reanimated. */
import { type Wildshape } from '@/data/wildshape-data';

const WS_TRAIT_LABEL: Record<string, string> = { agility: 'Agility', strength: 'Strength', finesse: 'Finesse', instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge' };

/** One-line stat summary for a Beastform's overview face (#227): "+2 Strength · +2 Evasion · …". */
export function wildshapeSummary(w: Wildshape): string {
  const parts: string[] = [];
  for (const e of w.effects) {
    const d = e.delta ?? 0;
    const s = d >= 0 ? '+' : '';
    if (e.target === 'evasion') parts.push(`${s}${d} Evasion`);
    else if (e.target === 'majorThreshold') parts.push(`${s}${d} Thresholds`); // major+severe move together
    else if (e.target === 'severeThreshold') continue;
    else if (WS_TRAIT_LABEL[e.target]) parts.push(`${s}${d} ${WS_TRAIT_LABEL[e.target]}`);
  }
  return parts.join(' · ');
}

/** Boundary slots for a simple ±1 track (stress/hope/armor): first markable / last marked. */
export function trackBounds(t: { total: number; active: number; locked?: number }) {
  return {
    up: t.active < t.total - (t.locked ?? 0) ? t.active : -1,
    down: t.active > 0 ? t.active - 1 : -1,
  };
}

/** Width of a domain chip for its label — sized for the WIDER native glyph run plus real padding,
 *  so the chips no longer hug the text edge-to-edge on the phone (#43 D). */
export function chipWidth(label: string): number {
  return Math.round(label.length * 7.6) + 18;
}

export interface WashRect { left: number; top: number; width: number; height: number }

/**
 * The desaturation wash, minus rectangular holes (v0.28.0).
 *
 * A blend layer can only take colour AWAY, so "this region keeps its colour" has to mean "the layer
 * has a hole there". Given the sheet's size and the regions to spare, this returns the bands that
 * cover everything else, top to bottom. With no holes it is exactly one full-size rect, which is the
 * wash as it was.
 *
 * Holes are assumed not to overlap each other vertically. The sheet's two, the portrait photo and the
 * hit points panel, sit at opposite ends of the page and never will.
 */
export function washBands(w: number, h: number, holes: WashRect[]): WashRect[] {
  if (w <= 0 || h <= 0) return [];
  const rows = [...holes].sort((a, b) => a.top - b.top);
  const out: WashRect[] = [];
  let y = 0;
  for (const r of rows) {
    if (r.top > y) out.push({ left: 0, top: y, width: w, height: r.top - y });
    if (r.left > 0) out.push({ left: 0, top: r.top, width: r.left, height: r.height });
    const right = r.left + r.width;
    if (right < w) out.push({ left: right, top: r.top, width: w - right, height: r.height });
    y = Math.max(y, r.top + r.height);
  }
  if (y < h) out.push({ left: 0, top: y, width: w, height: h - y });
  return out;
}

/**
 * How the armor shields are laid out (v0.32.1, corrected v0.32.2).
 *
 * The track was always twelve 17px shields in two rows of six, because twelve is the ceiling. Almost
 * nobody is at the ceiling, so the usual sight was two rows of small shields with the second one
 * entirely dead.
 *
 * At five or fewer, the SECOND ROW is what goes: five shields on one line, scaled up to use the space
 * both rows used to take. Still five, not "however many you have" — the empty ones say how far the
 * track can go, exactly as the twelve always did. Six or more keeps the original two rows of twelve
 * unchanged, because that many at the larger size does not fit the band.
 *
 * Pure, so the geometry can be checked without a screen.
 */
export const ARMOR_ONE_ROW_MAX = 5;
/** The band the shields live in, in design px: as wide as the two-row layout, as tall as both rows. */
const ARMOR_BAND_W = 122; // 5 * 21 + 17, the twelve-shield row
const ARMOR_BAND_H = 39; // 22 + 17, both rows
export function armorTrackLayout(unlocked: number): { count: number; size: number; slots: { x: number; y: number }[] } {
  const safe = Math.max(0, Math.floor(unlocked));
  if (safe > ARMOR_ONE_ROW_MAX) {
    return { count: 12, size: 17, slots: Array.from({ length: 12 }, (_, i) => ({ x: (i % 6) * 21, y: Math.floor(i / 6) * 22 })) };
  }
  // Five shields spanning the band exactly, centred in its height. The SIZE is as large as five will
  // go with a small gap; the PITCH is then whatever makes the last one land on the band's right edge,
  // so the row lines up with the twelve-shield one it replaces and the panel never shifts.
  const count = ARMOR_ONE_ROW_MAX;
  const size = Math.floor((ARMOR_BAND_W - 2 * (count - 1)) / count);
  const pitch = (ARMOR_BAND_W - size) / (count - 1);
  const y = Math.round((ARMOR_BAND_H - size) / 2);
  return { count, size, slots: Array.from({ length: count }, (_, i) => ({ x: i * pitch, y })) };
}
