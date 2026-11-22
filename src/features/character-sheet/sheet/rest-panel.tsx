import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { HoldToConfirm } from '@/components/hold-to-confirm';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { applyRestMoves, BASE_REST_MOVES, movesFor, restMoveById, type RestKind, type RestLogEntry, type RestMove, type RestSelection, tierForLevel } from '@/lib/rest';
import { useDesktop } from '@/hooks/use-desktop';
import { playSfx } from '@/lib/sfx';

import type { Character } from '../character';
import { NumberKeypad } from './number-keypad';
import { OverlayShell } from './overlay-shell';

function Stepper({ minus, disabled, onPress }: { minus?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={minus ? 'Remove one' : 'Add one'}>
      <ChamferBox chamfer={6} fill="rgba(20,24,31,0.85)" stroke={disabled ? 'rgba(147,142,136,0.3)' : 'rgba(218,162,73,0.5)'} strokeWidth={1.1} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: Rune.sheet, fontSize: 20, fontFamily: Display.bold }}>{minus ? '−' : '+'}</Text>
      </ChamferBox>
    </Pressable>
  );
}

/** A rest move with a ± stepper so the count can be raised AND lowered (#168: you couldn't deselect). */
function MoveCard({ move, count, atMax, onAdd, onRemove }: { move: RestMove; count: number; atMax: boolean; onAdd: () => void; onRemove: () => void }) {
  return (
    <ChamferBox chamfer={9} fill={count > 0 ? 'rgba(200,27,24,0.16)' : 'rgba(20,24,31,0.6)'} stroke={count > 0 ? Rune.red : 'rgba(218,162,73,0.45)'} strokeWidth={1.3} style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.bold }}>{move.title}</Text>
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, marginTop: 2 }}>{move.blurb}</Text>
      </View>
      <Stepper minus disabled={count === 0} onPress={onRemove} />
      <Text style={{ color: count > 0 ? Rune.goldBright : Rune.muted, fontSize: 18, fontFamily: Display.black, width: 22, textAlign: 'center' }}>{count}</Text>
      <Stepper disabled={atMax} onPress={onAdd} />
    </ChamferBox>
  );
}

/**
 * Rest (#165): pick Short or Long, then choose up to two moves (the same move twice is allowed; a
 * single move is also fine, owner rule). Each dice move asks for its 1d4 (+ tier): typed, or left to the app
 * with Roll (v0.50.3), in which case the panel steps aside and the sheet throws them (`onRoll`). The effects
 * apply to the live resource tracks. "Rest again" lets characters with extra downtime moves take another rest.
 */
