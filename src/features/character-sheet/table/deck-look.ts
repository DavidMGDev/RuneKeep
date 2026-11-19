/**
 * How the desktop table lays out the hand (v0.47.0): every setting the Table settings panel offers, the looks it
 * ships with, and the share code a look travels as.
 *
 * Pure on purpose: the carousel reads a `DeckLook` every frame and the panel edits one, and neither needs to know
 * how the other works. Each control the panel draws is described in `LOOK_CONTROLS`, so adding a setting is one
 * entry here plus the line of maths that uses it in the carousel.
 */

export type EdgeEffect = 'fade' | 'blur' | 'darken' | 'grey' | 'none';
export type ExitStyle = 'fade' | 'shrink' | 'sink' | 'cut';
export type StackOrder = 'centre' | 'left' | 'right';
export type CentreClick = 'take' | 'equip' | 'nothing';

export interface DeckLook {
  // The hand: size and spacing
  /** The centre card's width, px. */
  size: number;
  /** How many cards share the spotlight (full size, no effects). */
  centre: number;
  /** Cards shown on each side of the spotlight. */
  side: number;
  /** The gap between neighbours, as a share of a card's width; below 0 they overlap. */
  spacing: number;
  /** How much tighter each step out packs against the one inside it. */
  pack: number;
  // The hand: shape
  /** How far the outer cards bow down (px at the last card; negative bows up). */
  arc: number;
  /** Degrees each step out turns, like a fanned hand. */
  tilt: number;
  /** Px the spotlight cards rise above the row. */
  lift: number;
  /** Where the row sits in its area, 0 top to 1 bottom. */
  rowY: number;
  // The hand: depth
  /** How much smaller each step out gets. */
  shrink: number;
  /** The smallest a card may get, as a share of the centre card. */
  minScale: number;
  /** Px each step out drops (negative rises). */
  drop: number;
  /** Degrees each step out turns away in 3D (0 keeps the hand flat). */
  turn: number;
  /** The 3D camera's distance, px: lower is more dramatic. */
  perspective: number;
  /** Which cards lie on top where they overlap. */
  stack: StackOrder;
  // The hand: edges and fading
  /** What happens to cards near the left and right ends of the hand. */
  edge: EdgeEffect;
  /** How much of the width, at each side, the edge effect covers (percent). */
  edgeWidth: number;
  /** How much darker each step out gets. */
  dim: number;
  /** Px of blur each step out. */
  blur: number;
  /** How much colour each step out loses. */
  grey: number;
  /** The shadow under every card. */
  shadow: number;
  /** A warm light behind the spotlight card. */
  glow: number;
  /** How a card leaves when it passes the last visible place. */
  exit: ExitStyle;
  // Motion
  /** What moves the hand besides the wheel: dragging it, the pointer gliding over it, or nothing. */
  scroll: 'drag' | 'follow' | 'wheel';
  /** Cards one wheel notch moves. */
  wheel: number;
  /** Px of drag that sweeps the whole deck (shorter is faster). */
  swipe: number;
  /** How quickly the deck settles on a card. */
  snap: number;
  /** How far a flick carries on after you let go. */
  flick: number;
  /** The deck wraps round: after the last card comes the first. */
  loop: boolean;
  /** Px a card rises under the pointer. */
  hoverLift: number;
  /** How much a card grows under the pointer. */
  hoverZoom: number;
  /** What a click on the centre card does. */
  centreClick: CentreClick;
  /** How a new deck's cards arrive when you switch decks. */
  switchFx: 'none' | 'fade' | 'slide' | 'deal';
  // The table
  /** The hand keeps an area of its own, or lies on the open table with everything else. */
  areaMode: 'tray' | 'free';
  /** Where the hand sits on the table. */
  areaPos: 'bottom' | 'middle' | 'top';
  /** How tall the hand's area is, as a share of the table (percent). */
  areaSize: number;
  /** How the hand's own area is marked off from the rest of the table. */
  divider: 'none' | 'line' | 'shade';
  /** What stops the dice at the table's edge. */
  walls: 'none' | 'line' | 'stone' | 'brass';
  /** The look of the dice you roll. */
  numberDice: 'resin' | 'stone' | 'metal';
  /** The look of the dice that are controls (the deck die and the rest). */
  controlDice: 'obsidian' | 'gilded' | 'ivory';
  /** The table's controls as dice you can throw, as plain buttons, or hidden (right click still has them). */
  controls: 'dice' | 'buttons' | 'hidden';
  /** The tray of tokens to drag onto cards. */
  tokenTray: boolean;
}

