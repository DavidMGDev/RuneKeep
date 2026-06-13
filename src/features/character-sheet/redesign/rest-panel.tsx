import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { applyRestMoves, movesFor, restMoveById, type RestKind, type RestLogEntry, type RestMove, type RestSelection, tierForLevel } from '@/lib/rest';

import type { Character } from '../character';
import { OverlayShell } from './overlay-shell';

const d4 = () => 1 + Math.floor(Math.random() * 4);

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
 * single move is also fine, owner rule). Dice moves roll 1d4 + tier on confirm; the effects apply to
 * the live resource tracks. "Rest again" lets characters with extra downtime moves take another rest.
 */
export function RestPanel({ character, onApply, onClose }: { character: Character; onApply: (next: Character) => void; onClose: () => void }) {
  const [kind, setKind] = useState<RestKind | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [withParty, setWithParty] = useState(false);
  const [result, setResult] = useState<RestLogEntry[] | null>(null);
  const tier = tierForLevel(character.level);

  const reset = () => {
    setKind(null);
    setPicks([]);
    setResult(null);
  };
  const addPick = (id: string) => setPicks((p) => (p.length < 2 ? [...p, id] : p));
  const removePick = (id: string) =>
    setPicks((p) => {
      const i = p.lastIndexOf(id);
      return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
    });
  const countOf = (id: string) => picks.filter((p) => p === id).length;

  const confirm = () => {
    const sels: RestSelection[] = picks.map((id) => {
      const m = restMoveById(id)!;
      return { moveId: id, roll: m.dice ? d4() : undefined, withParty };
    });
    const res = applyRestMoves(character, tier, sels);
    onApply(res.character);
    setResult(res.log);
  };

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
              <Text style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.bold }}>{e.title}</Text>
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
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, marginTop: 3 }}>About an hour. Choose two moves (1d4 + tier each).</Text>
          </ChamferBox>
        </Pressable>
        <Pressable onPress={() => setKind('long')} accessibilityRole="button" accessibilityLabel="Long rest">
          <ChamferBox chamfer={11} fill="rgba(20,24,31,0.6)" stroke={Rune.goldEdge} strokeWidth={1.3} style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
            <Text style={{ color: Rune.goldText, fontSize: 16, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.8 }}>Long Rest</Text>
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, marginTop: 3 }}>Make camp. Choose two moves (clear everything).</Text>
          </ChamferBox>
        </Pressable>
      </OverlayShell>
    );
  }

  // ---- choose moves ----
  const moves = movesFor(kind);
  const hasPrepare = picks.some((id) => restMoveById(id)?.effect === 'hope');
  return (
    <OverlayShell
      title={kind === 'long' ? 'Long Rest' : 'Short Rest'}
      subtitle={`Choose up to 2 moves · ${picks.length}/2`}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RuneButton label="Back" kind="ghost" height={44} style={{ flex: 1 }} onPress={reset} />
          <RuneButton label={picks.length > 0 ? `Rest · ${picks.length}` : 'Rest'} kind="primary" height={44} style={{ flex: 1.5 }} disabled={picks.length === 0} onPress={confirm} />
        </View>
      }>
      {moves.map((m) => (
        <MoveCard key={m.id} move={m} count={countOf(m.id)} atMax={picks.length >= 2} onAdd={() => addPick(m.id)} onRemove={() => removePick(m.id)} />
      ))}
      {hasPrepare ? (
        <Pressable onPress={() => setWithParty((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: withParty }} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 }}>
          <View style={{ width: 20, height: 20, borderRadius: 3, borderWidth: 1.6, borderColor: withParty ? Rune.red : Rune.muted, backgroundColor: withParty ? Rune.red : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {withParty ? <Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Body.bold }}>✓</Text> : null}
          </View>
          <Text style={{ color: Rune.sheet, fontSize: 12.5, fontFamily: Body.medium }}>Prepare with party (gain 2 Hope)</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular, marginTop: 2 }}>Use + / − to pick up to two (the same move twice is fine). One move is enough — rest light, then Rest again.</Text>
    </OverlayShell>
  );
}
