/**
 * Table settings (v0.47.0; v0.47.1 round two; v0.47.3 owner round four). Lies exactly over the sheet's port, so the
 * whole table stays in view while you change it and nothing on the sheet can be pressed behind it.
 *
 * Four tabs. Presets comes first: share what you have (a link or a code) in one click, pick a whole table made for
 * a way of playing, save your own, or let the table surprise you. Then the Hand (how the row of cards looks),
 * Motion (how it moves) and the Table (where the hand lies, the edge, the dice). While settings are open the rows
 * of pieces on the table can be dragged somewhere else.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { playSfx } from '@/lib/sfx';
import { BUILTIN_LOOKS, type DeckLook, decodeLook, DEFAULT_LOOK, encodeLook, type LookControl, type LookGroup, LOOK_PAGES, PLACE_KEYS, randomTables, TABLE_PRESETS, wearsHand, withHand } from './deck-look';
import { loadSavedLooks, type SavedLook, saveSavedLooks } from './table-store';
import { chamferClip, Glyph, T, TButton } from './table-ui';

const PAGES = [{ id: 'presets', title: 'Presets' }, ...LOOK_PAGES.map((p) => ({ id: p.id, title: p.title }))];

/** The four tables drawn at random and kept (v0.47.3): seeded, so they are the same for everyone until tuned. */
export const WILD_TABLES = randomTables(4, 47003).map((look, i) => ({ id: `wild${i + 1}`, name: ['Wild one', 'Wild two', 'Wild three', 'Wild four'][i], who: 'Drawn at random and kept because it worked. Not tuned by hand yet.', look }));

export function LookPanel({ look, onChange, onClose, onClearTable, boardCount, pieceCount, box }: { look: DeckLook; onChange: (l: DeckLook) => void; onClose: () => void; onClearTable: () => void; boardCount: number; pieceCount: number; box: { left: number; top: number; width: number; height: number } }) {
  const [page, setPage] = useState('presets');
  const body = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [page]);
  // Opening the panel puts the keyboard on its tabs; the arrows move between them.
  useEffect(() => { tabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus(); }, []);
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    e.stopPropagation();
    const i = PAGES.findIndex((p) => p.id === page);
    const next = PAGES[(i + (e.key === 'ArrowRight' ? 1 : -1) + PAGES.length) % PAGES.length];
    setPage(next.id);
    requestAnimationFrame(() => tabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
  };
  const current = LOOK_PAGES.find((p) => p.id === page);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="dialog" aria-label="Table settings" aria-modal="false" className="rk-scroll"
      onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height, zIndex: 1200, background: T.ink, boxSizing: 'border-box', borderRight: `1px solid ${T.goldSoft}`, display: 'flex', flexDirection: 'column', boxShadow: '12px 0 40px rgba(0,0,0,0.55)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '18px 16px 12px 22px', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.ivory, fontFamily: T.display, fontSize: 19, letterSpacing: 1.4, textTransform: 'uppercase' }}>Table settings</div>
          <div style={{ color: T.muted, fontFamily: T.medium, fontSize: 13.5, marginTop: 4, lineHeight: '19px' }}>Changes show on the table as you make them. Drag the framed rows on the table to move them.</div>
        </div>
        <TButton title="Close settings" h={32} onPress={onClose} icon={<Glyph d='<path d="M6 6l12 12M18 6 6 18"/>' size={14} />} />
      </div>
      <div role="tablist" ref={tabs} onKeyDown={onTabKey} style={{ display: 'flex', padding: '0 14px', borderBottom: '1px solid rgba(218,162,73,0.25)' }}>
        {PAGES.map((p) => <Tab key={p.id} label={p.title} active={page === p.id} onPress={() => { if (page !== p.id) { playSfx('floatMenuHighlight', { volume: 0.5 }); setPage(p.id); } }} />)}
      </div>
      <div ref={body} className="rk-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 22px 28px' }}>
        {current ? current.groups.filter((g) => !g.hidden).map((g) => <Group key={g.title} g={g} look={look} onChange={onChange} />) : <PresetsPage look={look} onChange={onChange} onClearTable={onClearTable} boardCount={boardCount} pieceCount={pieceCount} />}
      </div>
    </div>,
    document.body,
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '10px 4px 11px', position: 'relative', color: active ? T.ivory : hover ? T.goldText : T.muted, fontFamily: T.bold, fontSize: 13.5, letterSpacing: 1, textTransform: 'uppercase', transition: 'color 140ms' }}>
      {label}
      <span style={{ position: 'absolute', left: 10, right: 10, bottom: -1, height: 2, background: T.red, transform: `scaleX(${active ? 1 : 0})`, transition: `transform 200ms ${T.ease}` }} />
    </button>
  );
}

