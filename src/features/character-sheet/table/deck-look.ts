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
export type CentreClick = 'view' | 'equip' | 'nothing';

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
  /** A small gold dot just past the first and the last card, so the ends of the hand show (owner, v0.47.11). */
  endDots: boolean;
  /** Px a card rises under the pointer. */
  hoverLift: number;
  /** How much a card grows under the pointer. */
  hoverZoom: number;
  /** Every card drawn at full quality, always (owner, v0.47.17); heavy, so off unless asked for. */
  sharp: boolean;
  /**
   * A plain click on any card in the hand takes a copy of it out to lay on the table (owner, v0.47.8). Off by default
   * since v0.47.23 (owner: a click views the card), and renamed so every saved table takes the new default once.
   */
  clickTake: boolean;
  /**
   * The physical carousel (owner, v0.47.25): dice and tokens knock into the hand's cards, which flash red and are
   * pushed towards the nearer edge of the table (even off it), then creep back. Physical cards pass over it.
   */
  physCarousel: boolean;
  /** What a click on the centre card does, when clicking does not take cards out. */
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
  /** How the control dice move: rolling and tumbling like real dice, or hopping upright from place to place. */
  ctlMotion: 'roll' | 'hop';
  /** How big the control dice and the deck die are, against their usual size. */
  ctlSize: number;
  catSize: number;
  /** The token supply lying ready on the table (tokens and a token die to throw out copies of). */
  tokenTray: boolean;
  /** The supply and the control dice go back to their places a moment after they are knocked or thrown away (v0.47.12). */
  autoReturn: boolean;
  /** The supply's die is a chest (v0.47.12, owner): a click and it spits out one of every die, to keep one or more. */
  diceChest: boolean;
  /** How the table's chests look (the dice chest, the Void's mimic): toothy or cute. */
  chest: 'fang' | 'cute';
  /** The hand as a carousel, or every card of the deck laid out on the table at once (v0.47.3). */
  handMode: 'carousel' | 'spread';
  // Where the table's pieces live (v0.47.3, owner: drag them while settings are open). Shares of the table, the
  // centre of each row; a row runs across or down.
  /** The control dice (Cards, State, Sort deck). */
  ctlX: number;
  ctlY: number;
  ctlDir: 'row' | 'column';
  /** The token supply and the Deck of Many Things. */
  supX: number;
  supY: number;
  supDir: 'row' | 'column';
  /** The deck die. */
  catX: number;
  catY: number;
  /** The hand's centre, dragged there while settings are open (share of the table); below 0 it follows `areaPos`. */
  areaY: number;
  /**
   * Pieces split off their row and placed one by one (owner, v0.47.11), by key ('cards', 'state', 'sort', 'src:mat',
   * 'src:color', 'src:die', 'src:domat'), as shares of the table. A row with none here lies as a row.
   */
  apart: Record<string, [number, number]>;
  /** Pieces hidden from play (owner, v0.47.14), by the same keys and 'cat' for the deck die: seen only while editing. */
  hidden: string[];
  /** Pieces locked where they stand (owner, v0.47.17), by the same keys: never lifted, never moved. */
  locked: string[];
}

/** What can be split off a row: the control dice and the supply. */
export const DM_DICE = ['dm-screen', 'dm-fight', 'dm-party', 'dm-foes', 'dm-log', 'dm-cards', 'dm-tools'] as const;
export const APART_KEYS = ['cards', 'state', 'sort', 'src:mat', 'src:color', 'src:die', 'src:domat', ...DM_DICE] as const;

