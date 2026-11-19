/**
 * The dice on the desktop table (v0.47.0): every control that is not part of the character sheet itself is a die
 * you can pick up and throw, and a click on it opens what the button used to.
 *
 * - The category die carries every deck's icon on its faces and grows with the number of decks (d4, d6, d8, d12,
 *   d20). A click fans the decks out beside it; picking one turns the die to that face and switches the hand.
 * - Roll, Rest, Level up, State, Cards, Sort and Characters are gilded d6s with their glyph on every face.
 * - Rolls are real dice thrown across the felt; the face that comes to rest on top is the result.
 *
 * Dice keep their own hit test (the engine's), checked before anything else on the felt, so a die is never
 * confused with a card under it; anywhere else, the pointer goes on to the cards. Where the button dice were left
 * is remembered in this browser; the reset button sends them home.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { Display } from '@/constants/theme';
import { DIE_COLOR, DIE_INK, type DieType, FEAR_INK, FEAR_PURPLE, HOPE_GOLD, HOPE_INK } from '../components/card-tokens-data';
import type { PoolDie } from '@/lib/dice-pool';
import { playSfx, playSynth } from '@/lib/sfx';
import type { CardCategory } from '../card-data';
import { CategoryGlyph } from '../sheet/deck-toggle-icon';
import { type DiceEngine, type DieSpec, type Shape } from './dice-engine';
import type { Impact, Obstacle } from './dice-physics';
import { loadDicePlaces, saveDicePlaces } from './table-store';
import { glyphImage, type GlyphKey, T, TButton } from './table-ui';

export type ActionKey = 'roll' | 'rest' | 'level' | 'state' | 'cards' | 'sort' | 'exit';
export interface TableAction { key: ActionKey; label: string; onPress: () => void; disabled?: boolean }
export interface TableDeck { key: CardCategory; label: string; count: number; meta?: { icon?: string; builtin: boolean } }

export interface TableDiceHandle {
  /** Throw these dice from (x, y) on the felt; resolves with the faces that came to rest on top. */
  roll: (dice: PoolDie[], from: { x: number; y: number }) => Promise<PoolDie[]>;
  clearRoll: () => void;
  resetHome: () => void;
}

const CAT = 'cat';
const ACTION_SIZE = 60;
const LEFT_GROUP: ActionKey[] = ['roll', 'rest', 'level', 'state'];
const RIGHT_GROUP: ActionKey[] = ['cards', 'sort', 'exit'];
const GLYPH: Record<ActionKey, GlyphKey> = { roll: 'roll', rest: 'rest', level: 'level', state: 'state', cards: 'cards', sort: 'sort', exit: 'exit' };
const ROLL_SIZE: Record<string, number> = { d4: 66, d6: 58, d8: 62, d10: 62, d12: 66, d20: 74, d100: 60, duality: 70 };

/** The category die's solid for a number of decks. */
export function catShape(n: number): Shape {
  return n <= 4 ? 'd4' : n <= 6 ? 'd6' : n <= 8 ? 'd8' : n <= 12 ? 'd12' : 'd20';
}
const FACES_OF: Record<Shape, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

function homes(W: number, H: number): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = { [CAT]: { x: 74, y: H - 88 } };
  const pitch = 98;
  LEFT_GROUP.forEach((k, i) => { out[k] = { x: 56 + i * pitch, y: 58 }; });
  RIGHT_GROUP.forEach((k, i) => { out[k] = { x: W - 56 - (RIGHT_GROUP.length - 1 - i) * pitch, y: 58 }; });
  return out;
}