export function RestPanel({ character, moveLimit = BASE_REST_MOVES, rested, onApply, onRoll, onClose }: {
  character: Character;
  /** Ceiling on downtime moves — 3 for a character keeping an elf's Celestial Trance. */
  moveLimit?: number;
  /** A rest that was rolled, opened on what it came to. */
  rested?: RestLogEntry[] | null;
  onApply: (next: Character) => void;
  /** Some dice are to be rolled: the whole rest, those ones without a `roll` yet. */
  onRoll: (selections: RestSelection[], tier: number) => void;
  onClose: () => void;
}) {
  const limitWord = moveLimit === 2 ? 'two' : moveLimit === 3 ? 'three' : String(moveLimit);
  const desktop = !!useDesktop();
  // Desktop opens on Short rest with Long a tab away (the demo); a phone asks first.
  const [kind, setKind] = useState<RestKind | null>(desktop || rested ? 'short' : null);
  const [picks, setPicks] = useState<string[]>([]);
  const [withParty, setWithParty] = useState(false);
  const [result, setResult] = useState<RestLogEntry[] | null>(rested ?? null);
  // Dice entry (#248 item 6): a queue of pick-indices that roll a die; the player enters each result on
  // the keypad. `rolls` accumulates one number per dice pick, in pick order; null is one to roll.
  const [rolling, setRolling] = useState<{ queue: number[]; rolls: (number | null)[] } | null>(null);
  /** The rest has gone: a second press in the same frame must not take it twice. */
  const sent = useRef(false);
  const tier = tierForLevel(character.level);

  const reset = () => {
    sent.current = false;
    setKind(desktop ? 'short' : null);
    setPicks([]);
    setResult(null);
    setRolling(null);
  };
  const addPick = (id: string) => setPicks((p) => { if (p.length >= moveLimit) return p; playSfx('cardSelect'); return [...p, id]; });
  const removePick = (id: string) =>
    setPicks((p) => {
      const i = p.lastIndexOf(id);
      if (i < 0) return p;
      playSfx('cardDeselect');
      return [...p.slice(0, i), ...p.slice(i + 1)];
    });
  const countOf = (id: string) => picks.filter((p) => p === id).length;

  // Apply once every die has been entered (or immediately when there are no dice picks).
  const finalize = (rolls: (number | null)[]) => {
    if (sent.current) return;
    sent.current = true;
    let k = 0;
    const sels: RestSelection[] = picks.map((id) => {
      const m = restMoveById(id)!;
      return { moveId: id, roll: m.dice ? (rolls[k++] ?? undefined) : undefined, withParty };
    });
    if (rolls.includes(null)) { onRoll(sels, tier); return; }
    const res = applyRestMoves(character, tier, sels);
    onApply(res.character);
    playSfx('restComplete'); // #255
    setResult(res.log);
    setRolling(null);
  };
  // #248 item 6: never roll unasked. If any picked move has a die, ask the player for each result on the
  // keypad (in pick order); otherwise apply straight away. v0.50.3: each keypad also has Roll, and what was
  // left to the app is thrown only once every keypad has been answered.
  const confirm = () => {
    const diceQueue = picks.map((id, i) => ({ id, i })).filter((x) => restMoveById(x.id)?.dice).map((x) => x.i);
    if (diceQueue.length === 0) { finalize([]); return; }
    setRolling({ queue: diceQueue, rolls: [] });
  };
  const submitRoll = (n: number | null) => {
    if (!rolling) return;
    const rolls = [...rolling.rolls, n];
    if (rolls.length >= rolling.queue.length) finalize(rolls);
    else setRolling({ ...rolling, rolls });
  };

  // ---- dice-entry phase ----
  if (rolling) {
    const idx = rolling.rolls.length;
    const move = restMoveById(picks[rolling.queue[idx]]);
    return (
      <NumberKeypad
        // A fresh pad for each die, so nothing half typed carries into the next.
        key={idx}
        title={`Dice ${idx + 1} of ${rolling.queue.length}`}
        subtitle={`${move?.title ?? 'Rest'}: roll, or enter your 1d4`}
        extra={<RuneButton label={`Roll 1d4 + ${tier}`} kind="primary" height={44} onPress={() => { playSfx('buttonTap'); submitRoll(null); }} />}
        min={1}
        max={4}
        onSubmit={submitRoll}
        onClose={() => setRolling(null)}
      />
    );
  }

  // ---- result phase ----
  if (result) {
    return (
      <OverlayShell
        title="Rested"
        subtitle={kind === 'long' ? 'Long rest' : 'Short rest'}
        onClose={onClose}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Rest again" kind="secondary" height={44} style={{ flex: 1 }} onPress={reset} />
            <RuneButton label="Done" kind="primary" height={44} style={{ flex: 1 }} onPress={onClose} />
          </View>
        }>
        {result.length === 0 ? (
          <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular }}>No moves taken.</Text>
        ) : (
          result.map((e, i) => (
            <ChamferBox key={`${e.moveId}-${i}`} chamfer={9} fill="rgba(20,24,31,0.6)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.2} style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.bold }}>{e.title}</Text>
                {e.roll != null ? <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, marginTop: 2 }}>{`1d4 + ${tier}: ${e.roll} + ${tier} = ${e.roll + tier}`}</Text> : null}
              </View>
              <Text style={{ color: e.amount > 0 ? Rune.goldBright : Rune.muted, fontSize: 13, fontFamily: Body.bold }}>{e.note}</Text>
            </ChamferBox>
          ))
        )}
      </OverlayShell>
    );
  }

  // ---- choose kind ----
  if (!kind) {
    return (
      <OverlayShell title="Rest" subtitle="Catch your breath or make camp" onClose={onClose}>
        <Pressable onPress={() => setKind('short')} accessibilityRole="button" accessibilityLabel="Short rest">
          <ChamferBox chamfer={11} fill="rgba(20,24,31,0.6)" stroke={Rune.goldEdge} strokeWidth={1.3} style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
            <Text style={{ color: Rune.goldText, fontSize: 16, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.8 }}>Short Rest</Text>
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, marginTop: 3 }}>About an hour. Choose up to {limitWord} moves (1d4 + tier each).</Text>
          </ChamferBox>
        </Pressable>
        <Pressable onPress={() => setKind('long')} accessibilityRole="button" accessibilityLabel="Long rest">
          <ChamferBox chamfer={11} fill="rgba(20,24,31,0.6)" stroke={Rune.goldEdge} strokeWidth={1.3} style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
            <Text style={{ color: Rune.goldText, fontSize: 16, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.8 }}>Long Rest</Text>
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, marginTop: 3 }}>Make camp. Choose up to {limitWord} moves (clear everything).</Text>
          </ChamferBox>
        </Pressable>
      </OverlayShell>
    );
  }

  // ---- choose moves ----
  const moves = movesFor(kind);
  const hasPrepare = picks.some((id) => restMoveById(id)?.effect === 'hope');
  if (desktop) {
    const kindWord = kind === 'long' ? 'long' : 'short';
    // A click takes the move; another click takes it again while there is room, and once there is not, a click
    // puts it back. So the same move twice is two clicks, as on the phone's + button.
    const clickMove = (id: string) => (picks.length < moveLimit ? addPick(id) : countOf(id) ? setPicks((p) => { playSfx('cardDeselect'); return p.filter((x) => x !== id); }) : undefined);
    return (
      <OverlayShell
        title="Rest"
        subtitle={`Catch your breath or make camp. Choose up to ${limitWord} moves.`}
        onClose={onClose}
        header={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['short', 'long'] as const).map((k) => (
              <Pressable key={k} style={{ flex: 1 }} onPress={() => { if (k === kind) return; playSfx('buttonTap'); setKind(k); setPicks([]); }} accessibilityRole="tab" accessibilityState={{ selected: k === kind }} accessibilityLabel={k === 'short' ? 'Short rest' : 'Long rest'}>
                {({ hovered }: { hovered?: boolean }) => (
                  <ChamferBox chamfer={7} fill={k === kind ? '#1d0f10' : hovered ? '#1A1E26' : Rune.ink} stroke={k === kind ? Rune.red : Rune.goldEdge} strokeWidth={1.3} style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: k === kind ? Rune.ivory : Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>{k} rest</Text>
                  </ChamferBox>
                )}
              </Pressable>
            ))}
          </View>
        }
        footer={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ flex: 1, color: Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.3, textTransform: 'uppercase' }}>{picks.length} of {moveLimit} chosen</Text>
            <View style={{ minWidth: 264 }}>
              {picks.length === 0 ? (
                <RuneButton label={`Take a ${kindWord} rest`} kind="primary" height={40} disabled onPress={reset} />
              ) : (
                <HoldToConfirm label={`Hold to take a ${kindWord} rest`} height={40} chamfer={7} sfx={null} onConfirm={confirm} />
              )}
            </View>
          </View>
        }>
        {moves.map((m) => {
          const n = countOf(m.id);
          return (
            <Pressable key={m.id} onPress={() => clickMove(m.id)} accessibilityRole="button" accessibilityState={{ selected: n > 0 }} accessibilityLabel={n ? `${m.title}, chosen ${n === 1 ? 'once' : 'twice'}` : m.title}>
              {({ hovered }: { hovered?: boolean }) => (
                <ChamferBox chamfer={10} fill={n ? '#1d0f10' : hovered ? '#1A1E26' : Rune.ink} stroke={n ? Rune.red : Rune.goldEdge} strokeWidth={1.3} style={{ paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase' }}>{m.title}</Text>
                    <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.medium, lineHeight: 18, marginTop: 2 }}>{m.blurb}</Text>
                  </View>
                  {n > 1 ? <Text style={{ color: Rune.goldBright, fontSize: 16, fontFamily: Display.black }}>×{n}</Text> : null}
                </ChamferBox>
              )}
            </Pressable>
          );
        })}
        {hasPrepare ? (
          <Pressable onPress={() => setWithParty((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: withParty }} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 4 }}>
            <ChamferBox chamfer={4} fill={withParty ? Rune.red : 'transparent'} stroke={withParty ? Rune.red : Rune.muted} strokeWidth={1.6} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              {withParty ? <Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Body.bold }}>✓</Text> : null}
            </ChamferBox>
            <Text style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.medium }}>Prepare with the party (gain 2 Hope)</Text>
          </Pressable>
        ) : null}
      </OverlayShell>
    );
  }
  return (
    <OverlayShell
      title={kind === 'long' ? 'Long Rest' : 'Short Rest'}
      subtitle={`Choose up to ${moveLimit} moves · ${picks.length}/${moveLimit}`}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RuneButton label="Back" kind="ghost" height={44} style={{ flex: 1 }} onPress={reset} />
          {/* v0.22.0: a rest is irreversible, so it earns the same hold as deleting a single card. */}
          <View style={{ flex: 1.5 }}>
            {picks.length === 0 ? (
              <RuneButton label="Rest" kind="primary" height={44} disabled onPress={reset} />
            ) : (
              <HoldToConfirm label={`Hold to rest · ${picks.length}`} height={44} chamfer={10} sfx={null} onConfirm={confirm} />
            )}
          </View>
        </View>
      }>
      {moves.map((m) => (
        <MoveCard key={m.id} move={m} count={countOf(m.id)} atMax={picks.length >= moveLimit} onAdd={() => addPick(m.id)} onRemove={() => removePick(m.id)} />
      ))}
      {hasPrepare ? (
        <Pressable onPress={() => setWithParty((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: withParty }} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 }}>
          <ChamferBox chamfer={4} fill={withParty ? Rune.red : 'transparent'} stroke={withParty ? Rune.red : Rune.muted} strokeWidth={1.6} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
            {withParty ? <Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Body.bold }}>✓</Text> : null}
          </ChamferBox>
          <Text style={{ color: Rune.sheet, fontSize: 12.5, fontFamily: Body.medium }}>Prepare with party (gain 2 Hope)</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular, marginTop: 2 }}>Use + / − to pick up to {limitWord} (the same move twice is fine). Fewer is fine too: rest light, then Rest again.</Text>
    </OverlayShell>
  );
}
