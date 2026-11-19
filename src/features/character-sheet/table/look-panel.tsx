/**
 * Table settings (v0.47.0; v0.47.1 owner round two). Lies exactly over the sheet's port, so the whole table stays in
 * view while you change it and nothing on the sheet can be pressed behind it.
 *
 * Four tabs: the Hand (how the row of cards looks), Motion (how it moves), the Table (where the hand lies, the
 * table's edge, the dice) and Looks (ready made, saved, shared). Each tab is a few labelled groups; the ones used
 * least start folded. Every control says what it does in a line.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { playSfx } from '@/lib/sfx';
import { BUILTIN_LOOKS, type DeckLook, decodeLook, DEFAULT_LOOK, encodeLook, type LookControl, type LookGroup, LOOK_PAGES, wearsHand, withHand } from './deck-look';
import { loadSavedLooks, type SavedLook, saveSavedLooks } from './table-store';
import { chamferClip, Glyph, T, TButton } from './table-ui';

const PAGES = [...LOOK_PAGES.map((p) => ({ id: p.id, title: p.title })), { id: 'looks', title: 'Looks' }];

export function LookPanel({ look, onChange, onClose, onClearTable, boardCount, box }: { look: DeckLook; onChange: (l: DeckLook) => void; onClose: () => void; onClearTable: () => void; boardCount: number; box: { left: number; top: number; width: number; height: number } }) {
  const [page, setPage] = useState('hand');
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
          <div style={{ color: T.muted, fontFamily: T.medium, fontSize: 13.5, marginTop: 4 }}>Changes show on the table as you make them.</div>
        </div>
        <TButton title="Put every setting back" label="Reset" h={30} onPress={() => { playSfx('buttonTap'); onChange(DEFAULT_LOOK); }} />
        <TButton title="Close settings" h={30} onPress={onClose} icon={<Glyph d='<path d="M6 6l12 12M18 6 6 18"/>' size={14} />} />
      </div>
      <div role="tablist" ref={tabs} onKeyDown={onTabKey} style={{ display: 'flex', padding: '0 14px', borderBottom: '1px solid rgba(218,162,73,0.25)' }}>
        {PAGES.map((p) => <Tab key={p.id} label={p.title} active={page === p.id} onPress={() => { if (page !== p.id) { playSfx('floatMenuHighlight', { volume: 0.5 }); setPage(p.id); } }} />)}
      </div>
      <div ref={body} className="rk-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 22px 22px' }}>
        {current ? current.groups.map((g) => <Group key={g.title} g={g} look={look} onChange={onChange} />) : <LooksPage look={look} onChange={onChange} onClearTable={onClearTable} boardCount={boardCount} />}
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
  const set = (v: unknown) => onChange({ ...look, [c.key]: v } as DeckLook);
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

function LooksPage({ look, onChange, onClearTable, boardCount }: { look: DeckLook; onChange: (l: DeckLook) => void; onClearTable: () => void; boardCount: number }) {
  const [saved, setSaved] = useState<SavedLook[]>(loadSavedLooks);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const same = (a: DeckLook) => JSON.stringify(a) === JSON.stringify(look);
  const store = (list: SavedLook[]) => { setSaved(list); saveSavedLooks(list); };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    store([{ name: n, look }, ...saved.filter((s) => s.name !== n)].slice(0, 24));
    setName('');
    playSfx('cardSelect', { volume: 0.6 });
  };
  const copy = () => {
    const text = encodeLook(look);
    void navigator.clipboard?.writeText(text).then(
      () => setNote({ text: 'Code copied. Paste it to whoever should have this table.' }),
      () => setNote({ text: text }),
    );
    playSfx('buttonTap');
  };
  const use = () => {
    const l = decodeLook(code);
    if (!l) { setNote({ text: 'That is not a table code. Codes start with RK1: and come from Copy code.', bad: true }); playSfx('cardDisable', { volume: 0.5 }); return; }
    onChange(l);
    setCode('');
    setNote({ text: 'Applied. Save it below to keep it.' });
    playSfx('cardSelect', { volume: 0.6 });
  };
  const block = { display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0 12px', borderBottom: '1px solid rgba(218,162,73,0.14)' } as const;
  return (
    <>
      <div style={block}>
        <SectionTitle>Ready-made hands</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13 }}>These change the hand only; your table, dice and motion stay as they are.</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {BUILTIN_LOOKS.map((b) => <LookRow key={b.name} name={b.name} active={wearsHand(look, b.look)} onPress={() => { playSfx('buttonTap', { volume: 0.6 }); onChange(withHand(look, b.look)); }} />)}
        </div>
      </div>
      <div style={block}>
        <SectionTitle>Your tables</SectionTitle>
        {saved.length === 0 ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13 }}>Nothing saved yet. Name what you have now to keep it: hand, motion and table together.</span> : null}
        {saved.map((s) => (
          <div key={s.name} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={{ flex: 1 }}><LookRow name={s.name} active={same(s.look)} onPress={() => { playSfx('buttonTap', { volume: 0.6 }); onChange(s.look); }} /></div>
            <TButton title={`Delete ${s.name}`} h={30} onPress={() => { playSfx('tokenRemove', { volume: 0.6 }); store(saved.filter((x) => x.name !== s.name)); }} icon={<Glyph d='<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>' size={13} color={T.muted} />} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 5 }}>
          <Field value={name} onChange={setName} placeholder="Name this table" onEnter={save} max={40} />
          <TButton label="Save" h={32} disabled={!name.trim()} onPress={save} />
        </div>
      </div>
      <div style={block}>
        <SectionTitle>Share</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>Copy a code for everything you have set, or paste one someone sent you.</span>
        <TButton label="Copy code" primary h={32} onPress={copy} />
        <div style={{ display: 'flex', gap: 5 }}>
          <Field value={code} onChange={(v) => { setCode(v); setNote(null); }} placeholder="Paste a code (RK1:...)" onEnter={use} max={2000} />
          <TButton label="Use" h={32} disabled={!code.trim()} onPress={use} />
        </div>
        {note ? <span role="status" style={{ color: note.bad ? '#E2705A' : T.goldText, fontFamily: T.medium, fontSize: 13, lineHeight: '18px', wordBreak: 'break-all' }}>{note.text}</span> : null}
      </div>
      <div style={{ ...block, borderBottom: 'none' }}>
        <SectionTitle>Cards on the table</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '18px' }}>{boardCount ? `${boardCount} card${boardCount === 1 ? '' : 's'} laid out. Clearing puts the copies away; the cards stay in your decks.` : 'None laid out. Click the centre card of your hand to take a copy.'}</span>
        <TButton label="Clear the table" h={32} disabled={!boardCount} onPress={() => { playSfx('tokenRemove'); onClearTable(); }} />
      </div>
    </>
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