export const DEFAULT_LOOK: DeckLook = {
  size: 210, centre: 1, side: 4, spacing: 0.04, pack: 0.35, arc: 0, tilt: 0, lift: 0, rowY: 0.5,
  shrink: 0.085, minScale: 0.3, drop: 0, turn: 0, perspective: 1400, stack: 'centre',
  edge: 'fade', edgeWidth: 17, dim: 0.12, blur: 0, grey: 0, shadow: 0.5, glow: 0, exit: 'fade',
  scroll: 'drag', wheel: 1, swipe: 340, snap: 1, flick: 1, loop: false, endDots: true, autoReturn: true, diceChest: true, chest: 'cute', hoverLift: 10, hoverZoom: 1.04, sharp: false, clickTake: false, physCarousel: true, centreClick: 'view', switchFx: 'slide',
  areaMode: 'tray', areaPos: 'bottom', areaSize: 40, divider: 'line', walls: 'line', numberDice: 'resin', controlDice: 'obsidian', controls: 'dice', ctlMotion: 'roll', ctlSize: 1, catSize: 1, tokenTray: true,
  handMode: 'carousel', ctlX: 0.86, ctlY: 0.08, ctlDir: 'row', supX: 0.15, supY: 0.08, supDir: 'row', catX: 0.07, catY: 0.36, areaY: -1,
  apart: {},
  hidden: [],
  locked: [],
};

type NumKey = { [K in keyof DeckLook]: DeckLook[K] extends number ? K : never }[keyof DeckLook];
type ChoiceKey = { [K in keyof DeckLook]: DeckLook[K] extends string ? K : never }[keyof DeckLook];
type BoolKey = { [K in keyof DeckLook]: DeckLook[K] extends boolean ? K : never }[keyof DeckLook];

export type LookControl =
  | { kind: 'range'; key: NumKey; label: string; help: string; min: number; max: number; step: number; unit?: string; costly?: boolean }
  | { kind: 'choice'; key: ChoiceKey; label: string; help: string; options: { value: string; label: string }[] }
  | { kind: 'toggle'; key: BoolKey; label: string; help: string };

/**
 * A labelled group of controls. `more` groups start folded, so a page opens on the few that matter most; a
 * `hidden` group is never drawn (set by dragging on the table instead) but still checked like the rest.
 */
