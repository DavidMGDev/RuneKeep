/**
 * Table settings (v0.47.0; v0.47.1 round two; v0.47.3 owner round four). Lies exactly over the sheet's port, so the
 * whole table stays in view while you change it and nothing on the sheet can be pressed behind it.
 *
 * Four tabs. Presets comes first: load a preset (ready-made, your own, or someone else's code or file), keep your
 * own, share what you have, or start over. Then the Hand (how the row of cards looks),
 * Motion (how it moves) and the Table (where the hand lies, the edge, the dice). While settings are open the rows
 * of pieces on the table can be dragged somewhere else.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { playSfx } from '@/lib/sfx';
import { BUILTIN_LOOKS, type DeckLook, DEFAULT_LOOK, encodeLook, type LookControl, type LookGroup, LOOK_PAGES, PLACE_KEYS, randomTables, readTableFile, TABLE_PRESETS, tableFile, wearsHand, withHand } from './deck-look';
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
        {current ? <>{page === 'hand' ? <HandLooks look={look} onChange={onChange} /> : null}{current.groups.filter((g) => !g.hidden).map((g) => <Group key={g.title} g={g} look={look} onChange={onChange} />)}</> : <PresetsPage look={look} onChange={onChange} onClearTable={onClearTable} boardCount={boardCount} pieceCount={pieceCount} />}
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

/** Put text on the clipboard: the browser's clipboard, else the old copy command. False when neither worked. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* blocked: try the old way */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Save a preset as a .rune file to the downloads (v0.47.9, owner: files and codes, no links). */
function downloadTable(look: DeckLook, name: string): void {
  const url = URL.createObjectURL(new Blob([tableFile(look, name)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'runekeep-preset'}.rune`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const sameLook = (a: DeckLook, b: DeckLook) => JSON.stringify(a) === JSON.stringify(b);

/** `name`, or `name 2`, `name 3`... whichever is not taken yet. */
function uniqueName(name: string, list: SavedLook[]): string {
  const base = name.slice(0, 36);
  if (!list.some((s) => s.name === base)) return base;
  for (let i = 2; ; i++) if (!list.some((s) => s.name === `${base} ${i}`)) return `${base} ${i}`;
}

function PresetsPage({ look, onChange, onClearTable, boardCount, pieceCount }: { look: DeckLook; onChange: (l: DeckLook) => void; onClearTable: () => void; boardCount: number; pieceCount: number }) {
  const [saved, setSaved] = useState<SavedLook[]>(loadSavedLooks);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [shareNote, setShareNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [surprise, setSurprise] = useState(0);
  const store = (list: SavedLook[]) => { setSaved(list); saveSavedLooks(list); };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    store([{ name: n, look }, ...saved.filter((s) => s.name !== n)].slice(0, 24));
    setName('');
    playSfx('cardSelect', { volume: 0.6 });
  };
  /** The code, shown to copy by hand when the browser would not let it be copied. */
  const [shown, setShown] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const copyCode = async () => {
    playSfx('buttonTap');
    const text = encodeLook(look);
    if (await copyText(text)) {
      setShown(null);
      setShareNote({ text: 'Code copied. Whoever gets it pastes it under Load a preset and presses Use.' });
    } else {
      setShown(text);
      setShareNote({ text: 'This browser would not copy it. Select the code below and copy it yourself.', bad: true });
    }
  };
  /** A preset brought in by code or file is used and kept in Your presets under its name (owner, v0.47.11). */
  const apply = (got: { name: string; look: DeckLook } | null, bad: string) => {
    if (!got) { setNote({ text: bad, bad: true }); playSfx('cardDisable', { volume: 0.5 }); return; }
    onChange(got.look);
    const have = saved.find((s) => sameLook(s.look, got.look));
    const n = have?.name ?? uniqueName(got.name.trim() || 'Shared preset', saved);
    if (!have) store([{ name: n, look: got.look }, ...saved].slice(0, 24));
    setNote({ text: `Using ${n}. It is in Your presets below.` });
    playSfx('cardSelect', { volume: 0.6 });
  };
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const rename = () => {
    if (!renaming) return;
    const to = renaming.to.trim();
    if (to && to !== renaming.from) store(saved.map((s) => (s.name === renaming.from ? { ...s, name: uniqueName(to, saved.filter((x) => x.name !== renaming.from)) } : s)));
    setRenaming(null);
  };
  const use = () => {
    apply(readTableFile(code), 'That is not a preset code. Codes start with RK1: and come from Copy code.');
    if (readTableFile(code)) setCode('');
  };
  const openFile = (f: File) => {
    void f.text().then(
      (t) => apply(readTableFile(t), 'That file is not a RuneKeep preset. Presets are the .rune files made by Download file.'),
      () => apply(null, 'That file could not be read.'),
    );
  };
  const block = { display: 'flex', flexDirection: 'column', gap: 9, padding: '16px 0 14px', borderBottom: '1px solid rgba(218,162,73,0.14)' } as const;
  const shuffle = () => {
    const seed = (Date.now() + surprise * 7919) >>> 0;
    const l = randomTables(1, seed)[0];
    if (l) { onChange(l); setSurprise((s) => s + 1); playSfx('carouselScroll', { volume: 0.8, cents: 300 }); }
  };
  const sub = { color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' } as const;
  return (
    <>
      {/* Loading comes first (owner, v0.47.11): the preview, the list of every preset, a code or a file. */}
      <div style={block}>
        <SectionTitle>Load a preset</SectionTitle>
        <span style={sub}>A preset sets everything: the hand, how it moves, the table and where every piece lives.</span>
        <PresetPicker look={look} saved={saved} onPick={(l) => { playSfx('cardSelect', { volume: 0.6 }); onChange(l); }} />
        <TButton label="Surprise me" h={34} title="A new preset drawn at random" onPress={shuffle} />
        <div style={{ height: 1, background: 'rgba(218,162,73,0.14)', margin: '6px 0 2px' }} />
        <span style={sub}>From someone else: paste their code, or open their .rune file.</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <Field value={code} onChange={(v) => { setCode(v); setNote(null); }} placeholder="Paste a code (RK1:...)" onEnter={use} max={6000} />
          <TButton label="Use" h={34} disabled={!code.trim()} onPress={use} />
        </div>
        <TButton label="Open a file" h={34} title="Load a preset from a .rune file" onPress={() => fileInput.current?.click()} />
        <input ref={fileInput} type="file" accept=".rune,.json,.txt" aria-label="Open a preset file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
        {note ? <span role="status" style={{ color: note.bad ? '#E2705A' : T.goldText, fontFamily: T.medium, fontSize: 13, lineHeight: '18px', wordBreak: 'break-all' }}>{note.text}</span> : null}
      </div>

      <div style={block}>
        <SectionTitle>Your presets</SectionTitle>
        {saved.length === 0 ? <span style={sub}>Nothing saved yet. Name what you have now to keep it.</span> : null}
        {saved.map((s) => renaming?.from === s.name ? (
          <div key={s.name} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <Field value={renaming.to} onChange={(v) => setRenaming({ from: s.name, to: v })} placeholder="A new name" onEnter={rename} max={40} />
            <TButton label="Rename" h={34} disabled={!renaming.to.trim()} onPress={rename} />
            <TButton title="Keep the old name" h={34} onPress={() => setRenaming(null)} icon={<Glyph d='<path d="M6 6l12 12M18 6 6 18"/>' size={13} color={T.muted} />} />
          </div>
        ) : (
          <div key={s.name} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={{ flex: 1 }}><LookRow name={s.name} active={sameLook(look, s.look)} onPress={() => { playSfx('buttonTap', { volume: 0.6 }); onChange(s.look); }} /></div>
            <TButton title={`Rename ${s.name}`} h={34} onPress={() => { playSfx('buttonTap', { volume: 0.5 }); setRenaming({ from: s.name, to: s.name }); }} icon={<Glyph d='<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>' size={13} color={T.muted} />} />
            <TButton title={`Download ${s.name} as a file`} h={34} onPress={() => { playSfx('buttonTap'); downloadTable(s.look, s.name); }} icon={<Glyph d='<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>' size={14} color={T.muted} />} />
            <TButton title={`Delete ${s.name}`} h={34} onPress={() => { playSfx('tokenRemove', { volume: 0.6 }); store(saved.filter((x) => x.name !== s.name)); }} icon={<Glyph d='<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>' size={13} color={T.muted} />} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <Field value={name} onChange={setName} placeholder="Name what you have now" onEnter={save} max={40} />
          <TButton label="Save" h={34} disabled={!name.trim()} onPress={save} />
        </div>
      </div>

      <div style={block}>
        <SectionTitle>Share this preset</SectionTitle>
        <span style={sub}>Everything you have set now. A code fits in a chat; a file keeps it exactly, even after RuneKeep updates.</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <TButton label="Copy code" wide h={34} onPress={() => void copyCode()} />
          <TButton label="Download file" wide h={34} title="Save this preset as a .rune file" onPress={() => { playSfx('buttonTap'); downloadTable(look, name.trim() || 'RuneKeep preset'); setShareNote({ text: 'Saved to your downloads as a .rune file. Send it to whoever should have this preset.' }); }} />
        </div>
        {shown ? <textarea readOnly value={shown} aria-label="The preset's code" onFocus={(e) => e.currentTarget.select()} rows={3} style={{ resize: 'none', background: T.panel, color: T.ivory, border: `1px solid ${T.goldSoft}`, fontFamily: T.medium, fontSize: 12, padding: 8, wordBreak: 'break-all' }} /> : null}
        {shareNote ? <span role="status" style={{ color: shareNote.bad ? '#E2705A' : T.goldText, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>{shareNote.text}</span> : null}
      </div>

      <div style={{ ...block, borderBottom: 'none' }}>
        <SectionTitle>Start over</SectionTitle>
        <span style={sub}>
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

/** Every ready-made preset: the six made for a way of playing, then the four drawn at random. */
const ALL_TABLES = [...TABLE_PRESETS.map((t) => ({ ...t, wild: false })), ...WILD_TABLES.map((t) => ({ ...t, wild: true }))];

type PresetEntry = { id: string; name: string; who: string; look: DeckLook; kind: 'made' | 'wild' | 'yours' };

/**
 * Every preset in one list (owner, v0.47.11): made for a way of playing, drawn at random, and your own. The preview
 * stays above the list and the list opens over what is below it, so both show at once: pointing at an entry shows it.
 * Ready-made presets show a real screenshot; your own show their name, as nothing has photographed them.
 */
function PresetPicker({ look, saved, onPick }: { look: DeckLook; saved: SavedLook[]; onPick: (l: DeckLook) => void }) {
  const entries: PresetEntry[] = [
    ...ALL_TABLES.map((t) => ({ id: t.id, name: t.name, who: t.wild ? 'Drawn at random and kept because it worked.' : t.who, look: t.look, kind: (t.wild ? 'wild' : 'made') as PresetEntry['kind'] })),
    ...saved.map((s, i) => ({ id: `yours${i}`, name: s.name, who: 'Saved by you.', look: s.look, kind: 'yours' as const })),
  ];
  const [open, setOpen] = useState(false);
  const current = entries.find((t) => sameLook(look, t.look));
  const [lit, setLit] = useState(Math.max(0, entries.findIndex((t) => t.id === current?.id)));
  const list = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) list.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);
  const shown = open ? entries[lit] : current;
  const pick = (i: number) => { const t = entries[i]; if (!t) return; setOpen(false); onPick(t.look); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setLit((l) => (l + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(lit); }
  };
  const heading = (t: string) => <div style={{ padding: '10px 12px 4px', color: T.muted, fontFamily: T.bold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase' }}>{t}</div>;
  return (
    <div ref={wrap} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* The preview: the entry pointed at in the list, else the preset in use. */}
      <figure style={{ margin: 0, position: 'relative', width: '100%', aspectRatio: '1182 / 900', border: `1px solid ${open ? T.goldBright : T.goldSoft}`, background: T.ink, overflow: 'hidden', transition: 'border-color 160ms' }}>
        {shown && shown.kind !== 'yours' ? (
          <img src={`/table/presets/${shown.id}.webp`} alt={`The ${shown.name} preset laid out`} draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 18, textAlign: 'center', background: 'radial-gradient(circle at 50% 45%, rgba(218,162,73,0.12), transparent 70%)' }}>
            <span style={{ color: T.ivory, fontFamily: T.display, fontSize: 22, letterSpacing: 1 }}>{shown ? shown.name : 'Your own'}</span>
            <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>{shown ? 'Saved by you. No picture of it yet.' : 'Not saved as a preset yet. Name it under Your presets to keep it.'}</span>
          </div>
        )}
        {shown ? (
          <figcaption style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 12px 9px', background: 'linear-gradient(transparent, rgba(6,8,13,0.92) 45%)' }}>
            <div style={{ color: T.ivory, fontFamily: T.bold, fontSize: 14.5 }}>{shown.name}</div>
            {shown.kind === 'made' ? <div style={{ color: 'rgba(253,252,247,0.72)', fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px', marginTop: 2 }}>{shown.who}</div> : null}
          </figcaption>
        ) : null}
      </figure>
      <div style={{ position: 'relative' }}>
        <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => { playSfx(open ? 'floatMenuClose' : 'floatMenuOpen', { volume: 0.6 }); setOpen((o) => !o); }} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
          <div style={{ clipPath: chamferClip(6), background: open ? T.goldBright : 'rgba(218,162,73,0.45)', padding: 1.2 }}>
            <div style={{ clipPath: chamferClip(5.5), background: T.panel, height: 44, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, color: current ? T.ivory : T.muted, fontFamily: T.bold, fontSize: 14.5 }}>{current ? current.name : 'Choose a preset'}</span>
              <span style={{ display: 'flex', transform: `rotate(${open ? 180 : 0}deg)`, transition: `transform 200ms ${T.ease}` }}><Glyph d='<path d="M6 9l6 6 6-6"/>' size={16} /></span>
            </div>
          </div>
        </button>
        {open ? (
          <div ref={list} role="listbox" aria-label="Presets" tabIndex={-1} onKeyDown={onKey} className="rk-scroll"
            style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 20, outline: 'none', border: `1px solid ${T.goldSoft}`, background: 'rgba(11,14,19,0.99)', maxHeight: 340, overflowY: 'auto', boxShadow: '0 18px 36px rgba(0,0,0,0.6)' }}>
            {entries.map((t, i) => (
              <div key={t.id}>
                {i === 0 ? heading('Made for a way of playing') : t.kind !== entries[i - 1].kind ? heading(t.kind === 'wild' ? 'Drawn at random' : 'Your presets') : null}
                <div role="option" aria-selected={current?.id === t.id} onPointerEnter={() => setLit(i)} onClick={() => pick(i)}
                  style={{ cursor: 'pointer', padding: '9px 12px', background: lit === i ? T.panelLit : 'transparent', borderLeft: `3px solid ${current?.id === t.id ? T.red : lit === i ? T.goldBright : 'transparent'}` }}>
                  <div style={{ color: lit === i ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 14 }}>{t.name}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The hand looks: they change the row of cards and nothing else, so they head the Hand tab (owner, v0.47.10). */
function HandLooks({ look, onChange }: { look: DeckLook; onChange: (l: DeckLook) => void }) {
  return (
    <section style={{ borderBottom: '1px solid rgba(218,162,73,0.14)', padding: '14px 0 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <SectionTitle>Ready-made hands</SectionTitle>
      <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13 }}>These change the row of cards and nothing else.</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        {BUILTIN_LOOKS.map((b) => <LookRow key={b.name} name={b.name} active={wearsHand(look, b.look)} onPress={() => { playSfx('buttonTap', { volume: 0.6 }); onChange(withHand(look, b.look)); }} />)}
      </div>
    </section>
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
