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