/** A labelled group; `more` groups start folded and open with a click on their title. */
function Group({ g, look, onChange }: { g: LookGroup; look: DeckLook; onChange: (l: DeckLook) => void }) {
  const [open, setOpen] = useState(!g.more);
  const changed = g.controls.filter((c) => look[c.key] !== DEFAULT_LOOK[c.key]).length;
  return (
    <section style={{ borderBottom: '1px solid rgba(218,162,73,0.14)', padding: '14px 0 12px' }}>
      <button type="button" aria-expanded={open} onClick={() => { playSfx('buttonTap', { volume: 0.4 }); setOpen((o) => !o); }} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span style={{ flex: 1, color: T.goldText, fontFamily: T.bold, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' }}>{g.title}</span>
        {changed ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13 }}>{changed} changed</span> : null}
        <span style={{ display: 'flex', transform: `rotate(${open ? 180 : 0}deg)`, transition: `transform 200ms ${T.ease}` }}><Glyph d='<path d="M6 9l6 6 6-6"/>' size={15} color={T.muted} /></span>
      </button>
      {open ? <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>{g.controls.map((c) => <Control key={c.key} c={c} look={look} onChange={onChange} />)}</div> : null}
    </section>
  );
}

function fmt(c: Extract<LookControl, { kind: 'range' }>, v: number) {
  const digits = c.step >= 1 ? 0 : c.step >= 0.1 ? 1 : 2;
  return `${v.toFixed(digits)}${c.unit ?? ''}`;
}