export interface LookGroup { title: string; more?: boolean; hidden?: boolean; controls: LookControl[] }
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
          { kind: 'toggle', key: 'endDots', label: 'Mark the ends', help: 'A small gold dot just past the first and the last card, so you can tell where the hand ends. On an endless deck it marks where the last card meets the first.' },
        ],
      },
      {
        title: 'Cards',
        controls: [
          { kind: 'choice', key: 'switchFx', label: 'Changing deck', help: 'How a deck\'s cards arrive when you switch to it.', options: opts(['slide', 'Slide'], ['deal', 'Deal'], ['fade', 'Fade'], ['none', 'Instant']) },
          { kind: 'toggle', key: 'physCarousel', label: 'Physical carousel', help: 'Dice and tokens knock into the cards in your hand: each hit flashes red and pushes the hand towards the nearer edge of the table, off it if hit enough, and it creeps back. Physical cards pass over it.' },
          { kind: 'toggle', key: 'clickTake', label: 'Click a card to take it', help: 'On: click any card in the hand to pull a copy out and lay it on the table. Off: a click does what Click a card says, and right click, Lay a copy on the table, takes one out.' },
          { kind: 'choice', key: 'centreClick', label: 'Click a card', help: 'When clicking does not take cards out. View opens any card you click; Equip and Nothing act on the middle card, and any other card slides to the middle first.', options: opts(['view', 'View it'], ['equip', 'Equip'], ['nothing', 'Nothing']) },
          { kind: 'range', key: 'hoverLift', label: 'Hover lift', help: 'How far a card rises under the pointer.', min: 0, max: 60, step: 1, unit: 'px' },
          { kind: 'range', key: 'hoverZoom', label: 'Hover zoom', help: 'How much a card grows under the pointer.', min: 1, max: 2.5, step: 0.01 },
          { kind: 'toggle', key: 'sharp', label: 'Sharp cards', help: 'Every card at full quality all the time, so it reads well at any size. Heavy on slower computers: the hand can stutter.' },
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
          { kind: 'choice', key: 'handMode', label: 'Hand', help: 'A carousel you scroll through, or every card of the deck laid out on the table to move about freely.', options: opts(['carousel', 'Carousel'], ['spread', 'Laid out']) },
          { kind: 'choice', key: 'areaMode', label: 'Hand area', help: 'Its own area that dice stay out of, or the open table, shared with dice and cards.', options: opts(['tray', 'Own area'], ['free', 'Open table']) },
          { kind: 'choice', key: 'areaPos', label: 'Position', help: 'Where on the table the hand sits.', options: opts(['bottom', 'Bottom'], ['middle', 'Middle'], ['top', 'Top']) },
          { kind: 'range', key: 'areaSize', label: 'Area size', help: 'How much of the table the hand takes.', min: 18, max: 80, step: 1, unit: '%' },
          { kind: 'choice', key: 'divider', label: 'Edge of the area', help: 'How the hand\'s area is marked off from the rest of the table.', options: opts(['line', 'Hairline'], ['shade', 'Soft shade'], ['none', 'Nothing']) },
        ],
      },
      {
        title: 'Dice',
        controls: [
          { kind: 'choice', key: 'controls', label: 'Controls', help: 'The deck die and the control dice, as dice to throw, as plain buttons, or hidden. Right click the table for them any time.', options: opts(['dice', 'Dice'], ['buttons', 'Buttons'], ['hidden', 'Hidden']) },
          { kind: 'choice', key: 'ctlMotion', label: 'Control dice move', help: 'Roll and tumble like real dice, or hop upright from place to place: thrown or knocked they jump, always showing their icon, and the deck die only turns when you change deck.', options: opts(['roll', 'Roll'], ['hop', 'Hop']) },
          { kind: 'range', key: 'ctlSize', label: 'Control dice size', help: 'How big the control dice are.', min: 0.6, max: 1.8, step: 0.05, unit: 'x' },
          { kind: 'range', key: 'catSize', label: 'Deck die size', help: 'How big the die that picks your deck is.', min: 0.6, max: 1.8, step: 0.05, unit: 'x' },
          { kind: 'choice', key: 'controlDice', label: 'Control dice', help: 'How the control dice are made.', options: opts(['obsidian', 'Obsidian'], ['gilded', 'Gilded'], ['ivory', 'Ivory']) },
          { kind: 'choice', key: 'numberDice', label: 'Rolling dice', help: 'How the dice you roll are made.', options: opts(['resin', 'Resin'], ['stone', 'Stone'], ['metal', 'Metal']) },
          { kind: 'choice', key: 'walls', label: 'Table edge', help: 'What the dice bounce off at the edge. Every choice stops them; Nothing just isn\'t drawn.', options: opts(['line', 'Hairline'], ['stone', 'Stone wall'], ['brass', 'Brass rail'], ['none', 'Nothing']) },
          { kind: 'toggle', key: 'autoReturn', label: 'Pieces go back', help: 'The supply and the control dice find their way back to their places a moment after they are rolled, thrown or knocked away.' },
          { kind: 'toggle', key: 'diceChest', label: 'Dice chest', help: 'The supply keeps its dice in a chest. Click it and it spits out one of every die; click the one you want (or select several and grab them) and the rest fade away.' },
          { kind: 'choice', key: 'chest', label: 'Chests', help: 'How the dice chest and the mimic look.', options: opts(['cute', 'Cute'], ['fang', 'Toothy']) },
          { kind: 'toggle', key: 'tokenTray', label: 'Token supply', help: 'A token, a colour token, a die and the Deck of Many Things lying ready on the table. Click one to throw out a copy, scroll over it to change it.' },
        ],
      },
      {
        title: 'Where the pieces live',
        hidden: true,
        controls: [
          { kind: 'range', key: 'ctlX', label: 'Control dice across', help: '', min: 0, max: 1, step: 0.001 },
          { kind: 'range', key: 'ctlY', label: 'Control dice down', help: '', min: 0, max: 1, step: 0.001 },
          { kind: 'choice', key: 'ctlDir', label: 'Control dice run', help: '', options: opts(['row', 'Across'], ['column', 'Down']) },
          { kind: 'range', key: 'supX', label: 'Supply across', help: '', min: 0, max: 1, step: 0.001 },
          { kind: 'range', key: 'supY', label: 'Supply down', help: '', min: 0, max: 1, step: 0.001 },
          { kind: 'choice', key: 'supDir', label: 'Supply run', help: '', options: opts(['row', 'Across'], ['column', 'Down']) },
          { kind: 'range', key: 'catX', label: 'Deck die across', help: '', min: 0, max: 1, step: 0.001 },
          { kind: 'range', key: 'catY', label: 'Deck die down', help: '', min: 0, max: 1, step: 0.001 },
          { kind: 'range', key: 'areaY', label: 'Hand down', help: '', min: -1, max: 1, step: 0.001 },
        ],
      },
    ],
  },
];