export const DEFAULT_LOOK: DeckLook = {
  size: 210, centre: 1, side: 4, spacing: 0.04, pack: 0.35, arc: 0, tilt: 0, lift: 0, rowY: 0.5,
  shrink: 0.085, minScale: 0.3, drop: 0, turn: 0, perspective: 1400, stack: 'centre',
  edge: 'fade', edgeWidth: 17, dim: 0.12, blur: 0, grey: 0, shadow: 0.5, glow: 0, exit: 'fade',
  scroll: 'drag', wheel: 1, swipe: 340, snap: 1, flick: 1, loop: false, hoverLift: 10, hoverZoom: 1.04, centreClick: 'take', switchFx: 'slide',
  areaMode: 'tray', areaPos: 'bottom', areaSize: 40, divider: 'line', walls: 'line', numberDice: 'resin', controlDice: 'obsidian', controls: 'dice', tokenTray: true,
};

type NumKey = { [K in keyof DeckLook]: DeckLook[K] extends number ? K : never }[keyof DeckLook];
type ChoiceKey = { [K in keyof DeckLook]: DeckLook[K] extends string ? K : never }[keyof DeckLook];
type BoolKey = { [K in keyof DeckLook]: DeckLook[K] extends boolean ? K : never }[keyof DeckLook];

export type LookControl =
  | { kind: 'range'; key: NumKey; label: string; help: string; min: number; max: number; step: number; unit?: string; costly?: boolean }
  | { kind: 'choice'; key: ChoiceKey; label: string; help: string; options: { value: string; label: string }[] }
  | { kind: 'toggle'; key: BoolKey; label: string; help: string };

/** A labelled group of controls. `more` groups start folded, so a page opens on the few that matter most. */
export interface LookGroup { title: string; more?: boolean; controls: LookControl[] }
export interface LookPage { id: string; title: string; groups: LookGroup[] }

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

/**
 * The settings panel's pages (v0.47.1, owner: fewer tabs, closely related things together): the hand's look, how
 * it moves, and the table itself. The limits are wide on purpose: the owner wants to push past sensible.
 */
