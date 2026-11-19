/**
 * The desktop table's dice bar (v0.47.0), rebuilt for 3D dice: pick a handful (or the Hope and Fear pair), set a
 * modifier, roll, and the dice are thrown up across the felt; when the last one comes to rest the total and the
 * verdict appear over the table. A trait clicked on the sheet throws the pair with its modifier, and the presets
 * (nine here, the first three shared with the phone) deal their dice and throw them.
 *
 * Same rules and sounds as the phone's tray (lib/dice-pool decides the verdict); only the dice are new.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { View } from 'react-native';

import { DIE_COLOR, type DieType, FEAR_PURPLE, HOPE_GOLD } from '../components/card-tokens-data';
import { addDie, dualityVerdict, type PoolDie, poolTotal, removeDie, rollVoice } from '@/lib/dice-pool';
import { diceOf } from '@/lib/dice-presets';
import { playSfx } from '@/lib/sfx';
import type { DiceTrayHandle } from '../sheet/dice-tray';
import { DicePresetSlots } from '../sheet/dice-preset-slots';
import type { TableDiceHandle } from './table-dice';
import { Chamfer, chamferClip, Glyph, T, TButton } from './table-ui';

const ADD: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const MAX_DICE = 20;
let seq = 0;
const nextId = () => `td-${++seq}`;

export interface RollResult { total: number; verdict: 'hope' | 'fear' | 'critical' | null; dice: PoolDie[]; label: string | null; mod: number }

export function RollDock({ left, bottom, dice, handleRef, presets, onClose, onResult, onHeight }: {
  /** The bar's centre, px from the table's left. */
  left: number;
  bottom: number;
  dice: React.RefObject<TableDiceHandle | null>;
  handleRef: { current: DiceTrayHandle | null };
  presets: Omit<Parameters<typeof DicePresetSlots>[0], 'belt'>;
  onClose: () => void;
  onResult: (r: RollResult | null) => void;
  /** The bar's size, so the dice can bounce off it. */
  onHeight: (size: { w: number; h: number }) => void;
}) {
  const [pool, setPool] = useState<PoolDie[]>([]);
  const [mod, setMod] = useState<{ label: string | null; value: number }>({ label: null, value: 0 });
  const [rolling, setRolling] = useState(false);
  const poolRef = useRef(pool);
  poolRef.current = pool;
  const rollingRef = useRef(false);
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => { ro.disconnect(); onHeight({ w: 0, h: 0 }); };
  }, [onHeight]);

  const throwPool = useCallback(async (list: PoolDie[], m: { label: string | null; value: number }) => {
    if (!list.length || rollingRef.current || !dice.current) return;
    rollingRef.current = true;
    setRolling(true);
    onResult(null);
    const el = dockRef.current;
    const felt = el?.parentElement?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    const from = felt && r ? { x: r.left - felt.left + r.width / 2, y: r.top - felt.top - 48 } : { x: 400, y: 300 };
    const landed = await dice.current.roll(list, from);
    rollingRef.current = false;
    setRolling(false);
    setPool(landed);
    const total = poolTotal(landed, m.value);
    const verdict = dualityVerdict(landed);
    const voice = rollVoice(landed);
    playSfx(
      voice === 'critical' || voice === 'muted' ? 'gainGoldenHp' : voice === 'hope' ? 'gainHope' : voice === 'fear' ? 'loseHope' : voice === 'bad' ? 'cardDisable' : 'transitionIconFilled',
      voice === 'muted' ? { cents: -520 } : voice === 'fear' ? { cents: -200 } : voice === 'bad' ? { cents: -260 } : undefined,
    );
    onResult({ total, verdict, dice: landed, label: m.label, mod: m.value });
  }, [dice, onResult]);

  useImperativeHandle(handleRef, () => ({
    rollDuality: (label: string, value: number) => {
      const pairId = nextId();
      const pair: PoolDie[] = [{ id: nextId(), type: 'd12', value: null, side: 'hope', pairId }, { id: nextId(), type: 'd12', value: null, side: 'fear', pairId }];
      const m = { label, value };
      setPool(pair);
      setMod(m);
      void throwPool(pair, m);
    },
    playPreset: (types: DieType[], label: string, value: number) => {
      let built: PoolDie[] = [];
      for (const t of types) built = addDie(built, t, () => nextId());
      const m = { label, value };
      setPool(built);
      setMod(m);
      void throwPool(built, m);
    },
    currentDice: () => diceOf(poolRef.current),
  }), [throwPool]);
  // The sheet's handle is ours only while the bar is up.
  useEffect(() => () => { handleRef.current = null; }, [handleRef]);

  const add = (t: DieType | 'duality') => {
    if (poolRef.current.length >= MAX_DICE) { playSfx('cardDisable', { volume: 0.5 }); return; }
    playSfx('placeToken', { cents: 140, volume: 0.7 });
    setPool((p) => addDie(p.map((d) => ({ ...d, value: null })), t, () => nextId()));
  };
  const remove = (id: string) => { playSfx('tokenRemove', { volume: 0.6 }); setPool((p) => removeDie(p, id)); };
  const clear = () => { playSfx('tokenRemove'); setPool([]); setMod({ label: null, value: 0 }); onResult(null); dice.current?.clearRoll(); };
  const bump = (n: number) => { playSfx('numpadPress', { volume: 0.5 }); setMod((m) => ({ label: null, value: Math.max(-30, Math.min(30, m.value + n)) })); };

  // Group the pool by kind for the chips: "2 × d6".
  const groups: { key: string; label: string; color: string; ids: string[] }[] = [];
  for (const d of pool) {
    const k = d.pairId ? 'duality' : d.type;
    if (k === 'duality' && d.side === 'fear') continue;
    const g = groups.find((x) => x.key === k);
    const id = d.pairId ? d.id : d.id;
    if (g) g.ids.push(id);
    else groups.push({ key: k, label: k === 'duality' ? 'Hope & Fear' : d.type, color: k === 'duality' ? HOPE_GOLD : DIE_COLOR[d.type], ids: [id] });
  }

  const SLOT_GAP = 20;
  const [presetsOpen, setPresetsOpen] = useState(false);
  return (
    <div ref={dockRef} style={{ position: 'absolute', left, bottom, transform: 'translateX(-50%)', zIndex: 30 }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      {presetsOpen ? (
        // The presets open above the bar on demand, so the bar itself stays one slim row (owner, v0.47.1).
        <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 }}>
          <Chamfer c={10} fill="rgba(11,14,19,0.96)" line={T.goldSoft} inner={{ padding: '10px 14px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <View style={{ position: 'relative', height: 68, width: 9 * (48 + SLOT_GAP) - SLOT_GAP }}>
              <DicePresetSlots {...presets} belt={{ left: 0, top: 0, gap: SLOT_GAP }} />
            </View>
            <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 11.5, textAlign: 'center' }}>Click a preset to roll it. Hold one to save or edit it.</span>
          </Chamfer>
        </div>
      ) : null}
      <Chamfer c={10} fill="rgba(11,14,19,0.95)" line={T.goldSoft} inner={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Add a die">
          {ADD.map((t) => <AddDie key={t} type={t} onPress={() => add(t)} />)}
          <AddDie type="duality" onPress={() => add('duality')} />
        </div>
        <Divider />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 96, maxWidth: 230, overflow: 'hidden' }} aria-label="Dice to roll">
          {groups.length === 0 ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 12, whiteSpace: 'nowrap' }}>No dice yet</span> : null}
          {groups.map((g) => (
            <button key={g.key} type="button" onClick={() => remove(g.ids[g.ids.length - 1])} title={`Remove a ${g.label}`} aria-label={`Remove a ${g.label}`} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0 }}>
              <div style={{ clipPath: chamferClip(5), background: 'rgba(218,162,73,0.3)', padding: 1 }}>
                <div style={{ clipPath: chamferClip(4.6), background: T.panelLit, height: 26, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px' }}>
                  <span style={{ width: 8, height: 8, transform: 'rotate(45deg)', background: g.key === 'duality' ? `linear-gradient(90deg, ${HOPE_GOLD} 50%, ${FEAR_PURPLE} 50%)` : g.color }} />
                  <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 11.5, whiteSpace: 'nowrap' }}>{g.ids.length > 1 ? `${g.ids.length}×` : ''}{g.key === 'duality' ? 'H&F' : g.label}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
        <Divider />
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} role="group" aria-label="Modifier">
          <TButton title="Lower the modifier" h={30} onPress={() => bump(-1)} icon={<Glyph d='<path d="M6 12h12"/>' size={13} />} />
          <button type="button" onClick={() => { playSfx('numpadPress', { volume: 0.5 }); setMod({ label: null, value: 0 }); }} title={mod.label ? `${mod.label}. Click to reset` : 'Modifier. Click to reset'} aria-label="Reset the modifier" style={{ all: 'unset', cursor: 'pointer', minWidth: 38, textAlign: 'center', color: mod.value ? T.ivory : T.muted, fontFamily: T.display, fontSize: 16 }}>{mod.value > 0 ? '+' : ''}{mod.value}</button>
          <TButton title="Raise the modifier" h={30} onPress={() => bump(1)} icon={<Glyph d='<path d="M6 12h12M12 6v12"/>' size={13} />} />
        </div>
        <Divider />
        <TButton label="Presets" h={34} active={presetsOpen} onPress={() => { playSfx(presetsOpen ? 'floatMenuClose' : 'floatMenuOpen'); setPresetsOpen((o) => !o); }} />
        <TButton label={rolling ? 'Rolling' : 'Roll'} primary h={34} disabled={!pool.length || rolling} onPress={() => void throwPool(pool, mod)} />
        <TButton title="Clear the dice" h={34} disabled={!pool.length || rolling} onPress={clear} icon={<Glyph d='<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>' size={14} />} />
        <TButton title="Close the dice bar" h={34} onPress={onClose} icon={<Glyph d='<path d="M6 6l12 12M18 6 6 18"/>' size={14} />} />
      </Chamfer>
    </div>
  );
}