/** The settings that say where the pieces live: a table preset sets them, Reset layout puts them back. */
export const PLACE_KEYS = ['ctlX', 'ctlY', 'ctlDir', 'supX', 'supY', 'supDir', 'catX', 'catY', 'areaY', 'apart', 'hidden', 'locked'] as const;

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
 * A random table that still makes sense (v0.47.3): every choice drawn from its list and every number from a range
 * that reads well, the rows kept out of the hand and away from each other. `tableScore` says how good it came out;
 * `randomTables` keeps drawing until it has `n` good, different ones.
 */
export function randomTable(rand: () => number): DeckLook {
  const pick = <V,>(xs: readonly V[]): V => xs[Math.floor(rand() * xs.length)];
  const span = (a: number, b: number, step = 0.01) => Math.round((a + rand() * (b - a)) / step) * step;
  const areaPos = pick(['bottom', 'middle', 'top'] as const);
  const areaSize = Math.round(span(24, 48, 1));
  const spread = rand() < 0.18;
  const shape = pick(['row', 'stack', 'fan', 'shelf', 'spot'] as const);
  const hand: Partial<DeckLook> =
    shape === 'stack' ? { spacing: span(-0.88, -0.7), pack: span(0.1, 0.3), side: Math.round(span(6, 14, 1)), shrink: span(0, 0.04) }
    : shape === 'fan' ? { spacing: span(-0.5, -0.3), arc: Math.round(span(30, 90, 2)), tilt: span(3, 9, 0.5), side: Math.round(span(3, 6, 1)), rowY: span(0.2, 0.4), stack: pick(['left', 'right'] as const) }
    : shape === 'shelf' ? { spacing: span(-0.5, -0.3), turn: Math.round(span(35, 65, 1)), perspective: Math.round(span(900, 1600, 10)), side: Math.round(span(5, 9, 1)), shrink: span(0.02, 0.05) }
    : shape === 'spot' ? { side: Math.round(span(1, 3, 1)), shrink: span(0.14, 0.24), glow: span(0.3, 0.7), dim: span(0.2, 0.4) }
    : { spacing: span(0, 0.12), side: Math.round(span(3, 8, 1)), shrink: span(0, 0.09) };
  // Rows go in the open band (outside the hand), each in its own corner.
  const handTop = areaPos === 'top' ? 0 : areaPos === 'middle' ? 0.5 - areaSize / 200 : 1 - areaSize / 100;
  const handBottom = handTop + areaSize / 100;
  const bands = areaPos === 'top' ? [[handBottom + 0.06, 0.94]] : areaPos === 'bottom' ? [[0.06, handTop - 0.06]] : [[0.06, handTop - 0.05], [handBottom + 0.05, 0.94]];
  const yIn = (band: number[]) => span(band[0], Math.max(band[0], band[1]), 0.001);
  const corners = [0, 1, 2, 3].sort(() => rand() - 0.5);
  if (spread) bands.splice(0, bands.length, [0.07, 0.1], [0.9, 0.93]);
  const spot = (i: number) => {
    const band = bands[Math.min(bands.length - 1, corners[i] >> 1)] ?? [0.06, 0.94];
    return { x: corners[i] % 2 ? span(0.72, 0.92, 0.001) : span(0.08, 0.28, 0.001), y: yIn(band) };
  };
  const c = spot(0), u = spot(1), k = spot(2);
  return cleanLook({
    ...DEFAULT_LOOK,
    ...hand,
    size: Math.round(span(140, 260, 2)),
    edge: pick(['fade', 'darken', 'blur', 'none'] as const),
    dim: hand.dim ?? span(0, 0.2),
    glow: hand.glow ?? (rand() < 0.3 ? span(0.2, 0.6) : 0),
    hoverLift: Math.round(span(4, 30, 1)),
    hoverZoom: span(1.02, 1.12),
    switchFx: pick(['slide', 'deal', 'fade'] as const),
    handMode: spread ? 'spread' : 'carousel',
    areaMode: pick(['tray', 'free'] as const),
    areaPos,
    areaSize,
    divider: pick(['line', 'shade', 'none'] as const),
    walls: pick(['line', 'stone', 'brass', 'none'] as const),
    numberDice: pick(['resin', 'stone', 'metal'] as const),
    controlDice: pick(['obsidian', 'gilded', 'ivory'] as const),
    controls: rand() < 0.75 ? 'dice' : 'buttons',
    tokenTray: rand() < 0.85,
    ctlX: c.x, ctlY: c.y, ctlDir: rand() < 0.7 ? 'row' : 'column',
    supX: u.x, supY: u.y, supDir: rand() < 0.65 ? 'row' : 'column',
    catX: k.x, catY: k.y,
  });
}

