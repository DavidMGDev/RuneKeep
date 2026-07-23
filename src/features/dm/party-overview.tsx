/**
 * Party overview / Players (v0.15.0, PRD #22-25, #35) — the at-a-glance summary of a party. One of the
 * two surfaces allowed to write the party's GLOBAL vitals (the other is the active encounter). Each
 * member is a MemberPanel; stat pulses write party.global. Persistence is debounced so a fast heartbeat
 * hold doesn't hammer the disk (state stays instant).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { LoadingScreen } from '@/components/loading-screen';
import { NumberKeypad } from '@/features/character-sheet/sheet/number-keypad';
import { type CharacterFile } from '@/lib/character-file';
import { listCharacters } from '@/lib/character-store';
import { memberMaxes } from '@/lib/dm-vitals';
import { applyVitalDelta, isPresent, type Party, setMemberVitals, setVital, type VitalKey } from '@/lib/party';
import { getParty, saveParty } from '@/lib/party-store';
import { MemberPanel } from './member-panel';
import { StatRadialProvider } from './stat-radial';

const KEY_LABEL: Record<VitalKey, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor' };

export function PartyOverviewScreen() {
  const router = useRouter();
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const [party, setParty] = useState<Party | null>(null);
  const [files, setFiles] = useState<Record<string, CharacterFile>>({});
  const [keypad, setKeypad] = useState<{ charId: string; key: VitalKey } | null>(null);

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

  if (!party) return <LoadingScreen label="Reading the party" />;

  const kpFile = keypad ? files[keypad.charId] : undefined;
  const kpMax = kpFile && keypad ? memberMaxes(kpFile)[keypad.key === 'hp' ? 'maxHp' : keypad.key === 'stress' ? 'stressMax' : keypad.key === 'hope' ? 'hopeMax' : 'armorMax'] : 0;

  return (
    <StatRadialProvider>
    <AppScreen title="Players" dm onBack={() => router.back()}>
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
          />
        )}
      />
      {keypad ? (
        <NumberKeypad
          title={`Set ${KEY_LABEL[keypad.key]}`}
          subtitle={`0–${Math.max(0, kpMax)}`}
          min={0}
          max={Math.max(0, kpMax)}
          onSubmit={onSet}
          onClose={() => setKeypad(null)}
        />
      ) : null}
    </AppScreen>
    </StatRadialProvider>
  );
}
