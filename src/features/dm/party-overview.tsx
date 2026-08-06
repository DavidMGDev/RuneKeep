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
import { FlatList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Polygon } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
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
import { StatGlyph } from './stat-glyphs';
import { StatRadialProvider } from './stat-radial';
import { DmPress } from './dm-ui';

const KEY_LABEL: Record<VitalKey, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor' };

/** Four to a row, and as many rows as the party needs. No cap: a party is however big it is. */
const PER_ROW = 4;

/**
 * The party at a glance (v0.36, owner).
 *
 * A list is the right shape for running one character and the wrong shape for reading a party: with
 * six members you cannot see the sixth without scrolling past the first five, and finding a
 * particular one means scrolling for their name. One tile at the top solves both. Every member is a
 * portrait with their current hit points under it, so it doubles as a status board, and tapping one
 * jumps the list to them rather than making you hunt.
 *
 * A HOLD goes straight to their modifiers, which is the tool the DM reaches for most and was two
 * taps and a scroll away.
 */
function PartyRoster({
  ids,
  files,
  party,
  onFocus,
  onModifiers,
}: {
  ids: string[];
  files: Record<string, CharacterFile>;
  party: Party;
  onFocus: (charId: string) => void;
  onModifiers: (charId: string) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <ChamferBox chamfer={11} fill="rgba(14,17,22,0.92)" stroke={DmRune.line} strokeWidth={1.3} style={{ paddingHorizontal: 12, paddingVertical: 12, gap: 10, marginBottom: 12 }}>
      <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {party.name} · {ids.length}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
        {ids.map((charId) => {
          const f = files[charId];
          const hp = party.global[charId]?.hp ?? 0;
          const max = memberMaxes(f).maxHp;
          const downed = hp <= 0;
          return (
            <DmPress
              key={charId}
              onPress={() => onFocus(charId)}
              onLongPress={() => onModifiers(charId)}
              delayLongPress={360}
              accessibilityRole="button"
              accessibilityLabel={`${f.name}, ${hp} of ${max} hit points. Tap to find them, hold for their modifiers.`}
              style={{ width: `${100 / PER_ROW}%`, alignItems: 'center', gap: 4 }}>
              <ChamferBox chamfer={6} fill={DmRune.ink} stroke={downed ? DmRune.muted : DmRune.accentDim} strokeWidth={1.2} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {f.portraitUri ? (
                  <View style={downed ? { filter: [{ grayscale: 1 }] } : undefined}>
                    <Image source={f.portraitUri} style={{ width: 52, height: 52 }} contentFit="cover" />
                  </View>
                ) : (
                  <Svg width={22} height={22} viewBox="0 0 26 26"><Polygon points="13,2 23,12 23,14 13,24 3,14 3,12" fill="none" stroke={downed ? DmRune.muted : DmRune.accentDim} strokeWidth={1.6} /></Svg>
                )}
                {downed ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(11,14,19,0.55)' }} /> : null}
              </ChamferBox>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <StatGlyph kind="hp" color={downed ? DmRune.muted : DmRune.red} size={13} filled={!downed} />
                <Text style={{ color: downed ? DmRune.muted : DmRune.ivory, fontSize: DmType.body, fontFamily: Display.black }}>{hp}</Text>
              </View>
              <Text numberOfLines={1} style={{ maxWidth: 78, color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{f.name}</Text>
            </DmPress>
          );
        })}
      </View>
    </ChamferBox>
  );
}

export function PartyOverviewScreen() {
  const router = useRouter();
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const [party, setParty] = useState<Party | null>(null);
  const [files, setFiles] = useState<Record<string, CharacterFile>>({});
  const [keypad, setKeypad] = useState<{ charId: string; key: VitalKey } | null>(null);
  const [globalOpen, setGlobalOpen] = useState(false);
  /** Which member the roster tile last jumped to, and a token that bumps on every jump so tapping
   *  the same portrait twice flashes twice. */
  const [landed, setLanded] = useState<{ id: string; n: number } | null>(null);
  const listRef = useRef<FlatList<string>>(null);

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

  /** Jump the list to a member and flash them, so the tap lands somewhere the DM can see. */
  const focusMember = (charId: string) => {
    const i = party?.memberIds.filter((id) => files[id]).indexOf(charId) ?? -1;
    if (i < 0) return;
    playSfx('buttonTap');
    listRef.current?.scrollToIndex({ index: i, viewPosition: 0, animated: true });
    setLanded((l) => ({ id: charId, n: (l?.n ?? 0) + 1 }));
  };

  if (!party) return <LoadingScreen dm label="Reading the party" />;

  const memberIds = party.memberIds.filter((id) => files[id]);
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
        <DmPress onPress={() => { playSfx('buttonTap'); setGlobalOpen(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Party modifiers, ${globalCount} set`}>
          <PartyEffectsIcon />
        </DmPress>
      }>
      <FlatList
        ref={listRef}
        data={memberIds}
        keyExtractor={(id) => id}
        contentContainerStyle={{ gap: 12, paddingTop: 4, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        // Entries are different heights (an expanded one is much taller), so a jump can miss on the
        // first try. Scrolling to the offset we do know and asking again lands it.
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0, animated: true }), 240);
        }}
        ListHeaderComponent={
          <PartyRoster
            ids={memberIds}
            files={files}
            party={party}
            onFocus={focusMember}
            onModifiers={(charId) => { playSfx('buttonTap'); tools.openModifiers(charId, true); }}
          />
        }
        renderItem={({ item: charId }) => (
          <MemberPanel
            file={files[charId]}
            vitals={party.global[charId] ?? { hp: 0, stress: 0, hope: 0, armor: 0 }}
            editable
            absent={!isPresent(party, charId)}
            flash={landed?.id === charId ? landed.n : undefined}
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
