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
import  {  } from 'react-native-svg';

import { AppScreen, SectionLabel } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { LoadingScreen } from '@/components/loading-screen';
import { showToast } from '@/components/toast';
import { NumberKeypad } from '@/features/character-sheet/sheet/number-keypad';
import { type CharacterFile } from '@/lib/character-file';
import { importCharacter, listCharacters, saveCharacter } from '@/lib/character-store';
import { partyEffectsOf, setPartyEffects } from '@/lib/dm-cards';
import { initialVitals, memberMaxes } from '@/lib/dm-vitals';
import { type CardEffect } from '@/lib/modifiers';
import { addMembers, applyVitalDelta, isPresent, togglePresent, type Party, setGlobalEffects, setMemberVitals, setVital, type VitalKey } from '@/lib/party';
import { getParty, saveParty } from '@/lib/party-store';
import { bonusMaxes, canEditMembers, type Encounter, memberBonus, memberVitals } from '@/lib/session';
import { applyOrder } from '@/lib/encounter-order';
import { playSfx } from '@/lib/sfx';
import { useDmCharacterTools } from './dm-character-tools';
import { AddMemberIcon, PartyEffectsIcon } from './dm-icons';
import { MemberPicker } from './party-editor';
import { DmModifiersPanel } from './dm-modifiers-panel';
import { MemberPanel } from './member-panel';
import { DownedVeil, Portrait } from '@/components/portrait';
import { StatGlyph } from './stat-glyphs';
import { StatRadialProvider } from './stat-radial';
import { DmSide, useDeskApi, useDeskFollow, useDmDesk } from './desk/dm-desk';
import { DmEmpty, DmPress } from './dm-ui';

const KEY_LABEL: Record<VitalKey, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor' };

/** Four to a row, and as many rows as the party needs. No cap: a party is however big it is. */
const PER_ROW = 4;

/** Whose numbers the DM screen's party side shows, where an encounter keeps its own. */
function Numbers({ finished, totals, onPick }: { finished: boolean; totals: boolean; onPick: (totals: boolean) => void }) {
  const options = finished ? ['At the finish', 'Now'] : ['This encounter', 'Campaign'];
  return (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      {options.map((label, i) => {
        const on = totals === (i === 1);
        return (
          <DmPress key={label} onPress={() => { playSfx('buttonTap'); onPick(i === 1); }} hitSlop={8} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}
            style={{ borderBottomWidth: 2, borderBottomColor: on ? DmRune.accent : 'transparent' }}>
            <Text style={{ color: on ? DmRune.ivory : DmRune.accent, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
          </DmPress>
        );
      })}
    </View>
  );
}

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
          const downed = hp <= 0;
          return (
            <DmPress
              key={charId}
              onPress={() => onFocus(charId)}
              onLongPress={() => onModifiers(charId)}
              delayLongPress={360}
              accessibilityRole="button"
              accessibilityLabel={`${f.name}, ${hp} hit points. Tap to find them, hold for their modifiers.`}
              style={{ width: `${100 / PER_ROW}%`, alignItems: 'center', gap: 4 }}>
              {/* The press dim used to uncover four chamfered corners of frame hiding under a square
                  image. Frame and picture are the same shape now, so there is nothing to uncover. */}
              <View style={downed ? { filter: [{ grayscale: 1 }] } : undefined}>
                <Portrait uri={f.portraitUri} size={52} tint={downed ? DmRune.muted : DmRune.accentDim} fill={DmRune.ink} />
                {downed ? <DownedVeil size={52} /> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <StatGlyph kind="hp" color={downed ? DmRune.muted : DmRune.red} size={13} filled={!downed} />
                <Text style={{ color: downed ? DmRune.muted : DmRune.ivory, fontSize: DmType.body, fontFamily: Display.black }}>{hp}</Text>
              </View>
              {/* v0.36.3 (owner): the name SHRINKS to fit rather than truncating. "Leonardo Corral"
                  read as "Leonardo…", which is the one thing a name must never do in a tile whose
                  whole job is telling people apart. */}
              <FitLine style={{ maxWidth: 80, color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' }}>{f.name}</FitLine>
            </DmPress>
          );
        })}
      </View>
    </ChamferBox>
  );
}