export const LOOK_PAGES: LookPage[] = [
  {
    id: 'hand',
    title: 'Hand',
    groups: [
      {
        title: 'Size and spacing',
        controls: [
          { kind: 'range', key: 'size', label: 'Card size', help: 'How wide the centre card is.', min: 80, max: 520, step: 2, unit: 'px' },
          { kind: 'range', key: 'side', label: 'Cards each side', help: 'How many cards show either side of the middle.', min: 0, max: 30, step: 1 },
          { kind: 'range', key: 'spacing', label: 'Gap', help: 'Space between cards. Below zero they overlap, down to a tight stack.', min: -0.95, max: 1.5, step: 0.01 },
          { kind: 'range', key: 'centre', label: 'Spotlight', help: 'Cards in the middle at full size, untouched by the effects.', min: 1, max: 9, step: 1 },
          { kind: 'range', key: 'pack', label: 'Squeeze', help: 'How much closer the outer cards pack together.', min: 0, max: 0.95, step: 0.01 },
        ],
      },
      {
        title: 'Shape',
        controls: [
          { kind: 'range', key: 'arc', label: 'Curve', help: 'Bows the row. Above zero the ends drop, below zero they rise.', min: -260, max: 260, step: 2, unit: 'px' },
          { kind: 'range', key: 'tilt', label: 'Fan', help: 'Turns each card as it steps out, like a hand of cards.', min: -30, max: 30, step: 0.5, unit: '°' },
          { kind: 'range', key: 'lift', label: 'Spotlight lift', help: 'Raises the middle cards above the rest.', min: -80, max: 160, step: 1, unit: 'px' },
          { kind: 'range', key: 'rowY', label: 'Row height', help: 'Where the row sits in its area, top to bottom.', min: 0, max: 1, step: 0.01 },
        ],
      },
      {
        title: 'Edges and fading',
        controls: [
          { kind: 'choice', key: 'edge', label: 'At the edges', help: 'What happens to cards near the ends of the row.', options: opts(['fade', 'Fade'], ['blur', 'Blur'], ['darken', 'Darken'], ['grey', 'Grey'], ['none', 'None']) },
          { kind: 'range', key: 'edgeWidth', label: 'Edge width', help: 'How far in from each end that reaches.', min: 0, max: 50, step: 1, unit: '%' },
          { kind: 'range', key: 'dim', label: 'Darken', help: 'Each card past the spotlight gets this much darker.', min: 0, max: 0.6, step: 0.01 },
          { kind: 'range', key: 'blur', label: 'Blur', help: 'Softens each card past the spotlight.', min: 0, max: 6, step: 0.1, unit: 'px', costly: true },
          { kind: 'range', key: 'grey', label: 'Colour loss', help: 'Drains colour from each card past the spotlight.', min: 0, max: 1, step: 0.02 },
          { kind: 'choice', key: 'exit', label: 'Leaving cards', help: 'How a card disappears past the last place.', options: opts(['fade', 'Fade'], ['shrink', 'Shrink'], ['sink', 'Sink'], ['cut', 'Cut']) },
        ],
      },
      {
        title: 'Depth and light',
        more: true,
        controls: [
          { kind: 'range', key: 'shrink', label: 'Shrink', help: 'Each card past the spotlight gets this much smaller.', min: 0, max: 0.4, step: 0.005 },
          { kind: 'range', key: 'minScale', label: 'Smallest card', help: 'The least a card may shrink to.', min: 0.05, max: 1, step: 0.01 },
          { kind: 'range', key: 'drop', label: 'Step down', help: 'Each card sinks this far as it steps out; below zero they climb.', min: -120, max: 120, step: 1, unit: 'px' },
          { kind: 'range', key: 'turn', label: '3D turn', help: 'Turns cards away as they step out, like a shelf of records.', min: 0, max: 85, step: 1, unit: '°' },
          { kind: 'range', key: 'perspective', label: '3D depth', help: 'How strong the 3D turn looks. Lower is more dramatic.', min: 250, max: 4000, step: 10, unit: 'px' },
          { kind: 'choice', key: 'stack', label: 'On top', help: 'Where cards overlap, which lie on top.', options: opts(['centre', 'Middle'], ['left', 'Left'], ['right', 'Right']) },
          { kind: 'range', key: 'shadow', label: 'Shadow', help: 'The shadow under every card.', min: 0, max: 1, step: 0.02 },
          { kind: 'range', key: 'glow', label: 'Spotlight glow', help: 'A warm light behind the centre card.', min: 0, max: 1, step: 0.02 },
        ],
      },
    ],
  },
  {
    id: 'motion',
    title: 'Motion',
    groups: [
      {
        title: 'Moving through the hand',
        controls: [
          { kind: 'choice', key: 'scroll', label: 'Moves with', help: 'Drag the hand, let it follow the pointer as you glide over it, or use only the wheel.', options: opts(['drag', 'Drag'], ['follow', 'Pointer'], ['wheel', 'Wheel only']) },
          { kind: 'range', key: 'swipe', label: 'Drag distance', help: 'How far you drag to cross the whole deck. Shorter is faster.', min: 80, max: 3000, step: 10, unit: 'px' },
          { kind: 'range', key: 'wheel', label: 'Wheel step', help: 'Cards per notch of the mouse wheel.', min: 1, max: 6, step: 1 },
          { kind: 'range', key: 'snap', label: 'Settle speed', help: 'How quickly the hand comes to rest on a card.', min: 0.2, max: 3, step: 0.05 },
          { kind: 'range', key: 'flick', label: 'Flick', help: 'How far it keeps going after a quick drag.', min: 0, max: 3, step: 0.05 },
          { kind: 'toggle', key: 'loop', label: 'Endless deck', help: 'After the last card comes the first again.' },
        ],
      },
      {
        title: 'Cards',
        controls: [
          { kind: 'choice', key: 'switchFx', label: 'Changing deck', help: 'How a deck\'s cards arrive when you switch to it.', options: opts(['slide', 'Slide'], ['deal', 'Deal'], ['fade', 'Fade'], ['none', 'Instant']) },
          { kind: 'choice', key: 'centreClick', label: 'Click the centre card', help: 'Any other card always slides to the centre first.', options: opts(['take', 'Take a copy'], ['equip', 'Equip'], ['nothing', 'Nothing']) },
          { kind: 'range', key: 'hoverLift', label: 'Hover lift', help: 'How far a card rises under the pointer.', min: 0, max: 60, step: 1, unit: 'px' },
          { kind: 'range', key: 'hoverZoom', label: 'Hover zoom', help: 'How much a card grows under the pointer.', min: 1, max: 1.5, step: 0.01 },
        ],
      },
    ],
  },
  {
    id: 'table',
    title: 'Table',
    groups: [
      {
        title: 'Where the hand lies',
        controls: [
          { kind: 'choice', key: 'areaMode', label: 'Hand area', help: 'Its own area that dice stay out of, or the open table, shared with dice and cards.', options: opts(['tray', 'Own area'], ['free', 'Open table']) },
          { kind: 'choice', key: 'areaPos', label: 'Position', help: 'Where on the table the hand sits.', options: opts(['bottom', 'Bottom'], ['middle', 'Middle'], ['top', 'Top']) },
          { kind: 'range', key: 'areaSize', label: 'Area size', help: 'How much of the table the hand takes.', min: 18, max: 80, step: 1, unit: '%' },
          { kind: 'choice', key: 'divider', label: 'Edge of the area', help: 'How the hand\'s area is marked off from the rest of the table.', options: opts(['line', 'Hairline'], ['shade', 'Soft shade'], ['none', 'Nothing']) },
        ],
      },
      {
        title: 'Dice',
        controls: [
          { kind: 'choice', key: 'controls', label: 'Controls', help: 'The deck, roll, state, cards and sort controls as dice to throw, as plain buttons, or hidden. Right click the table for them any time.', options: opts(['dice', 'Dice'], ['buttons', 'Buttons'], ['hidden', 'Hidden']) },
          { kind: 'choice', key: 'controlDice', label: 'Control dice', help: 'How the control dice are made.', options: opts(['obsidian', 'Obsidian'], ['gilded', 'Gilded'], ['ivory', 'Ivory']) },
          { kind: 'choice', key: 'numberDice', label: 'Rolling dice', help: 'How the dice you roll are made.', options: opts(['resin', 'Resin'], ['stone', 'Stone'], ['metal', 'Metal']) },
          { kind: 'choice', key: 'walls', label: 'Table edge', help: 'What the dice bounce off at the edge. Every choice stops them; Nothing just isn\'t drawn.', options: opts(['line', 'Hairline'], ['stone', 'Stone wall'], ['brass', 'Brass rail'], ['none', 'Nothing']) },
          { kind: 'toggle', key: 'tokenTray', label: 'Token tray', help: 'Tokens and token dice to drag onto the cards on the table.' },
        ],
      },
    ],
  },
];