/** How much room each row of pieces takes, labels included, as shares of a 1180 x 900 table (measured on screen). */
const REF_W = 1180, REF_H = 900;
function rowBox(x: number, y: number, kind: 'ctl' | 'sup' | 'cat' | 'buttons', dir: 'row' | 'column') {
  const [w, h] = kind === 'cat' ? [130, 150]
    : kind === 'buttons' ? (dir === 'row' ? [470, 44] : [160, 190])
    : kind === 'ctl' ? (dir === 'row' ? [2 * 94 + 100, 104] : [100, 2 * 94 + 104])
    : dir === 'row' ? [3 * 70 + 120, 124] : [124, 3 * 70 + 124];
  return { l: x - w / 2 / REF_W, r: x + w / 2 / REF_W, t: y - h / 2 / REF_H, b: y + h / 2 / REF_H };
}

/**
 * 0 (unusable) to 1 (clean): every row on the table, out of the hand (and, laid out, clear of the cards), clear of
 * each other with room to breathe, and a centre card that fits its area.
 */
export function tableScore(l: DeckLook): number {
  let score = 1;
  const handTop = l.areaPos === 'top' ? 0 : l.areaPos === 'middle' ? 0.5 - l.areaSize / 200 : 1 - l.areaSize / 100;
  const handBottom = handTop + l.areaSize / 100;
  const boxes = [];
  if (l.controls !== 'hidden') {
    boxes.push(rowBox(l.ctlX, l.ctlY, l.controls === 'buttons' ? 'buttons' : 'ctl', l.ctlDir));
    if (l.controls === 'dice') boxes.push(rowBox(l.catX, l.catY, 'cat', 'row'));
  }
  if (l.tokenTray) boxes.push(rowBox(l.supX, l.supY, 'sup', l.supDir));
  for (const b of boxes) {
    if (b.l < 0.01 || b.r > 0.99 || b.t < 0.01 || b.b > 0.99) score -= 0.3;
    if (l.handMode === 'carousel' && b.b > handTop && b.t < handBottom) score -= 0.35;
    // Laid out, the cards fill the middle of the table: the rows keep to its edges.
    if (l.handMode === 'spread' && !(b.b < 0.15 || b.t > 0.84 || b.r < 0.13 || b.l > 0.87)) score -= 0.35;
  }
  const gx = 24 / REF_W, gy = 24 / REF_H;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.l - gx < b.r && b.l - gx < a.r && a.t - gy < b.b && b.t - gy < a.b) score -= 0.4;
  }
  // The centre card should fit its area's height (as on a 900 px table).
  const cardH = l.size * 1.4;
  if (l.handMode === 'carousel' && cardH > (l.areaSize / 100) * REF_H * 0.95) score -= 0.3;
  return Math.max(0, score);
}

/** `n` random tables that score well and differ from each other, from a seed (the same seed gives the same ones). */
export function randomTables(n: number, seed: number): DeckLook[] {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: DeckLook[] = [];
  for (let tries = 0; out.length < n && tries < 4000; tries++) {
    const l = randomTable(rand);
    if (tableScore(l) < 0.99) continue;
    if (out.some((o) => o.areaPos === l.areaPos && o.handMode === l.handMode && o.walls === l.walls)) continue;
    out.push(l);
  }
  return out;
}