function Divider() {
  return <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(218,162,73,0.22)' }} />;
}

/** A die to add: its colour as a small cut gem over its name. */
function AddDie({ type, onPress }: { type: DieType | 'duality'; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  const pair = type === 'duality';
  const label = pair ? 'Add the Hope and Fear dice' : `Add a ${type}`;
  return (
    <button type="button" onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} title={label} aria-label={label} style={{ all: 'unset', cursor: 'pointer' }}>
      <div style={{ clipPath: chamferClip(6), background: hover ? T.goldBright : 'rgba(218,162,73,0.32)', padding: 1 }}>
        <div style={{ clipPath: chamferClip(5.6), background: hover ? T.panelLit : T.ink, width: pair ? 44 : 34, height: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          {pair ? (
            <div style={{ display: 'flex', gap: 3 }}>
              <span style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: HOPE_GOLD }} />
              <span style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: FEAR_PURPLE, outline: '1px solid #7b5aa0' }} />
            </div>
          ) : (
            <span style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: DIE_COLOR[type] }} />
          )}
          <span style={{ color: hover ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 10, letterSpacing: 0.3 }}>{pair ? 'H&F' : type}</span>
        </div>
      </div>
    </button>
  );
}

/**
 * What the throw came to, as a pop-up on the sheet's port (owner, v0.47.1): never under the dice, and it stays until
 * you accept it. A die rolled again with a right click updates it in place. Enter or Escape accepts too.
 */