/**
 * The encounter on the other side of the DM screen, which lists no members of its own: this list speaks for it. A
 * running fight's numbers are changed through it, so they are logged and held to its maximums.
 */
export interface PartyFight {
  encounter: Encounter;
  move: (charId: string, key: VitalKey, delta: number) => void;
  set: (charId: string, key: VitalKey) => void;
}

export function PartyOverviewScreen({ partyId: given, fight }: { /** The DM screen's port says which. */ partyId?: string; fight?: PartyFight }) {
  const router = useRouter();
  const desk = useDmDesk();
  const params = useLocalSearchParams<{ partyId: string }>();
  const partyId = given ?? params.partyId;
  const [party, setParty] = useState<Party | null>(null);
  const [files, setFiles] = useState<Record<string, CharacterFile>>({});
  const [rosterRead, setRosterRead] = useState(false);
  const [keypad, setKeypad] = useState<{ charId: string; key: VitalKey } | null>(null);
  const [globalOpen, setGlobalOpen] = useState(false);
  /** v0.39.0 (owner): the party sheet adds and imports characters, the way the party editor does. */
  const [picking, setPicking] = useState(false);
  /** Which member the roster tile last jumped to, and a token that bumps on every jump so tapping
   *  the same portrait twice flashes twice. */
  const [landed, setLanded] = useState<{ id: string; n: number } | null>(null);
  const listRef = useRef<FlatList<string>>(null);

  const onFile = useCallback((next: CharacterFile) => setFiles((f) => ({ ...f, [next.id]: next })), []);
  const tools = useDmCharacterTools(files, onFile);

  // Debounced persistence: the heartbeat can fire many steps/sec; React state updates instantly, the
  // disk write trails the last change by a beat.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = useRef<Party | null>(null);
  // Every change is made to the newest party, which the port beside this one may have written a moment ago.
  const partyRef = useRef(party);
  partyRef.current = party;
  const persist = useCallback((next: Party) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (desk) { waiting.current = null; void saveParty(next); return; }
    waiting.current = next;
    saveTimer.current = setTimeout(() => { waiting.current = null; void saveParty(next); }, 220);
  }, [desk]);
  const commit = useCallback((next: Party) => { partyRef.current = next; setParty(next); persist(next); }, [persist]);
  // Leaving writes what is waiting: a change made a moment before Back (or a press of a die) is not lost.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); if (waiting.current) void saveParty(waiting.current); }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([getParty(partyId), listCharacters()]).then(([p, all]) => {
      if (!live) return;
      setParty(p);
      setFiles(Object.fromEntries(all.map((f) => [f.id, f])));
      setRosterRead(true);
    });
    return () => { live = false; };
  }, [partyId]);

  useDeskFollow(() => Promise.all([getParty(partyId), listCharacters()]), ([p, all]) => {
    if (p) { partyRef.current = p; setParty(p); }
    setFiles(Object.fromEntries(all.map((f) => [f.id, f])));
  });

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
    const p = partyRef.current, f = files[charId];
    if (p && f) commit(setMemberVitals(p, charId, applyVitalDelta(p.global[charId], key, delta, memberMaxes(f))));
  }, [files, commit]);

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

  /**
   * Add characters, and import one (v0.39.0, owner).
   *
   * The same `MemberPicker` the party editor opens, so the two doors cannot drift apart. Everything a
   * new member needs beyond membership is their starting vitals, which is what `initialVitals` is for;
   * the effect above then hands them the party's own modifier card on the next render, so someone who
   * joins mid-storm is caught by it like everybody else.
   */
  const addSelected = useCallback((ids: string[]) => {
    if (!party) return;
    const entries = ids.map((cid) => files[cid]).filter((f): f is CharacterFile => !!f).map((f) => ({ charId: f.id, vitals: initialVitals(f) }));
    playSfx('selectCharacter');
    commit(addMembers(party, entries));
    setPicking(false);
  }, [party, files, commit]);

  const onImport = useCallback(async () => {
    const imported = await importCharacter();
    if (!imported || !party) return;
    const all = await listCharacters();
    setFiles(Object.fromEntries(all.map((f) => [f.id, f])));
    const f = all.find((c) => c.id === imported.id) ?? imported;
    commit(addMembers(party, [{ charId: f.id, vitals: initialVitals(f) }]));
    setPicking(false);
  }, [party, commit]);

  /** Jump the list to a member and flash them, so the tap lands somewhere the DM can see. */
  const focusMember = (charId: string) => {
    const i = party?.memberIds.filter((id) => files[id]).indexOf(charId) ?? -1;
    if (i < 0) return;
    playSfx('buttonTap');
    listRef.current?.scrollToIndex({ index: i, viewPosition: 0, animated: true });
    setLanded((l) => ({ id: charId, n: (l?.n ?? 0) + 1 }));
  };

  const inFight = (charId: string) => !!fight?.encounter.allies.some((a) => a.kind === 'member' && a.charId === charId);
  /** An encounter with numbers of its own, finished or self-contained. The DM picks whose the list shows. */
  const apart = !!fight && (fight.encounter.status === 'completed' || !fight.encounter.options.globalSync);
  const [totalsIn, setTotalsIn] = useState<string | null>(null);
  const totals = apart && totalsIn === fight?.encounter.id;
  const running = !!fight && canEditMembers(fight.encounter);
  /** Changed through the fight. */
  const viaFight = (charId: string) => (running && !totals && inFight(charId) ? fight : undefined);
  /** The encounter's own numbers, which only a running one may change. */
  const frozen = (charId: string) => apart && !totals && !running && inFight(charId);
  const requestSet = (charId: string, key: VitalKey) => {
    const on = viaFight(charId);
    if (on) on.set(charId, key); else setKeypad({ charId, key });
  };

  useDeskApi('party', party && rosterRead ? {
    id: party.id,
    add: () => setPicking(true),
    partyModifiers: () => setGlobalOpen(true),
    modifiers: (charId) => tools.openModifiers(charId, true),
    cards: tools.openCards,
    presence: (charId) => commit(togglePresent(party, charId)),
    setVital: (charId, key) => requestSet(charId, key),
  } : null);

  if (!party) return <LoadingScreen dm label="Reading the party" />;

  const known = party.memberIds.filter((id) => files[id]);
  // On the DM screen: the fight's order, and whoever is absent after everyone who is here.
  const ordered = applyOrder(known.map((id) => ({ id })), fight?.encounter.order?.allies).map((x) => x.id);
  const memberIds = desk ? [...ordered.filter((id) => isPresent(party, id)), ...ordered.filter((id) => !isPresent(party, id))] : known;
  const firstAbsent = desk ? memberIds.find((id) => !isPresent(party, id)) : undefined;
  const kpFile = keypad ? files[keypad.charId] : undefined;
  const kpMax = kpFile && keypad ? memberMaxes(kpFile)[keypad.key === 'hp' ? 'maxHp' : keypad.key === 'stress' ? 'stressMax' : keypad.key === 'hope' ? 'hopeMax' : 'armorMax'] : 0;
  const globalCount = party.globalEffects?.length ?? 0;

  return (
    <StatRadialProvider>
    <AppScreen
      title="Party sheet"
      dm
      desktopMaxWidth={760}
      bare={!!desk}
      onBack={() => router.back()}
      headerRight={desk ? undefined :
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <DmPress onPress={() => { playSfx('buttonTap'); setPicking(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add characters to this party">
            <AddMemberIcon />
          </DmPress>
          <DmPress onPress={() => { playSfx('buttonTap'); setGlobalOpen(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Party modifiers, ${globalCount} set`}>
            <PartyEffectsIcon />
          </DmPress>
        </View>
      }>
      <FlatList
        ref={listRef}
        data={memberIds}
        keyExtractor={(id) => id}
        contentContainerStyle={{ gap: desk ? 8 : 12, paddingTop: desk ? 0 : 4, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        // Entries are different heights (an expanded one is much taller), so a jump can miss on the
        // first try. Scrolling to the offset we do know and asking again lands it.
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0, animated: true }), 240);
        }}
        ListHeaderComponent={desk ? (
          // The roster would say the list twice. What is worth a line here is whose numbers these are, when in doubt.
          // Otherwise who is here, which stands level with the other side's heading.
          apart ? <Numbers finished={fight!.encounter.status === 'completed'} totals={totals} onPick={(t) => setTotalsIn(t ? fight!.encounter.id : null)} />
            : memberIds[0] && memberIds[0] !== firstAbsent ? <SectionLabel dm>Present</SectionLabel> : null
        ) : (
          <PartyRoster
            ids={memberIds}
            files={files}
            party={party}
            onFocus={focusMember}
            onModifiers={(charId) => { playSfx('buttonTap'); tools.openModifiers(charId, true); }}
          />
        )}
        ListEmptyComponent={desk ? <DmEmpty title="No one in the party yet" body="Add characters from your roster." actionLabel="Add characters" onAction={() => setPicking(true)} /> : null}
        renderItem={({ item: charId }) => (
          <View style={{ gap: 8 }}>
          {charId === firstAbsent ? <SectionLabel dm style={{ marginTop: 14 }}>Absent</SectionLabel> : null}
          <MemberPanel
            file={files[charId]}
            compact={!!desk}
            note={fight && !inFight(charId) && isPresent(party, charId) ? 'Not in this encounter' : undefined}
            onPresence={desk ? () => commit(togglePresent(party, charId)) : undefined}
            vitals={(fight && !totals && inFight(charId) ? memberVitals(fight.encounter, party, charId) : party.global[charId]) ?? { hp: 0, stress: 0, hope: 0, armor: 0 }}
            editable={!frozen(charId)}
            onBlocked={() => showToast(fight?.encounter.status === 'completed' ? 'These are the numbers it finished with. Choose Now to change the party' : 'Start the encounter, or choose Campaign to change the party')}
            maxes={viaFight(charId) || frozen(charId) ? bonusMaxes(memberMaxes(files[charId]), memberBonus(fight!.encounter, party, charId)) : undefined}
            absent={!isPresent(party, charId)}
            flash={landed?.id === charId ? landed.n : undefined}
            onApply={(key, delta) => { const on = viaFight(charId); if (on) on.move(charId, key, delta); else onApply(charId, key, delta); }}
            onRequestSet={(key) => requestSet(charId, key)}
            onModifiers={(edit) => tools.openModifiers(charId, edit)}
            onCards={() => tools.openCards(charId)}
          />
          </View>
        )}
      />
      {keypad ? (
        <NumberKeypad dm
          initial={party.global[keypad.charId]?.[keypad.key]}
          title={`Set ${KEY_LABEL[keypad.key]}`}
          subtitle={`0–${Math.max(0, kpMax)}`}
          min={0}
          max={Math.max(0, kpMax)}
          onSubmit={onSet}
          onClose={() => setKeypad(null)}
        />
      ) : null}
      {picking ? (
        <DmSide onClose={() => setPicking(false)}>
        <MemberPicker
          candidates={Object.values(files).filter((f) => !party.memberIds.includes(f.id))}
          onCancel={() => setPicking(false)}
          onAdd={addSelected}
          onImport={onImport}
        />
        </DmSide>
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
