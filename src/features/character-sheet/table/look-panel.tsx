/**
 * Table settings (v0.47.0): how the hand looks and moves, page by page, every control explained in a line. Changes
 * apply as you drag, to the hand below, so the panel sits over the felt and never over the cards.
 *
 * Looks: ready-made ones, your own saved by name, and a share code (copy yours, paste someone else's). Nothing
 * here touches the character; it is this browser's table.
 */
import { useEffect, useRef, useState } from 'react';

import { playSfx } from '@/lib/sfx';
import { BUILTIN_LOOKS, type DeckLook, decodeLook, DEFAULT_LOOK, encodeLook, type LookControl, LOOK_PAGES } from './deck-look';
import { loadSavedLooks, type SavedLook, saveSavedLooks } from './table-store';
import { Chamfer, chamferClip, Glyph, T, TButton } from './table-ui';

const PAGES = [...LOOK_PAGES.map((p) => ({ id: p.id, title: p.title })), { id: 'looks', title: 'Looks' }];

export function LookPanel({ look, onChange, onClose, onClearTable, boardCount, maxH }: { look: DeckLook; onChange: (l: DeckLook) => void; onClose: () => void; onClearTable: () => void; boardCount: number; maxH: number }) {
  const [page, setPage] = useState('layout');
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
  return (
    <div role="dialog" aria-label="Table settings" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 16, top: 16, width: 404, zIndex: 50 }}>
      <Chamfer c={14} fill="rgba(12,15,20,0.97)" line={T.gold} width={1.3} inner={{ display: 'flex', flexDirection: 'column', maxHeight: maxH }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 14px 10px 18px', gap: 10 }}>
          <span style={{ flex: 1, color: T.ivory, fontFamily: T.display, fontSize: 15, letterSpacing: 1.4, textTransform: 'uppercase' }}>Table settings</span>
          <TButton title="Put every setting back" label="Reset" h={30} onPress={() => { playSfx('buttonTap'); onChange(DEFAULT_LOOK); }} />
          <TButton title="Close settings" h={30} onPress={onClose} icon={<Glyph d='<path d="M6 6l12 12M18 6 6 18"/>' size={14} />} />
        </div>
        <div role="tablist" ref={tabs} onKeyDown={onTabKey} style={{ display: 'flex', gap: 2, padding: '0 14px', borderBottom: '1px solid rgba(218,162,73,0.25)' }}>
          {PAGES.map((p) => <Tab key={p.id} label={p.title} active={page === p.id} onPress={() => { if (page !== p.id) { playSfx('floatMenuHighlight', { volume: 0.5 }); setPage(p.id); } }} />)}
        </div>
        <div ref={body} className="rk-scroll" style={{ overflowY: 'auto', padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {current ? current.controls.map((c) => <Control key={c.key} c={c} look={look} onChange={onChange} />) : <LooksPage look={look} onChange={onChange} onClearTable={onClearTable} boardCount={boardCount} />}
        </div>
      </Chamfer>
    </div>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      style={{ all: 'unset', cursor: 'pointer', padding: '9px 10px 10px', position: 'relative', color: active ? T.ivory : hover ? T.goldText : T.muted, fontFamily: T.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', transition: 'color 140ms' }}>
      {label}
      <span style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 2, background: T.red, transform: `scaleX(${active ? 1 : 0})`, transition: `transform 200ms ${T.ease}` }} />
    </button>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, color: T.goldText, fontFamily: T.bold, fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase' }}>{c.label}</span>
        {c.kind === 'range' && c.costly && (look[c.key] as number) > 0 ? <span style={{ color: '#E2705A', fontFamily: T.bold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}>Slower on big decks</span> : null}
        {c.kind === 'range' ? <span style={{ color: changed ? T.ivory : T.muted, fontFamily: T.bold, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt(c, look[c.key] as number)}</span> : null}
        {changed ? (
          <button type="button" title={`Put ${c.label} back`} onClick={() => set(DEFAULT_LOOK[c.key])} style={{ all: 'unset', cursor: 'pointer', display: 'flex' }}>
            <Glyph d='<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.2 4.2v4.6h4.6"/>' size={13} color={T.muted} />
          </button>
        ) : null}
      </div>
      {c.kind === 'range' ? (
        <input type="range" className="rk-range" aria-label={c.label} min={c.min} max={c.max} step={c.step} value={look[c.key] as number} onChange={(e) => set(+e.target.value)} />
      ) : c.kind === 'choice' ? (
        <div role="radiogroup" aria-label={c.label} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {c.options.map((o) => <Seg key={o.value} label={o.label} active={look[c.key] === o.value} onPress={() => { playSfx('buttonTap', { volume: 0.5 }); set(o.value); }} />)}
        </div>
      ) : (
        <div role="radiogroup" aria-label={c.label} style={{ display: 'flex', gap: 4 }}>
          <Seg label="Off" active={!look.loop} onPress={() => set(false)} />
          <Seg label="On" active={look.loop} onPress={() => set(true)} />
        </div>
      )}
      <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px' }}>{c.help}</span>
    </div>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} style={{ all: 'unset', cursor: 'pointer' }}>
      <div style={{ clipPath: chamferClip(5), background: active ? T.red : hover ? T.goldBright : 'rgba(218,162,73,0.32)', padding: 1 }}>
        <div style={{ clipPath: chamferClip(4.6), background: active ? T.red : hover ? T.panelLit : T.ink, height: 28, padding: '0 11px', display: 'flex', alignItems: 'center', color: active || hover ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 11.5, letterSpacing: 0.7, textTransform: 'uppercase' }}>{label}</div>
      </div>
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <span style={{ color: T.goldText, fontFamily: T.bold, fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase' }}>{children}</span>;
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
      () => setNote({ text: 'Code copied. Paste it to whoever should have this look.' }),
      () => setNote({ text: text }),
    );
    playSfx('buttonTap');
  };
  const use = () => {
    const l = decodeLook(code);
    if (!l) { setNote({ text: 'That is not a table code. Codes start with RK1: and come from Copy code.', bad: true }); playSfx('cardDisable', { volume: 0.5 }); return; }
    onChange(l);
    setCode('');
    setNote({ text: 'Look applied. Save it below to keep it.' });
    playSfx('cardSelect', { volume: 0.6 });
  };
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionTitle>Ready made</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {BUILTIN_LOOKS.map((b) => <LookRow key={b.name} name={b.name} active={same(b.look)} onPress={() => { playSfx('buttonTap', { volume: 0.6 }); onChange(b.look); }} />)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionTitle>Your looks</SectionTitle>
        {saved.length === 0 ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12.5 }}>Nothing saved yet. Name the look you have now to keep it.</span> : null}
        {saved.map((s) => (
          <div key={s.name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ flex: 1 }}><LookRow name={s.name} active={same(s.look)} onPress={() => { playSfx('buttonTap', { volume: 0.6 }); onChange(s.look); }} /></div>
            <TButton title={`Delete ${s.name}`} h={32} onPress={() => { playSfx('tokenRemove', { volume: 0.6 }); store(saved.filter((x) => x.name !== s.name)); }} icon={<Glyph d='<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>' size={14} color={T.muted} />} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <Field value={name} onChange={setName} placeholder="Name this look" onEnter={save} max={40} />
          <TButton label="Save" h={34} disabled={!name.trim()} onPress={save} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionTitle>Share</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px' }}>Copy a code for the look you have now, or paste one someone sent you.</span>
        <TButton label="Copy code" primary h={34} onPress={copy} />
        <div style={{ display: 'flex', gap: 6 }}>
          <Field value={code} onChange={(v) => { setCode(v); setNote(null); }} placeholder="Paste a code (RK1:...)" onEnter={use} max={2000} />
          <TButton label="Use" h={34} disabled={!code.trim()} onPress={use} />
        </div>
        {note ? <span role="status" style={{ color: note.bad ? '#E2705A' : T.goldText, fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px', wordBreak: 'break-all' }}>{note.text}</span> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionTitle>The table</SectionTitle>
        <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px' }}>{boardCount ? `${boardCount} card${boardCount === 1 ? '' : 's'} on the table. Clearing puts the copies away; the cards stay in your decks.` : 'No cards on the table. Click the centre card of your hand to take a copy.'}</span>
        <TButton label="Clear the table" h={34} disabled={!boardCount} onPress={() => { playSfx('tokenRemove'); onClearTable(); }} />
      </div>
    </>
  );
}

function LookRow({ name, active, onPress }: { name: string; active: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} aria-pressed={active} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div style={{ clipPath: chamferClip(6), background: active ? T.red : hover ? T.goldBright : 'rgba(218,162,73,0.3)', padding: 1 }}>
        <div style={{ clipPath: chamferClip(5.6), background: active ? 'rgba(200,27,24,0.25)' : hover ? T.panelLit : T.ink, height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', color: active || hover ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 12, letterSpacing: 0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
      </div>
    </button>
  );
}

function Field({ value, onChange, placeholder, onEnter, max }: { value: string; onChange: (v: string) => void; placeholder: string; onEnter: () => void; max: number }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ flex: 1, clipPath: chamferClip(6), background: focus ? T.goldBright : 'rgba(218,162,73,0.3)', padding: 1 }}>
      <input value={value} maxLength={max} placeholder={placeholder} aria-label={placeholder} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); e.stopPropagation(); }}
        style={{ all: 'unset', boxSizing: 'border-box', width: '100%', height: 32, padding: '0 11px', clipPath: chamferClip(5.6), background: T.ink, color: T.ivory, fontFamily: T.medium, fontSize: 13, caretColor: T.red }} />
    </div>
  );
}