export function RollPopup({ result, box, onAccept }: { result: RollResult; box: { left: number; top: number; width: number; height: number }; onAccept: () => void }) {
  const [shown, setShown] = useState(false);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); ok.current?.focus({ preventScroll: true }); return () => cancelAnimationFrame(id); }, []);
  const crit = result.verdict === 'critical';
  const color = crit || result.verdict === 'hope' ? T.goldBright : result.verdict === 'fear' ? '#C9A6F0' : T.ivory;
  const word = crit ? 'Critical success' : result.verdict === 'hope' ? 'With Hope' : result.verdict === 'fear' ? 'With Fear' : 'Total';
  const parts = result.dice.filter((d) => d.value != null).map((d) => `${d.side === 'hope' ? 'Hope' : d.side === 'fear' ? 'Fear' : d.type} ${d.value}`);
  if (result.mod) parts.push(`${result.label ? `${result.label} ` : ''}${result.mod > 0 ? '+' : ''}${result.mod}`);
  const W = Math.min(300, box.width - 48);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="dialog" aria-label={`Rolled ${result.total}, ${word}`} aria-live="polite"
      onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onAccept(); } }}
      style={{ position: 'fixed', left: box.left + (box.width - W) / 2, top: box.top + box.height * 0.34, width: W, zIndex: 1150, transform: `translateY(${shown ? 0 : 12}px) scale(${shown ? 1 : 0.94})`, opacity: shown ? 1 : 0, transition: `transform 260ms ${T.ease}, opacity 180ms`, filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.6))' }}>
      <Chamfer c={14} fill="rgba(11,14,19,0.97)" line={crit ? T.goldBright : result.verdict === 'fear' ? 'rgba(201,166,240,0.6)' : T.gold} width={1.4} inner={{ padding: '16px 18px 14px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ color, fontFamily: T.bold, fontSize: 12.5, letterSpacing: 2, textTransform: 'uppercase' }}>{word}</div>
        <div style={{ color, fontFamily: T.display, fontSize: 64, lineHeight: '66px', textShadow: crit ? '0 0 24px rgba(224,181,99,0.6)' : 'none' }}>{result.total}</div>
        <div style={{ color: T.muted, fontFamily: T.medium, fontSize: 12.5, lineHeight: '17px', marginBottom: 8 }}>{parts.join(' · ')}</div>
        <button ref={ok} type="button" onClick={onAccept} className="rk-ok" style={{ all: 'unset', cursor: 'pointer', alignSelf: 'stretch' }}>
          <Chamfer c={7} line={T.red} fill={T.red} style={{ height: 36 }} inner={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase' }}>OK</span>
          </Chamfer>
        </button>
      </Chamfer>
    </div>,
    document.body,
  );
}