/**
 * A look made safe to use: every field present, numbers inside the panel's limits, choices from the list.
 * Anything missing or wrong falls back to the default, so an old save or a hand-edited code still loads.
 */
/**
 * Saved tables outlive the app's updates (owner, v0.47.11: a redeploy must never break a saved layout). Anything a
 * later version renamed or folded into another setting is carried over here before the look is checked; whatever is
 * still unknown falls back to its default one setting at a time, never the whole table.
 */
function migrateLook(src: Record<string, unknown>): Record<string, unknown> {
  // v0.47.8: 'Take a copy' on the centre card became the Click a card to take it switch.
  if (src.centreClick === 'take') { src.clickTake = true; src.centreClick = 'view'; }
  // v0.47.23 (owner): a click views a card by default. A table saved before it (no clickTake yet, the old clickPull
  // was on by default) takes the new default once, and a centre click left at Nothing becomes View.
  if (!('clickTake' in src) && (src.centreClick === undefined || src.centreClick === 'nothing')) src.centreClick = 'view';
  return src;
}

export function cleanLook(raw: unknown): DeckLook {
  const src = migrateLook(raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {});
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
  // Pieces placed on their own: only known pieces, at places on the table.
  const apart: Record<string, [number, number]> = {};
  const a = src.apart;
  if (a && typeof a === 'object') {
    for (const k of APART_KEYS) {
      const v = (a as Record<string, unknown>)[k];
      if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) apart[k] = [Math.min(1, Math.max(0, v[0])), Math.min(1, Math.max(0, v[1]))];
    }
  }
  out.apart = apart;
  const hid = Array.isArray(src.hidden) ? src.hidden : [];
  out.hidden = [...APART_KEYS, 'cat'].filter((k) => hid.includes(k));
  const lk = Array.isArray(src.locked) ? src.locked : [];
  out.locked = [...APART_KEYS, 'cat'].filter((k) => lk.includes(k));
  return out;
}

/**
 * Whole tables, ready made (v0.47.3, owner): each one a way somebody likes to play, built as a layout first. They
 * set everything (hand, motion, table and where the pieces live); a hand look above changes only the hand.
 */
export interface TablePreset { id: string; name: string; who: string; look: DeckLook }
const T = (look: Partial<DeckLook>): DeckLook => cleanLook({ ...DEFAULT_LOOK, ...look });
/*
 * Laid out by hand (owner, v0.47.15: "pretty ugly"): every row of pieces sits on a band along the top or the bottom
 * edge, lined up left, centre and right, the hand is whole on screen, and the middle of the felt stays open.
 */