/** Settings that shape the hand; a ready-made look changes only these, never your table. */
export const HAND_KEYS: (keyof DeckLook)[] = LOOK_PAGES.filter((p) => p.id === 'hand').flatMap((p) => p.groups.flatMap((g) => g.controls.map((c) => c.key)));

/** Looks the panel offers ready made. The first is the default. */
export const BUILTIN_LOOKS: { name: string; look: DeckLook }[] = [
  { name: 'Straight row', look: DEFAULT_LOOK },
  { name: 'Tight stack', look: { ...DEFAULT_LOOK, spacing: -0.82, pack: 0.2, shrink: 0.02, dim: 0.08, side: 10, stack: 'centre', shadow: 0.8, edgeWidth: 8 } },
  { name: 'Fanned hand', look: { ...DEFAULT_LOOK, spacing: -0.4, pack: 0.08, shrink: 0.03, arc: 56, tilt: 6, side: 5, rowY: 0.22, dim: 0.06, hoverLift: 30, hoverZoom: 1.08, edge: 'none', stack: 'left' } },
  { name: 'Record shelf', look: { ...DEFAULT_LOOK, spacing: -0.42, pack: 0.22, shrink: 0.03, turn: 58, perspective: 1200, side: 7, dim: 0.14, edge: 'darken', edgeWidth: 18 } },
  { name: 'Spotlight', look: { ...DEFAULT_LOOK, size: 300, side: 2, shrink: 0.2, dim: 0.35, blur: 2, glow: 0.6, edge: 'fade', edgeWidth: 26 } },
  { name: 'Whole deck', look: { ...DEFAULT_LOOK, size: 120, side: 30, spacing: 0.03, pack: 0, shrink: 0, dim: 0, edge: 'none' } },
  { name: 'Flat and fast', look: { ...DEFAULT_LOOK, shrink: 0, dim: 0, edge: 'none', shadow: 0, exit: 'cut' } },
];

