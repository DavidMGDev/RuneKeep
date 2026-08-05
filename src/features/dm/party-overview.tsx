/**
 * Party overview / Players (v0.15.0, PRD #22-25, #35) — the at-a-glance summary of a party. One of the
 * two surfaces allowed to write the party's GLOBAL vitals (the other is the active encounter). Each
 * member is a MemberPanel; stat pulses write party.global. Persistence is debounced so a fast heartbeat
 * hold doesn't hammer the disk (state stays instant).
 *
 * v0.35 adds the DM's three tools: per-character modifiers (expand an entry, or hold their name),
 * their cards, and the party-wide modifiers behind the button in the top right.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { LoadingScreen } from '@/components/loading-screen';
import { showToast } from '@/components/toast';
import { NumberKeypad } from '@/features/character-sheet/sheet/number-keypad';
import { type CharacterFile } from '@/lib/character-file';
import { listCharacters, saveCharacter } from '@/lib/character-store';
import { partyEffectsOf, setPartyEffects } from '@/lib/dm-cards';
import { memberMaxes } from '@/lib/dm-vitals';
import { type CardEffect } from '@/lib/modifiers';
import { applyVitalDelta, isPresent, type Party, setGlobalEffects, setMemberVitals, setVital, type VitalKey } from '@/lib/party';
import { getParty, saveParty } from '@/lib/party-store';
import { playSfx } from '@/lib/sfx';
import { useDmCharacterTools } from './dm-character-tools';
import { PartyEffectsIcon } from './dm-icons';
import { DmModifiersPanel } from './dm-modifiers-panel';
import { MemberPanel } from './member-panel';
import { StatRadialProvider } from './stat-radial';

const KEY_LABEL: Record<VitalKey, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor' };

export function PartyOverviewScreen() {
  const router = useRouter();
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const [party, setParty] = useState<Party | null>(null);
  const [files, setFiles] = useState<Record<string, CharacterFile>>({});
  const [keypad, setKeypad] = useState<{ charId: string; key: VitalKey } | null>(null);
  const [globalOpen, setGlobalOpen] = useState(false);

  const onFile = useCallback((next: CharacterFile) => setFiles((f) => ({ ...f, [next.id]: next })), []);
  const tools = useDmCharacterTools(files, onFile);

  // Debounced persistence: the heartbeat can fire many steps/sec; React state updates instantly, the
  // disk write trails the last change by a beat.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useCallback((next: Party) => {
    setParty(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveParty(next); }, 220);
  }, []);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([getParty(partyId), listCharacters()]).then(([p, all]) => {
      if (!live) return;
      setParty(p);
      setFiles(Object.fromEntries(all.map((f) => [f.id, f])));
    });
    return () => { live = false; };
  }, [partyId]);

  /**
   * Keep every member's party card in step with the party (v0.35).
   *
   * The card is a MIRROR of `party.globalEffects`, so a member who joined after the effects were set,
   * or whose sheet was replaced by an import, would otherwise be the one person in the party the
   * storm is not affecting. Reconciling on load costs one comparison per member and closes every one
   * of those gaps without a rule per gap.
   */
  useEffect(() => {
    if (!party) return;
    const want = party.globalEffects ?? [];
    for (const id of party.memberIds) {
      const f = files[id];
      if (!f) continue;
      if (JSON.stringify(partyEffectsOf(f, party.id)) === JSON.stringify(want)) continue;
      const next = setPartyEffects(f, party.id, party.name, want);
      setFiles((cur) => ({ ...cur, [id]: next }));
      void saveCharacter(next);
    }
    // `files` is deliberately not a dependency: this writes to it, and re-running on its own writes
    // would be a loop. Party identity and membership are what make it stale.
  }, [party?.id, party?.memberIds, party?.globalEffects, party?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const onApply = useCallback((charId: string, key: VitalKey, delta: number) => {
    setParty((p) => {
      if (!p) return p;
      const f = files[charId];
      if (!f) return p;
      const next = setMemberVitals(p, charId, applyVitalDelta(p.global[charId], key, delta, memberMaxes(f)));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void saveParty(next); }, 220);
      return next;
    });
  }, [files]);

  const onSet = useCallback((n: number) => {
    if (!keypad || !party) return;
    const f = files[keypad.charId];
    if (f) commit(setMemberVitals(party, keypad.charId, setVital(party.global[keypad.charId], keypad.key, n, memberMaxes(f))));
    setKeypad(null);
  }, [keypad, party, files, commit]);

  /** Party-wide modifiers: the party holds them, and every member carries a copy as a read-only card. */
  const saveGlobal = useCallback((effects: CardEffect[]) => {
    if (!party) return;
    commit(setGlobalEffects(party, effects));
    for (const id of party.memberIds) {
      const f = files[id];
      if (!f) continue;
      const next = setPartyEffects(f, party.id, party.name, effects);
      setFiles((cur) => ({ ...cur, [id]: next }));
      void saveCharacter(next);
    }
    showToast(effects.length ? 'Applied to the whole party' : 'Party effects cleared', 'success');
  }, [party, files, commit]);

  if (!party) return <LoadingScreen dm label="Reading the party" />;

  const kpFile = keypad ? files[keypad.charId] : undefined;
  const kpMax = kpFile && keypad ? memberMaxes(kpFile)[keypad.key === 'hp' ? 'maxHp' : keypad.key === 'stress' ? 'stressMax' : keypad.key === 'hope' ? 'hopeMax' : 'armorMax'] : 0;
  const globalCount = party.globalEffects?.length ?? 0;

  return (
    <StatRadialProvider>
    <AppScreen
      title="Party sheet"
      dm
      onBack={() => router.back()}
      headerRight={
        <Pressable onPress={() => { playSfx('buttonTap'); setGlobalOpen(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Party modifiers, ${globalCount} set`}>
          <PartyEffectsIcon />
        </Pressable>
      }>
      <FlatList
        data={party.memberIds.filter((id) => files[id])}
        keyExtractor={(id) => id}
        contentContainerStyle={{ gap: 12, paddingTop: 4, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: charId }) => (
          <MemberPanel
            file={files[charId]}
            vitals={party.global[charId] ?? { hp: 0, stress: 0, hope: 0, armor: 0 }}
            editable
            absent={!isPresent(party, charId)}
            onApply={(key, delta) => onApply(charId, key, delta)}
            onRequestSet={(key) => setKeypad({ charId, key })}
            onModifiers={(edit) => tools.openModifiers(charId, edit)}
            onCards={() => tools.openCards(charId)}
          />
        )}
      />
      {keypad ? (
        <NumberKeypad dm
          title={`Set ${KEY_LABEL[keypad.key]}`}
          subtitle={`0–${Math.max(0, kpMax)}`}
          min={0}
          max={Math.max(0, kpMax)}
          onSubmit={onSet}
          onClose={() => setKeypad(null)}
        />
      ) : null}
      {tools.node}
      {globalOpen ? (
        <DmModifiersPanel
          title={party.name}
          subtitle="Everyone in the party"
          effects={party.globalEffects ?? []}
          onSave={saveGlobal}
          onClose={() => setGlobalOpen(false)}
        />
      ) : null}
    </AppScreen>
    </StatRadialProvider>
  );
}