export const TABLE_PRESETS: TablePreset[] = [
  {
    id: 'story', name: 'Storyteller', who: 'One card at a time, centre stage, and nothing in the way. Controls stay a right click off, the felt is open for the scene.',
    look: T({ size: 290, side: 2, shrink: 0.22, dim: 0.34, blur: 1.6, glow: 0.5, edge: 'fade', edgeWidth: 30, rowY: 0.5, hoverLift: 4, hoverZoom: 1.02, switchFx: 'fade', endDots: false,
      areaMode: 'free', areaPos: 'middle', areaSize: 64, divider: 'none', walls: 'none', controls: 'hidden', tokenTray: false, numberDice: 'stone', controlDice: 'ivory' }),
  },
  {
    id: 'goblin', name: 'Dice goblin', who: 'Rolls all the time and plays with the dice between turns. Everything in one row along the top, a mimic for a dice box, the whole felt to throw on.',
    look: T({ autoReturn: false, diceChest: true, chest: 'fang', size: 170, spacing: -0.55, pack: 0.12, shrink: 0.03, arc: 30, tilt: 4, side: 6, dim: 0.06, shadow: 0.8, edge: 'none', rowY: 0.55, hoverLift: 26, hoverZoom: 1.08,
      areaMode: 'tray', areaPos: 'bottom', areaSize: 30, divider: 'shade', walls: 'brass', numberDice: 'metal', controlDice: 'gilded', controls: 'dice', ctlMotion: 'hop', tokenTray: true,
      supDir: 'row', supX: 0.2, supY: 0.1, catX: 0.5, catY: 0.1, ctlDir: 'row', ctlX: 0.82, ctlY: 0.09 }),
  },
  {
    id: 'tactician', name: 'Tactician', who: 'Wants every card in view at once. No carousel: the whole deck lies on the table, every piece in one band along the bottom.',
    look: T({ handMode: 'spread', size: 150, walls: 'stone', numberDice: 'stone', controlDice: 'obsidian', controls: 'dice', ctlMotion: 'hop', tokenTray: true,
      supDir: 'row', supX: 0.25, supY: 0.92, ctlDir: 'row', ctlX: 0.72, ctlY: 0.92, catX: 0.93, catY: 0.86 }),
  },
  {
    id: 'archivist', name: 'Archivist', who: 'Curates big decks. The whole deck reads across the top, plain buttons and the supply along the bottom, the table between them clear for sorting.',
    look: T({ size: 124, side: 30, spacing: 0.05, pack: 0, shrink: 0, dim: 0, edge: 'fade', edgeWidth: 10, shadow: 0.35, scroll: 'wheel', wheel: 3, switchFx: 'deal', hoverLift: 18, hoverZoom: 1.22, rowY: 0.52,
      areaMode: 'tray', areaPos: 'top', areaSize: 30, divider: 'line', walls: 'line', controls: 'buttons', numberDice: 'resin', controlDice: 'obsidian', tokenTray: true,
      supDir: 'row', supX: 0.25, supY: 0.91, ctlDir: 'row', ctlX: 0.76, ctlY: 0.93 }),
  },
  {
    id: 'showman', name: 'Showman', who: 'Plays for the table (or the stream). A fanned hand in the middle of the felt, gold dice, deals that land with a flourish.',
    look: T({ size: 230, spacing: -0.4, pack: 0.08, shrink: 0.03, arc: 70, tilt: 7, side: 4, rowY: 0.3, dim: 0.06, glow: 0.6, hoverLift: 34, hoverZoom: 1.1, edge: 'none', stack: 'left', switchFx: 'deal',
      areaMode: 'free', areaPos: 'middle', areaSize: 52, divider: 'none', walls: 'brass', numberDice: 'resin', controlDice: 'gilded', controls: 'dice', ctlMotion: 'hop', tokenTray: true,
      supDir: 'row', supX: 0.17, supY: 0.08, ctlDir: 'row', ctlX: 0.83, ctlY: 0.08, catX: 0.5, catY: 0.9 }),
  },
  {
    id: 'duelist', name: 'Duelist', who: 'In the thick of a fight: cards on a shelf across the middle, the deck die above it, dice and tokens in reach below it.',
    look: T({ size: 200, spacing: -0.42, pack: 0.22, shrink: 0.03, turn: 58, perspective: 1200, side: 7, dim: 0.14, edge: 'darken', edgeWidth: 18, flick: 1.6, switchFx: 'slide',
      areaMode: 'tray', areaPos: 'middle', areaSize: 36, divider: 'line', walls: 'stone', numberDice: 'resin', controlDice: 'obsidian', controls: 'dice', tokenTray: true,
      supDir: 'row', supX: 0.25, supY: 0.88, ctlDir: 'row', ctlX: 0.82, ctlY: 0.88, catX: 0.5, catY: 0.13 }),
  },
];

/**
 * The four tables drawn at random and kept (v0.47.11). Their hands, colours and motion are the draw's own; where the
 * pieces lie was set by hand (v0.47.15), on the same bands as the made tables.
 */
const WILD_LAYOUT: Partial<DeckLook>[] = [
  { supDir: 'row', supX: 0.2, supY: 0.1, catX: 0.5, catY: 0.11, ctlDir: 'row', ctlX: 0.82, ctlY: 0.09 },
  { tokenTray: true, supDir: 'row', supX: 0.25, supY: 0.88, catX: 0.5, catY: 0.87, ctlDir: 'row', ctlX: 0.82, ctlY: 0.88 },
  { ctlDir: 'row', ctlX: 0.5, ctlY: 0.92 },
  { supDir: 'row', supX: 0.2, supY: 0.1, ctlDir: 'row', ctlX: 0.5, ctlY: 0.1, catX: 0.5, catY: 0.88 },
];
export const WILD_TABLES = randomTables(4, 47003).map((look, i) => cleanLook({ ...look, ...WILD_LAYOUT[i] }));