/** A ready-made look laid over the current settings: the hand changes, the table and motion stay yours. */
export function withHand(current: DeckLook, look: DeckLook): DeckLook {
  const out = { ...current } as Record<string, unknown>;
  for (const k of HAND_KEYS) out[k] = look[k];
  return out as unknown as DeckLook;
}

/** Whether `current` already wears this look's hand. */
export const wearsHand = (current: DeckLook, look: DeckLook): boolean => HAND_KEYS.every((k) => current[k] === look[k]);

const ALL_CONTROLS = LOOK_PAGES.flatMap((p) => p.groups.flatMap((g) => g.controls));

/**
 * A look made safe to use: every field present, numbers inside the panel's limits, choices from the list.
 * Anything missing or wrong falls back to the default, so an old save or a hand-edited code still loads.
 */
export function cleanLook(raw: unknown): DeckLook {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: DeckLook = { ...DEFAULT_LOOK };
  for (const c of ALL_CONTROLS) {
    const v = src[c.key];
    if (c.kind === 'range') {
      if (typeof v === 'number' && Number.isFinite(v)) (out as unknown as Record<string, number>)[c.key] = Math.min(c.max, Math.max(c.min, v));
    } else if (c.kind === 'choice') {
      if (typeof v === 'string' && c.options.some((o) => o.value === v)) (out as unknown as Record<string, string>)[c.key] = v;
    } else if (typeof v === 'boolean') {
      (out as unknown as Record<string, boolean>)[c.key] = v;
    }
  }
  return out;
}

const CODE_PREFIX = 'RK1:';

/**
 * A look as a code someone can paste into their own table: only the settings that differ from the default,
 * as JSON, base64url. Short enough for a chat message.
 */
export function encodeLook(look: DeckLook): string {
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_LOOK) as (keyof DeckLook)[]) {
    if (look[k] !== DEFAULT_LOOK[k]) diff[k] = typeof look[k] === 'number' ? Math.round((look[k] as number) * 1000) / 1000 : look[k];
  }
  return CODE_PREFIX + toBase64Url(JSON.stringify(diff));
}

/** A pasted code back into a look, or null when it is not one. Tolerates spaces and line breaks around it. */
export function decodeLook(code: string): DeckLook | null {
  const s = code.trim().replace(/\s+/g, '');
  if (!s.startsWith(CODE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(s.slice(CODE_PREFIX.length)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return cleanLook({ ...DEFAULT_LOOK, ...parsed });
  } catch {
    return null;
  }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ---------------------------------------------------------------- layout maths (read by the carousel each frame)

/** Steps a card `k` places from the centre stands past the spotlight (0 inside it). */
export function pastSpot(k: number, l: DeckLook): number {
  return Math.max(0, k - (l.centre - 1) / 2);
}

/** A card's scale `k` places out, as a share of the centre card. */
export function lookScale(k: number, l: DeckLook): number {
  return Math.max(l.minScale, 1 - pastSpot(k, l) * l.shrink);
}

/**
 * How far from the centre a card `k` places out sits, for a centre card `w0` px wide. Each step is the two
 * neighbours' mean width plus the gap, squeezed by `pack` past the spotlight; fractions interpolate so the deck
 * moves smoothly between detents.
 */
export function lookX(k: number, l: DeckLook, w0: number): number {
  const whole = Math.floor(k);
  let x = 0;
  let next = 0;
  for (let i = 1; i <= whole + 1; i++) {
    const step = ((lookScale(i - 1, l) + lookScale(i, l)) / 2) * w0 * (1 + l.spacing) * Math.max(0.04, 1 - l.pack * pastSpot(i - 1, l));
    if (i <= whole) x += step;
    else next = step;
  }
  return x + next * (k - whole);
}

/** How many places out a card may be and still show (the last one fades by the exit style). */
export function visibleReach(l: DeckLook): number {
  return l.side + (l.centre - 1) / 2;
}

/**
 * The signed distance from the deck position `pos` to card `i`, wrapped to the shorter way round when the deck
 * loops.
 */
export function cardOffset(i: number, pos: number, count: number, loop: boolean): number {
  const d = i - pos;
  if (!loop || count < 2) return d;
  const m = ((d % count) + count) % count;
  return m > count / 2 ? m - count : m;
}