export const TableDice = forwardRef<TableDiceHandle, {
  felt: HTMLElement | null;
  width: number;
  height: number;
  decks: TableDeck[];
  current: CardCategory;
  onPickDeck: (c: CardCategory) => void;
  actions: TableAction[];
  /** A panel is open: the dice stay where they are and take no clicks. */
  inert: boolean;
  /** Panels on the felt the dice bounce off. */
  obstacles: Obstacle[];
}>(function TableDice({ felt, width, height, decks, current, onPickDeck, actions, inert, obstacles }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<DiceEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const labels = useRef(new Map<string, HTMLElement>());
  const glyphHost = useRef<HTMLDivElement>(null);
  const [deckArt, setDeckArt] = useState<Map<string, HTMLImageElement> | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const pending = useRef<{ keys: Set<string>; done: () => void } | null>(null);
  /** The dice the last roll threw, so the next one (or Clear) can take them off the table. */
  const rolled = useRef(new Set<string>());
  const clearRoll = (e: DiceEngine) => {
    for (const k of rolled.current) e.remove(k);
    rolled.current.clear();
  };
  const size = useRef({ width, height });
  size.current = { width, height };

  // ---------------------------------------------------------------- the engine (loaded on first use)
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let dead = false;
    let eng: DiceEngine | null = null;
    import('./dice-engine')
      .then(async (m) => {
        try { await document.fonts.load(`40px ${Display.black}`); } catch { /* numbers fall back to the system face */ }
        return m.createDiceEngine(el, { modelUrl: '/models/dice.glb', font: Display.black });
      })
      .then((e) => {
        if (dead) { e.dispose(); return; }
        eng = e;
        e.onImpact((hit: Impact) => knockOf(hit));
        setEngine(e);
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; eng?.dispose(); };
  }, []);

  useEffect(() => {
    if (!engine) return;
    engine.resize(width, height);
    engine.setBounds({ left: 6, top: 6, right: width - 6, bottom: height - 6 });
  }, [engine, width, height]);
  const obstacleKey = JSON.stringify(obstacles);
  useEffect(() => { engine?.setObstacles(obstacles); }, [engine, obstacleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where button dice come to rest is remembered; rolls resolve when their dice are all down.
  useEffect(() => {
    if (!engine) return;
    engine.onRest((keys) => {
      const p = pending.current;
      if (p) {
        for (const k of keys) p.keys.delete(k);
        if (p.keys.size === 0) { pending.current = null; p.done(); }
      }
      const places = loadDicePlaces();
      let changed = false;
      for (const k of keys) {
        if (k.startsWith('roll:')) continue;
        const s = engine.state(k);
        if (!s) continue;
        places[k] = { fx: s.x / size.current.width, fy: s.y / size.current.height };
        changed = true;
      }
      if (changed) saveDicePlaces(places);
    });
  }, [engine]);

  // ---------------------------------------------------------------- the deck icons, as pictures for the die
  // The decks' glyphs are the sheet's own SVG components: rendered once, hidden, then read back as images.
  const deckKey = decks.map((d) => `${d.key}:${d.meta?.icon ?? ''}`).join('|');
  useEffect(() => {
    const host = glyphHost.current;
    if (!host) return;
    let dead = false;
    const id = requestAnimationFrame(() => {
      const jobs = [...host.querySelectorAll<HTMLElement>('[data-deck]')].map(async (node) => {
        const svg = node.querySelector('svg');
        if (!svg) return null;
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', '160');
        clone.setAttribute('height', '160');
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
        await img.decode().catch(() => {});
        return [node.dataset.deck!, img] as const;
      });
      void Promise.all(jobs).then((pairs) => { if (!dead) setDeckArt(new Map(pairs.filter(Boolean) as [string, HTMLImageElement][])); });
    });
    return () => { dead = true; cancelAnimationFrame(id); };
  }, [deckKey]);

  // ---------------------------------------------------------------- putting the dice on the table
  const [glyphs, setGlyphs] = useState<Map<GlyphKey, HTMLImageElement> | null>(null);
  useEffect(() => {
    let dead = false;
    void Promise.all(LEFT_GROUP.concat(RIGHT_GROUP).map(async (k) => [GLYPH[k], await glyphImage(GLYPH[k], T.goldBright)] as const)).then((pairs) => { if (!dead) setGlyphs(new Map(pairs)); });
    return () => { dead = true; };
  }, []);

  const placeOf = useCallback((key: string) => {
    const p = loadDicePlaces()[key];
    const { width: W, height: H } = size.current;
    if (p && Number.isFinite(p.fx) && Number.isFinite(p.fy)) return { x: Math.min(W - 30, Math.max(30, p.fx * W)), y: Math.min(H - 30, Math.max(30, p.fy * H)) };
    return homes(W, H)[key] ?? { x: W / 2, y: H / 2 };
  }, []);

  useEffect(() => {
    if (!engine || !glyphs || width < 50) return;
    for (const a of actions) {
      const img = glyphs.get(GLYPH[a.key]);
      if (!img) continue;
      const spec: DieSpec = { key: a.key, shape: 'd6', size: ACTION_SIZE, body: '#151a23', edge: '#C8923A', ink: T.goldBright, faces: [{ image: img }], gilded: true, upright: true };
      const at = placeOf(a.key);
      engine.add(spec, at.x, at.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, glyphs, actions.map((a) => a.key).join(), width > 50]);

  const deckFace = useMemo(() => {
    const n = FACES_OF[catShape(decks.length)];
    const faces = Array.from({ length: n }, (_, i) => decks[i % Math.max(1, decks.length)]);
    return { n, faces, indexOf: (c: CardCategory) => Math.max(0, faces.findIndex((d) => d?.key === c)) };
  }, [decks]);

  useEffect(() => {
    if (!engine || !deckArt || !decks.length || width < 50) return;
    const shape = catShape(decks.length);
    const spec: DieSpec = {
      key: CAT, shape, size: shape === 'd20' ? 116 : shape === 'd4' ? 112 : shape === 'd12' ? 104 : 96, body: '#151a23', edge: '#C8923A', ink: T.goldBright, gilded: true, upright: true,
      faces: deckFace.faces.map((d) => (d && deckArt.get(d.key) ? { image: deckArt.get(d.key)! } : { text: '' })),
    };
    const fresh = !engine.has(CAT);
    const at = placeOf(CAT);
    engine.add(spec, at.x, at.y);
    if (fresh) engine.home(CAT, at.x, at.y, deckFace.indexOf(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, deckArt, deckFace, width > 50]);

  // The deck changed (a pick, a key, a menu): the die turns to show it.
  const shown = useRef(current);
  useEffect(() => {
    if (!engine?.has(CAT) || shown.current === current) return;
    shown.current = current;
    engine.turnTo(CAT, deckFace.indexOf(current));
  }, [engine, current, deckFace]);

  // Labels ride under their dice.
  // One stable ref callback per die, so a re-render never detaches and re-attaches a label.
  const labelRefs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const setLabel = (key: string) => {
    let fn = labelRefs.current.get(key);
    if (!fn) {
      fn = (el: HTMLElement | null) => {
        if (el) labels.current.set(key, el); else labels.current.delete(key);
        engineRef.current?.label(key, el);
      };
      labelRefs.current.set(key, fn);
    }
    return fn;
  };
  useEffect(() => {
    if (!engine) return;
    for (const [k, el] of labels.current) engine.label(k, el);
  }, [engine, glyphs, deckArt]);

  // ---------------------------------------------------------------- the pointer: dice first, then whatever is under
  const inertRef = useRef(inert);
  inertRef.current = inert;
  useEffect(() => {
    if (!felt || !engine) return;
    let press: { key: string; x: number; y: number; t: number; moved: boolean; id: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = felt.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      if (inertRef.current || e.button !== 0) return;
      const p = local(e);
      const key = engine.hit(p.x, p.y);
      if (!key) return;
      e.stopPropagation();
      e.preventDefault();
      try { felt.setPointerCapture(e.pointerId); } catch { /* gone */ }
      press = { key, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId };
      engine.grab(key, p.x, p.y);
      felt.style.cursor = 'grabbing';
      playSfx('placeToken', { volume: 0.35, cents: 300 });
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (press && e.pointerId === press.id) {
        if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) press.moved = true;
        engine.drag(p.x, p.y);
        return;
      }
      if (inertRef.current) return;
      const key = engine.hit(p.x, p.y);
      engine.hover(key);
      setHoverKey(key);
      felt.style.cursor = key ? 'grab' : '';
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const pr = press;
      press = null;
      felt.style.cursor = 'grab';
      const speed = engine.release();
      if (!pr.moved && performance.now() - pr.t < 450) {
        if (pr.key === CAT) {
          const s = engine.state(CAT);
          if (s) { playSfx('floatMenuOpen'); setRing({ x: s.x, y: s.y }); }
        } else {
          const a = actionsRef.current.find((x) => x.key === pr.key);
          if (a && !a.disabled) a.onPress();
        }
      } else if (speed > 900) {
        playSfx('gearScroll1', { volume: 0.25 });
      }
    };
    const onLeave = () => { if (!press) { engine.hover(null); setHoverKey(null); } };
    // A wheel over the category die walks the decks.
    let wheelAcc = 0;
    const onWheel = (e: WheelEvent) => {
      if (inertRef.current) return;
      const p = local(e as unknown as PointerEvent);
      if (engine.hit(p.x, p.y) !== CAT) return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < 60) return;
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      const list = decksRef.current;
      const i = list.findIndex((d) => d.key === currentRef.current);
      const next = list[(i + dir + list.length) % list.length];
      if (next) onPickRef.current(next.key);
    };
    felt.addEventListener('pointerdown', onDown, true);
    felt.addEventListener('pointermove', onMove);
    felt.addEventListener('pointerup', onUp);
    felt.addEventListener('pointercancel', onUp);
    felt.addEventListener('pointerleave', onLeave);
    felt.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      felt.removeEventListener('pointerdown', onDown, true);
      felt.removeEventListener('pointermove', onMove);
      felt.removeEventListener('pointerup', onUp);
      felt.removeEventListener('pointercancel', onUp);
      felt.removeEventListener('pointerleave', onLeave);
      felt.removeEventListener('wheel', onWheel);
    };
  }, [felt, engine]);
  const decksRef = useRef(decks);
  decksRef.current = decks;
  const currentRef = useRef(current);
  currentRef.current = current;
  const onPickRef = useRef(onPickDeck);
  onPickRef.current = onPickDeck;

  // ---------------------------------------------------------------- rolls and reset
  useImperativeHandle(ref, () => ({
    roll: (dice, from) => new Promise<PoolDie[]>((resolve) => {
      if (!engine) { resolve(dice.map((d) => ({ ...d, value: 1 + Math.floor(Math.random() * (d.type === 'd100' ? 100 : FACES_OF[shapeOf(d.type)])) }))); return; }
      clearRoll(engine);
      const keys = new Set<string>();
      const { width: W } = size.current;
      const thrown: { die: PoolDie; keys: string[] }[] = [];
      dice.forEach((d, i) => {
        const specs = rollSpecs(d);
        thrown.push({ die: d, keys: specs.map((s) => s.key) });
        specs.forEach((spec, j) => {
          const spread = Math.min(W - 160, 60 + dice.length * 34);
          const x = Math.min(W - 50, Math.max(50, from.x + (((i + j * 0.5) / Math.max(1, dice.length - 1)) - 0.5) * spread));
          engine.add(spec, x, from.y, { random: true });
          rolled.current.add(spec.key);
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
          const sp = 1100 + Math.random() * 900;
          engine.toss(spec.key, Math.cos(ang) * sp, Math.sin(ang) * sp, 380 + Math.random() * 320);
          keys.add(spec.key);
        });
      });
      playSfx('gearScroll1', { volume: 0.35 });
      const finish = () => {
        clearTimeout(guard);
        resolve(thrown.map(({ die, keys: ks }) => ({ ...die, value: valueOf(die, ks.map((k) => engine.state(k)?.top ?? 0)) })));
      };
      // A die held in someone's hand never lands: after a while the roll reads what is on top regardless.
      const guard = setTimeout(() => { if (pending.current?.done === finish) pending.current = null; finish(); }, 9000);
      pending.current = { keys, done: finish };
    }),
    clearRoll: () => { if (engine) clearRoll(engine); },
    resetHome: () => {
      if (!engine) return;
      saveDicePlaces({});
      const h = homes(size.current.width, size.current.height);
      for (const k of Object.keys(h)) if (engine.has(k)) engine.home(k, h[k].x, h[k].y, k === CAT ? deckFace.indexOf(currentRef.current) : 0);
      playSfx('gearScroll2', { volume: 0.45 });
    },
  }), [engine, deckFace]);

  const currentDeck = decks.find((d) => d.key === current);

  return (
    <>
      <canvas ref={canvas} style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none', zIndex: 20 }} />
      {/* Labels under the button dice and the category die. */}
      {engine && glyphs ? actions.map((a) => (
        // The label is the die's keyboard handle: Tab reaches it, Enter or Space uses the die. The pointer goes to the die.
        <button key={a.key} type="button" className="rk-die-label" ref={setLabel(a.key)} disabled={a.disabled} aria-label={a.label} onClick={() => { if (!a.disabled) a.onPress(); }} style={{ ...labelStyle, color: hoverKey === a.key ? T.ivory : a.disabled ? 'rgba(147,142,136,0.5)' : T.muted }}>{a.label}</button>
      )) : null}
      {engine && deckArt ? (
        <button type="button" className="rk-die-label" ref={setLabel(CAT)} aria-label={`Decks. ${currentDeck?.label ?? ''}, ${currentDeck?.count ?? 0} cards. Choose a deck`} aria-haspopup="listbox"
          onClick={() => { const s = engine.state(CAT); playSfx('floatMenuOpen'); setRing(s ? { x: s.x, y: s.y } : { x: 74, y: height - 88 }); }}
          style={{ ...labelStyle, color: hoverKey === CAT ? T.ivory : T.goldText }}>{currentDeck?.label ?? ''}<span style={{ color: T.muted, marginLeft: 6 }}>{currentDeck?.count ?? ''}</span></button>
      ) : null}
      {/* The decks' glyphs, drawn once off-screen to be read back as pictures for the die. */}
      <div ref={glyphHost} aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
        {decks.map((d) => <div key={d.key} data-deck={d.key} style={{ width: 48, height: 48 }}><CategoryGlyph category={d.key} meta={d.meta} /></div>)}
      </div>
      {ring ? <DeckRing at={ring} width={width} height={height} decks={decks} current={current} onPick={(c) => { setRing(null); if (c !== current) onPickDeck(c); }} onClose={() => { playSfx('floatMenuClose'); setRing(null); }} /> : null}
      {failed ? (
        // No WebGL: the same controls as plain buttons, so nothing is lost.
        <div style={{ position: 'absolute', left: 16, top: 16, display: 'flex', gap: 8, flexWrap: 'wrap', zIndex: 21 }}>
          {actions.map((a) => <TButton key={a.key} label={a.label} onPress={a.onPress} disabled={a.disabled} />)}
          <TButton label={currentDeck?.label ?? 'Decks'} onPress={() => setRing({ x: 70, y: height - 74 })} />
        </div>
      ) : null}
    </>
  );
});

const labelStyle: React.CSSProperties = {
  all: 'unset', position: 'absolute', left: 0, top: 0, zIndex: 21, pointerEvents: 'none', whiteSpace: 'nowrap', padding: '2px 4px',
  fontFamily: T.bold, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', transition: 'color 140ms',
  textShadow: '0 1px 3px rgba(0,0,0,0.9)', willChange: 'transform',
};

function knockOf(hit: Impact) {
  // Loaded lazily with the engine; the import is cached after the first throw.
  void import('./dice-engine').then((m) => m.knock(playSynth, hit));
}

function shapeOf(t: DieType): Shape {
  return t === 'duality' || t === 'd100' ? (t === 'd100' ? 'd10' : 'd12') : (t as Shape);
}

/** The engine dice one pool die is thrown as: one, or two for a percentile (tens and units). */
function rollSpecs(d: PoolDie): DieSpec[] {
  const base = `roll:${d.id}`;
  if (d.type === 'd100') {
    const c = DIE_COLOR.d100;
    return [
      { key: `${base}:t`, shape: 'd10', size: ROLL_SIZE.d100, body: c, edge: c, ink: '#FAF8F2', faces: Array.from({ length: 10 }, (_, i) => ({ text: `${i}0` })) },
      { key: `${base}:u`, shape: 'd10', size: ROLL_SIZE.d100, body: '#2a1d12', edge: c, ink: '#F2D9A8', faces: Array.from({ length: 10 }, (_, i) => ({ text: String(i) })) },
    ];
  }
  const shape = shapeOf(d.type);
  const n = FACES_OF[shape];
  const hope = d.side === 'hope';
  const fear = d.side === 'fear';
  const body = hope ? HOPE_GOLD : fear ? FEAR_PURPLE : DIE_COLOR[d.type];
  const ink = hope ? HOPE_INK : fear ? FEAR_INK : DIE_INK[d.type] ?? '#FAF8F2';
  return [{ key: base, shape, size: d.side ? ROLL_SIZE.duality : ROLL_SIZE[d.type] ?? 62, body, edge: hope ? '#E0B563' : fear ? '#5b3a7a' : body, ink, gilded: hope, faces: Array.from({ length: n }, (_, i) => ({ text: String(i + 1) })) }];
}

/** What a pool die rolled, from the faces its dice came to rest on. */
function valueOf(d: PoolDie, tops: number[]): number {
  if (d.type === 'd100') {
    const v = tops[0] * 10 + (tops[1] ?? 0);
    return v === 0 ? 100 : v;
  }
  return tops[0] + 1;
}


/**
 * The decks, fanned out beside the category die: a column of tiles that springs out of the die and curves a
 * little round it, opening towards the middle of the table. Arrow keys move, Enter picks, Escape closes.
 */
function DeckRing({ at, width, height, decks, current, onPick, onClose }: { at: { x: number; y: number }; width: number; height: number; decks: TableDeck[]; current: CardCategory; onPick: (c: CardCategory) => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(Math.max(0, decks.findIndex((d) => d.key === current)));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const id = requestAnimationFrame(() => setOpen(true)); box.current?.focus(); return () => cancelAnimationFrame(id); }, []);
  const TW = 200, TH = 42, GAP = 6;
  const right = at.x < width / 2;
  const total = decks.length * (TH + GAP) - GAP;
  const top = Math.min(height - total - 10, Math.max(10, at.y - total / 2));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => (f + (e.key === 'ArrowDown' ? 1 : -1) + decks.length) % decks.length); playSfx('floatMenuHighlight', { volume: 0.4 }); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const d = decks[focus]; if (d) onPick(d.key); }
  };
  return (
    <>
      <div onPointerDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
      <div ref={box} tabIndex={-1} role="listbox" aria-label="Decks" onKeyDown={onKey} style={{ position: 'absolute', left: 0, top: 0, zIndex: 41, outline: 'none' }}>
        {decks.map((d, i) => {
          const y = top + i * (TH + GAP);
          const mid = (y + TH / 2 - at.y) / Math.max(120, total / 2);
          const x = right ? at.x + 66 + 26 * (1 - Math.min(1, mid * mid)) : at.x - 66 - TW - 26 * (1 - Math.min(1, mid * mid));
          const active = d.key === current;
          const lit = focus === i;
          return (
            <div
              key={d.key}
              role="option"
              aria-selected={active}
              onPointerEnter={() => { if (focus !== i) { setFocus(i); playSfx('floatMenuHighlight', { volume: 0.4 }); } }}
              onClick={() => onPick(d.key)}
              style={{
                position: 'absolute', left: x, top: y, width: TW, height: TH, cursor: 'pointer',
                // The lit tile steps out whole, so no edge of its frame thickens into a bar.
                transform: open ? (lit && !active ? `translateX(${right ? 6 : -6}px)` : 'none') : `translate(${at.x - x - TW / 2}px, ${at.y - y - TH / 2}px) scale(0.3)`,
                opacity: open ? 1 : 0,
                transition: `transform 240ms ${T.ease}, opacity 180ms ${i * 22}ms`,
              }}>
              <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(9px 0, calc(100% - 9px) 0, 100% 9px, 100% calc(100% - 9px), calc(100% - 9px) 100%, 9px 100%, 0 calc(100% - 9px), 0 9px)', background: active ? T.red : lit ? T.goldBright : T.goldSoft, padding: 1.3 }}>
                <div style={{ width: '100%', height: '100%', clipPath: 'polygon(8.5px 0, calc(100% - 8.5px) 0, 100% 8.5px, 100% calc(100% - 8.5px), calc(100% - 8.5px) 100%, 8.5px 100%, 0 calc(100% - 8.5px), 0 8.5px)', background: active ? T.red : lit ? T.panelLit : 'rgba(14,17,22,0.96)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 8px', boxSizing: 'border-box' }}>
                  <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(0.66)' }}><CategoryGlyph category={d.key} meta={d.meta} /></div>
                  <span style={{ flex: 1, color: active || lit ? T.ivory : T.goldText, fontFamily: Display.bold, fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                  <span style={{ color: active ? 'rgba(253,252,247,0.8)' : T.muted, fontFamily: T.bold, fontSize: 12 }}>{d.count}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