function Control({ c, look, onChange }: { c: LookControl; look: DeckLook; onChange: (l: DeckLook) => void }) {
  // Picking a hand position puts back a hand that was dragged somewhere of its own.
  const set = (v: unknown) => onChange({ ...look, [c.key]: v, ...(c.key === 'areaPos' ? { areaY: -1 } : {}) } as DeckLook);
  const changed = look[c.key] !== DEFAULT_LOOK[c.key];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, color: T.ivory, fontFamily: T.bold, fontSize: 14.5 }}>{c.label}</span>
        {c.kind === 'range' && c.costly && (look[c.key] as number) > 0 ? <span style={{ color: '#E2705A', fontFamily: T.medium, fontSize: 12.5 }}>Slower on big decks</span> : null}
        {c.kind === 'range' ? <span style={{ color: changed ? T.goldText : T.muted, fontFamily: T.bold, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmt(c, look[c.key] as number)}</span> : null}
        {changed ? (
          <button type="button" title={`Put ${c.label} back`} aria-label={`Put ${c.label} back`} onClick={() => set(DEFAULT_LOOK[c.key])} style={{ all: 'unset', cursor: 'pointer', display: 'flex' }}>
            <Glyph d='<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.2 4.2v4.6h4.6"/>' size={12} color={T.muted} />
          </button>
        ) : null}
      </div>
      {c.kind === 'range' ? (
        <input type="range" className="rk-range" aria-label={c.label} min={c.min} max={c.max} step={c.step} value={look[c.key] as number} onChange={(e) => set(+e.target.value)} />
      ) : c.kind === 'choice' ? (
        <div role="radiogroup" aria-label={c.label} style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {c.options.map((o) => <Seg key={o.value} label={o.label} active={look[c.key] === o.value} onPress={() => { playSfx('buttonTap', { volume: 0.5 }); set(o.value); }} />)}
        </div>
      ) : (
        <div role="radiogroup" aria-label={c.label} style={{ display: 'flex', gap: 3 }}>
          <Seg label="Off" active={!look[c.key]} onPress={() => set(false)} />
          <Seg label="On" active={!!look[c.key]} onPress={() => set(true)} />
        </div>
      )}
      <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>{c.help}</span>
    </div>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} style={{ all: 'unset', cursor: 'pointer' }}>
      <div style={{ clipPath: chamferClip(4), background: active ? T.red : hover ? T.goldBright : 'rgba(218,162,73,0.3)', padding: 1 }}>
        <div style={{ clipPath: chamferClip(3.6), background: active ? T.red : hover ? T.panelLit : T.panel, height: 30, padding: '0 11px', display: 'flex', alignItems: 'center', color: active || hover ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</div>
      </div>
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <span style={{ color: T.goldText, fontFamily: T.bold, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' }}>{children}</span>;
}

/** A link that opens RuneKeep with this table offered to whoever follows it. */
function shareLink(look: DeckLook): string {
  const here = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}${window.location.search}` : '';
  return `${here}#table=${encodeURIComponent(encodeLook(look))}`;
}

const sameLook = (a: DeckLook, b: DeckLook) => JSON.stringify(a) === JSON.stringify(b);

function PresetsPage({ look, onChange, onClearTable, boardCount, pieceCount }: { look: DeckLook; onChange: (l: DeckLook) => void; onClearTable: () => void; boardCount: number; pieceCount: number }) {
  const [saved, setSaved] = useState<SavedLook[]>(loadSavedLooks);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [surprise, setSurprise] = useState(0);
  const store = (list: SavedLook[]) => { setSaved(list); saveSavedLooks(list); };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    store([{ name: n, look }, ...saved.filter((s) => s.name !== n)].slice(0, 24));
    setName('');
    playSfx('cardSelect', { volume: 0.6 });
  };
  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => setNote({ text: `${what} copied. Send it to whoever should have this table.` }),
      () => setNote({ text }),
    );
    playSfx('buttonTap');
  };
  const use = () => {
    // A link or a bare code: both carry the same RK1 code.
    const m = /table=([^&\s]+)/.exec(code);
    const l = decodeLook(m ? decodeURIComponent(m[1]) : code);
    if (!l) { setNote({ text: 'That is not a table. Paste a link or a code that came from Copy link or Copy code.', bad: true }); playSfx('cardDisable', { volume: 0.5 }); return; }
    onChange(l);
    setCode('');
    setNote({ text: 'Applied. Save it below to keep it.' });
    playSfx('cardSelect', { volume: 0.6 });
  };
  const block = { display: 'flex', flexDirection: 'column', gap: 9, padding: '16px 0 14px', borderBottom: '1px solid rgba(218,162,73,0.14)' } as const;
  const shuffle = () => {
    const seed = (Date.now() + surprise * 7919) >>> 0;
    const l = randomTables(1, seed)[0];
    if (l) { onChange(l); setSurprise((s) => s + 1); playSfx('carouselScroll', { volume: 0.8, cents: 300 }); }
  };
  return (
    <>
      <div style={block}>
        <SectionTitle>Share this table</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>Everything you have set, hand, motion, table and where the pieces live. A link opens it for them; a code fits in a chat.</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <TButton label="Copy link" primary wide h={34} onPress={() => copy(shareLink(look), 'Link')} />
          <TButton label="Copy code" wide h={34} onPress={() => copy(encodeLook(look), 'Code')} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Field value={code} onChange={(v) => { setCode(v); setNote(null); }} placeholder="Paste a link or a code" onEnter={use} max={3000} />
          <TButton label="Use" h={34} disabled={!code.trim()} onPress={use} />
        </div>
        {note ? <span role="status" style={{ color: note.bad ? '#E2705A' : T.goldText, fontFamily: T.medium, fontSize: 13, lineHeight: '18px', wordBreak: 'break-all' }}>{note.text}</span> : null}
      </div>

      <div style={block}>
        <SectionTitle>Tables</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>Each one is a way of playing: it sets the whole table, the hand and where every piece lives.</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {TABLE_PRESETS.map((p) => <TableTile key={p.id} name={p.name} who={p.who} look={p.look} active={sameLook(look, p.look)} onPress={() => { playSfx('cardSelect', { volume: 0.6 }); onChange(p.look); }} />)}
        </div>
      </div>

      <div style={block}>
        <SectionTitle>Wild tables</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>Drawn at random until they came out right. Or roll a new one.</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {WILD_TABLES.map((p) => <TableTile key={p.id} name={p.name} who="" look={p.look} active={sameLook(look, p.look)} onPress={() => { playSfx('cardSelect', { volume: 0.6 }); onChange(p.look); }} />)}
        </div>
        <TButton label="Surprise me" h={34} onPress={shuffle} />
      </div>

      <div style={block}>
        <SectionTitle>Your tables</SectionTitle>
        {saved.length === 0 ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13 }}>Nothing saved yet. Name what you have now to keep it.</span> : null}
        {saved.map((s) => (
          <div key={s.name} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={{ flex: 1 }}><LookRow name={s.name} active={sameLook(look, s.look)} onPress={() => { playSfx('buttonTap', { volume: 0.6 }); onChange(s.look); }} /></div>
            <TButton title={`Copy a link to ${s.name}`} h={34} onPress={() => copy(shareLink(s.look), 'Link')} icon={<Glyph d='<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' size={14} color={T.muted} />} />
            <TButton title={`Delete ${s.name}`} h={34} onPress={() => { playSfx('tokenRemove', { volume: 0.6 }); store(saved.filter((x) => x.name !== s.name)); }} icon={<Glyph d='<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>' size={13} color={T.muted} />} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <Field value={name} onChange={setName} placeholder="Name this table" onEnter={save} max={40} />
          <TButton label="Save" h={34} disabled={!name.trim()} onPress={save} />
        </div>
      </div>

      <div style={block}>
        <SectionTitle>Hands only</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13 }}>These change the row of cards and nothing else.</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {BUILTIN_LOOKS.map((b) => <LookRow key={b.name} name={b.name} active={wearsHand(look, b.look)} onPress={() => { playSfx('buttonTap', { volume: 0.6 }); onChange(withHand(look, b.look)); }} />)}
        </div>
      </div>

      <div style={{ ...block, borderBottom: 'none' }}>
        <SectionTitle>Start over</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>
          {boardCount || pieceCount ? `On the table: ${[boardCount ? `${boardCount} card${boardCount === 1 ? '' : 's'}` : '', pieceCount ? `${pieceCount} loose piece${pieceCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}. Clearing puts it all away; your decks keep every card.` : 'The table is clear.'}
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <TButton label="Clear the table" h={34} disabled={!boardCount && !pieceCount} onPress={() => { playSfx('tokenRemove'); onClearTable(); }} />
          <TButton label="Default layout" h={34} title="Put the rows of pieces back where they start" onPress={() => { playSfx('buttonTap'); const out = { ...look } as Record<string, unknown>; for (const k of PLACE_KEYS) out[k] = DEFAULT_LOOK[k]; onChange(out as unknown as DeckLook); }} />
          <TButton label="Every setting" h={34} title="Put every setting back as it came" onPress={() => { playSfx('buttonTap'); onChange(DEFAULT_LOOK); }} />
        </div>
      </div>
    </>
  );
}

/**
 * A whole table as a tile: a little map of it (the felt, where the hand lies, the rows of pieces) over its name and
 * who it is for.
 */
function TableTile({ name, who, look, active, onPress }: { name: string; who: string; look: DeckLook; active: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  const map = useMemo(() => tableMap(look), [look]);
  return (
    <button type="button" onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} aria-pressed={active} title={who || name} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div style={{ clipPath: chamferClip(6), background: active ? T.red : hover ? T.goldBright : 'rgba(218,162,73,0.3)', padding: 1.2 }}>
        <div style={{ clipPath: chamferClip(5.5), background: active ? 'rgba(200,27,24,0.2)' : hover ? T.panelLit : T.panel, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {map}
          <span style={{ color: active || hover ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 13.5 }}>{name}</span>
          {who ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12, lineHeight: '16px' }}>{who}</span> : null}
        </div>
      </div>
    </button>
  );
}

/** The little map: 120 x 80 units for the table. */
function tableMap(l: DeckLook) {
  const W = 120, H = 80;
  const handTop = l.areaPos === 'top' ? 0 : l.areaPos === 'middle' ? 0.5 - l.areaSize / 200 : 1 - l.areaSize / 100;
  const handH = l.areaSize / 100;
  const cardW = Math.max(5, Math.min(16, l.size / 16));
  const cardH = cardW * 1.4;
  const cy = (handTop + handH * Math.min(0.75, Math.max(0.25, l.rowY))) * H;
  const n = Math.min(9, l.side * 2 + 1);
  const step = cardW * Math.max(0.22, 1 + l.spacing);
  const cards = l.handMode === 'spread'
    ? Array.from({ length: 10 }, (_, i) => ({ x: 14 + (i % 5) * 16, y: 26 + Math.floor(i / 5) * 22, r: 0 }))
    : Array.from({ length: n }, (_, i) => { const k = i - (n - 1) / 2; return { x: W / 2 + k * step, y: cy + l.arc * 0.06 * (k / Math.max(1, (n - 1) / 2)) ** 2, r: k * l.tilt * 0.8 }; });
  const dot = (x: number, y: number, c: string, s = 3.2) => <rect x={x - s} y={y - s} width={s * 2} height={s * 2} transform={`rotate(45 ${x} ${y})`} fill={c} />;
  const row = (x: number, y: number, count: number, dir: 'row' | 'column', c: string, gap: number) => Array.from({ length: count }, (_, i) => { const o = (i - (count - 1) / 2) * gap; return <g key={`${c}${i}`}>{dot(dir === 'row' ? x * W + o : x * W, dir === 'row' ? y * H : y * H + o, c)}</g>; });
  const wall = l.walls === 'brass' ? '#C8923A' : l.walls === 'stone' ? '#4a4f58' : l.walls === 'line' ? 'rgba(218,162,73,0.45)' : 'transparent';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', aspectRatio: '3 / 2' }} aria-hidden="true">
      <rect x="0" y="0" width={W} height={H} fill="#16301f" />
      <rect x="1" y="1" width={W - 2} height={H - 2} fill="none" stroke={wall} strokeWidth={l.walls === 'stone' ? 3 : 1.4} />
      {l.handMode === 'carousel' && l.areaMode === 'tray' ? <rect x="3" y={handTop * H + 1} width={W - 6} height={handH * H - 2} fill="rgba(0,0,0,0.22)" /> : null}
      {cards.map((c, i) => <rect key={i} x={c.x - cardW / 2} y={c.y - cardH / 2} width={cardW} height={cardH} fill={i === Math.floor(cards.length / 2) && l.handMode === 'carousel' ? '#efe4c8' : '#b9ab8c'} stroke="#2a2216" strokeWidth="0.5" transform={`rotate(${c.r} ${c.x} ${c.y})`} />)}
      {l.controls !== 'hidden' ? row(l.ctlX, l.ctlY, 3, l.ctlDir, l.controlDice === 'gilded' ? '#E0B563' : l.controlDice === 'ivory' ? '#EAE0C8' : '#0e1117', 7) : null}
      {l.controls !== 'hidden' ? dot(l.catX * W, l.catY * H, '#C81B18', 4.4) : null}
      {l.tokenTray ? row(l.supX, l.supY, 4, l.supDir, '#9A6B3C', 6) : null}
    </svg>
  );
}

function LookRow({ name, active, onPress }: { name: string; active: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} aria-pressed={active} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div style={{ clipPath: chamferClip(5), background: active ? T.red : hover ? T.goldBright : 'rgba(218,162,73,0.3)', padding: 1 }}>
        <div style={{ clipPath: chamferClip(4.6), background: active ? 'rgba(200,27,24,0.25)' : hover ? T.panelLit : T.panel, height: 34, padding: '0 11px', display: 'flex', alignItems: 'center', color: active || hover ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
      </div>
    </button>
  );
}

function Field({ value, onChange, placeholder, onEnter, max }: { value: string; onChange: (v: string) => void; placeholder: string; onEnter: () => void; max: number }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ flex: 1, clipPath: chamferClip(5), background: focus ? T.goldBright : 'rgba(218,162,73,0.3)', padding: 1 }}>
      <input value={value} maxLength={max} placeholder={placeholder} aria-label={placeholder} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); e.stopPropagation(); }}
        style={{ all: 'unset', boxSizing: 'border-box', width: '100%', height: 34, padding: '0 11px', clipPath: chamferClip(4.6), background: T.panel, color: T.ivory, fontFamily: T.medium, fontSize: 14, caretColor: T.red }} />
    </div>
  );
}
