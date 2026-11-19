/**
 * The desktop table's dice bar (v0.47.0), rebuilt for 3D dice: pick a handful (or the Hope and Fear pair), set a
 * modifier, roll, and the dice are thrown up across the felt; when the last one comes to rest the total and the
 * verdict appear over the table. A trait clicked on the sheet throws the pair with its modifier, and the presets
 * (nine here, the first three shared with the phone) deal their dice and throw them.
 *
 * Same rules and sounds as the phone's tray (lib/dice-pool decides the verdict); only the dice are new.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

export function RollDock({ left, width, bottom, dice, handleRef, presets, onClose, onResult, onHeight }: {
  left: number;
  width: number;
  bottom: number;
  dice: React.RefObject<TableDiceHandle | null>;
  handleRef: { current: DiceTrayHandle | null };
  presets: Omit<Parameters<typeof DicePresetSlots>[0], 'belt'>;
  onClose: () => void;
  onResult: (r: RollResult | null) => void;
  /** The bar's height, so the dice can bounce off it. */
  onHeight: (h: number) => void;
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
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => { ro.disconnect(); onHeight(0); };
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
    onResult(null);
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
  return (
    <div ref={dockRef} style={{ position: 'absolute', left, width, bottom, zIndex: 30 }} onPointerDown={(e) => e.stopPropagation()}>
      <Chamfer c={12} fill="rgba(11,14,19,0.95)" line={T.goldSoft} inner={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} role="group" aria-label="Add a die">
            {ADD.map((t) => <AddDie key={t} type={t} onPress={() => add(t)} />)}
            <AddDie type="duality" onPress={() => add('duality')} />
          </div>
          <Divider />
          <div style={{ flex: 1, minWidth: 150, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }} aria-label="Dice to roll">
            {groups.length === 0 ? <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 13, lineHeight: '17px' }}>Pick dice, or click a trait on the sheet.</span> : null}
            {groups.map((g) => (
              <button key={g.key} type="button" onClick={() => remove(g.ids[g.ids.length - 1])} title={`Remove a ${g.label}`} style={{ all: 'unset', cursor: 'pointer' }}>
                <div style={{ clipPath: chamferClip(6), background: 'rgba(218,162,73,0.3)', padding: 1 }}>
                  <div style={{ clipPath: chamferClip(5.6), background: T.panelLit, height: 30, display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px' }}>
                    <span style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: g.key === 'duality' ? `linear-gradient(90deg, ${HOPE_GOLD} 50%, ${FEAR_PURPLE} 50%)` : g.color }} />
                    <span style={{ color: T.ivory, fontFamily: T.bold, fontSize: 12, letterSpacing: 0.6, whiteSpace: 'nowrap' }}>{g.ids.length > 1 ? `${g.ids.length} × ` : ''}{g.label}</span>
                    <Glyph d='<path d="M7 7l10 10M17 7 7 17"/>' size={12} color={T.muted} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }} title="Click a preset to roll it. Hold one to save or edit it.">
                <span style={{ color: T.goldText, fontFamily: T.bold, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase' }}>Presets</span>
                <span style={{ color: T.muted, fontFamily: T.medium, fontSize: 11, lineHeight: '14px' }}>Click to roll, hold to edit</span>
              </div>
              {/* The sheet's preset slots (play on click, hold to edit), laid out as a belt. */}
              <View style={{ position: 'relative', height: 68, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <DicePresetSlots {...presets} belt={{ left: 0, top: 0, gap: SLOT_GAP }} />
              </View>
            </div>
          </div>
          <Divider />
          {/* The modifier over the throw: what the roll adds, then the roll itself. */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} role="group" aria-label="Modifier">
            <TButton title="Lower the modifier" onPress={() => bump(-1)} icon={<Glyph d='<path d="M6 12h12"/>' size={14} />} />
            <button type="button" onClick={() => { playSfx('numpadPress', { volume: 0.5 }); setMod({ label: null, value: 0 }); }} title="Reset the modifier" style={{ all: 'unset', cursor: 'pointer', minWidth: 54, textAlign: 'center' }}>
              <div style={{ color: mod.value ? T.ivory : T.muted, fontFamily: T.display, fontSize: 18, lineHeight: '20px' }}>{mod.value > 0 ? '+' : ''}{mod.value}</div>
              <div style={{ color: T.muted, fontFamily: T.bold, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.label ?? 'Modifier'}</div>
            </button>
            <TButton title="Raise the modifier" onPress={() => bump(1)} icon={<Glyph d='<path d="M6 12h12M12 6v12"/>' size={14} />} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <TButton label={rolling ? 'Rolling' : 'Roll'} primary h={40} disabled={!pool.length || rolling} onPress={() => void throwPool(pool, mod)} />
          <TButton label="Clear" h={40} disabled={!pool.length || rolling} onPress={clear} />
          <TButton title="Close the dice bar" h={40} onPress={onClose} icon={<Glyph d='<path d="M6 6l12 12M18 6 6 18"/>' size={16} />} />
          </div>
          </div>
        </div>
      </Chamfer>
    </div>
  );
}

function Divider() {
  return <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(218,162,73,0.22)' }} />;
}

/** A die to add: its shape's colour as a small cut gem, and its name. */
function AddDie({ type, onPress }: { type: DieType | 'duality'; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  const pair = type === 'duality';
  return (
    <button type="button" onClick={onPress} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} title={pair ? 'Add the Hope and Fear dice' : `Add a ${type}`} aria-label={pair ? 'Add the Hope and Fear dice' : `Add a ${type}`} style={{ all: 'unset', cursor: 'pointer' }}>
      <div style={{ clipPath: chamferClip(7), background: hover ? T.goldBright : 'rgba(218,162,73,0.36)', padding: 1.2, transform: hover ? 'translateY(-2px)' : 'none', transition: `transform 140ms ${T.ease}` }}>
        <div style={{ clipPath: chamferClip(6.5), background: hover ? T.panelLit : T.ink, width: pair ? 88 : 42, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          {pair ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ width: 13, height: 13, transform: 'rotate(45deg)', background: HOPE_GOLD }} />
              <span style={{ width: 13, height: 13, transform: 'rotate(45deg)', background: FEAR_PURPLE, outline: '1px solid #7b5aa0' }} />
            </div>
          ) : (
            <span style={{ width: 13, height: 13, transform: 'rotate(45deg)', background: DIE_COLOR[type] }} />
          )}
          <span style={{ color: hover ? T.ivory : T.goldText, fontFamily: T.bold, fontSize: 11, letterSpacing: 0.6 }}>{pair ? 'Hope & Fear' : type}</span>
        </div>
      </div>
    </button>
  );
}

/** The total over the table once the dice are down: big, coloured by the verdict, gone on the next change. */
export function RollReadout({ result, x, y }: { result: RollResult; x: number; y: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);
  const crit = result.verdict === 'critical';
  const color = crit || result.verdict === 'hope' ? T.goldBright : result.verdict === 'fear' ? '#C9A6F0' : T.ivory;
  const word = crit ? 'Critical success' : result.verdict === 'hope' ? 'With Hope' : result.verdict === 'fear' ? 'With Fear' : null;
  const parts = result.dice.filter((d) => d.value != null).map((d) => `${d.side === 'hope' ? 'Hope' : d.side === 'fear' ? 'Fear' : d.type} ${d.value}`);
  if (result.mod) parts.push(`${result.label ? `${result.label} ` : ''}${result.mod > 0 ? '+' : ''}${result.mod}`);
  return (
    <div aria-live="polite" style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, 0) scale(${shown ? 1 : 0.7})`, opacity: shown ? 1 : 0, transition: `transform 320ms ${T.ease}, opacity 200ms`, zIndex: 15, pointerEvents: 'none' }}>
      <Chamfer c={12} fill="rgba(9,11,16,0.88)" line={crit ? T.goldBright : result.verdict === 'fear' ? 'rgba(201,166,240,0.55)' : T.goldSoft} inner={{ padding: '10px 26px 12px', textAlign: 'center', minWidth: 150 }}>
        <div style={{ color, fontFamily: T.display, fontSize: 60, lineHeight: '62px', textShadow: crit ? '0 0 26px rgba(224,181,99,0.65)' : 'none' }}>{result.total}</div>
        {word ? <div style={{ color, fontFamily: T.bold, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>{word}</div> : null}
        <div style={{ color: T.muted, fontFamily: T.medium, fontSize: 12, marginTop: 5, whiteSpace: 'nowrap' }}>{parts.join(' · ')}</div>
      </Chamfer>
    </div>
  );
}