/**
 * The table a character sits down at the first time on this computer (owner, v0.47.17: "Spin Default", from their own
 * .rune file, with the dice chest the owner made the default since): a fanned hand looping in the middle of the felt,
 * gold dice that hop, the supply top left and the controls top right. Codes and files still count from DEFAULT_LOOK.
 */
export const STARTING_LOOK: DeckLook = cleanLook({
  ...DEFAULT_LOOK,
  size: 216, centre: 4, side: 9, spacing: -0.4, pack: 0.16, arc: 50, rowY: 0.57, shrink: 0.055, edge: 'none', dim: 0.06,
  loop: true, diceChest: true, hoverLift: 34, hoverZoom: 1.1, switchFx: 'deal',
  areaMode: 'free', areaPos: 'middle', areaSize: 52, divider: 'none', walls: 'brass', controlDice: 'gilded', ctlMotion: 'hop',
  ctlX: 0.897, ctlY: 0.073, ctlDir: 'row', supX: 0.13, supY: 0.081, supDir: 'row', catX: 0.935, catY: 0.568, areaY: 0.75,
});

/**
 * The DM screen's first table (v0.49.0): the starting table with room for its seven control dice, a row of their own
 * under the supply.
 */
export const DM_STARTING_LOOK: DeckLook = cleanLook({ ...STARTING_LOOK, supX: 0.2, supY: 0.085, ctlX: 0.5, ctlY: 0.22, catX: 0.93, catY: 0.42 });

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
  // Forgiving (owner, v0.47.9: codes "didn't work"): the code is found wherever it sits in what was pasted, whatever
  // case its prefix came out in, and quotes, spaces, line breaks or a full stop picked up on the way are ignored.
  const m = /rk1:\s*([A-Za-z0-9_\-\s]+)/i.exec(code);
  if (!m) return null;
  const body = m[1].replace(/[^A-Za-z0-9_-]/g, '');
  if (!body) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(body));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return cleanLook({ ...DEFAULT_LOOK, ...parsed });
  } catch {
    return null;
  }
}

/**
 * A table as a file to hand someone (v0.47.9, owner: "a .rune file built for sharing the template of the table"):
 * the WHOLE look, not only what differs from today's defaults, so a later release changing a default cannot change a
 * table someone saved. Marked as a table, so it is never mistaken for a character's .rune file.
 */
export const TABLE_FILE_KIND = 'runekeep-table';
export function tableFile(look: DeckLook, name: string): string {
  return JSON.stringify({ kind: TABLE_FILE_KIND, version: 1, name: name.slice(0, 40), look }, null, 2);
}

/** A table file (or a pasted code, or a file holding one) back into a name and a look; null when it is not one. */
export function readTableFile(text: string): { name: string; look: DeckLook } | null {
  try {
    const f = JSON.parse(text) as { kind?: unknown; name?: unknown; look?: unknown };
    if (f && typeof f === 'object' && f.kind === TABLE_FILE_KIND && f.look && typeof f.look === 'object') {
      return { name: typeof f.name === 'string' ? f.name.slice(0, 40) : '', look: cleanLook(f.look) };
    }
  } catch { /* not JSON: it may hold a code */ }
  const look = decodeLook(text);
  return look ? { name: '', look } : null;
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

/**
 * The centre card's width for a hand area `areaH` px tall: the look's size, or less when the card would not fit its
 * area (owner, v0.47.7). The hover zoom no longer counts (v0.47.17: a bigger zoom shrank every card, so the zoom seemed
 * to make cards smaller): a card under the pointer may grow out over the top of its area.
 */
export function fitSize(l: DeckLook, areaH: number): number {
  if (areaH <= 0) return l.size;
  const room = areaH - 28 - Math.max(0, l.lift);
  return Math.max(60, Math.min(l.size, room * (750 / 1050)));
}

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
