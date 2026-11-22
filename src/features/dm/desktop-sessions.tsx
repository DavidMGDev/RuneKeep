import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { useScreenFocus } from '@/hooks/use-screen-focus';
import type { Party } from '@/lib/party';
import type { Session } from '@/lib/session';
import { playSfx } from '@/lib/sfx';
import { CAMPAIGN_LIST_W, type EncounterLine, NewRow, SectionHead } from './desktop-campaigns';
import { IdentityBadge, IdentityDropdown, IdentityLines } from './dm-identity-ui';

const STATUS: Record<EncounterLine['status'], string> = { prepared: 'Prepared', active: 'Running', completed: 'Finished' };

/**
 * A campaign's sessions on a desktop window (v0.49.0): the campaigns page's shape, one level down. The sessions in a
 * list under the campaign switcher, the selected one's pane beside it, and the way into its DM screen.
 */
export function DesktopSessions({ parties, campaign, sessions, encounters, busy, onChoose, onOpen, onNew, onNewEncounter, onEdit, onDelete }: {
  parties: Party[];
  campaign: Party;
  sessions: Session[];
  encounters: Record<string, EncounterLine[]>;
  /** A dialog of the page's is up: the keys are its own. */
  busy: boolean;
  onChoose: (p: Party) => void;
  onOpen: (sessionId: string, encounterId?: string) => void;
  onNew: () => void;
  onNewEncounter: (s: Session) => void;
  onEdit: (s: Session) => void;
  onDelete: (ids: string[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;
  // A hold (or Ctrl and a click) marks sessions to delete together, as holding one does on a phone.
  const [marked, setMarked] = useState<string[]>([]);
  const still = marked.filter((id) => sessions.some((s) => s.id === id));
  const mark = (id: string) => { playSfx('cardSelect'); setMarked((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id])); };
  const select = (id: string, adding: boolean) => {
    if (adding || still.length) { mark(id); return; }
    if (id === selected?.id) { onOpen(id); return; }
    playSfx('buttonTap');
    setSelectedId(id);
  };

  const front = useScreenFocus();
  const keys = useRef({ sessions, selected, busy, onOpen });
  keys.current = { sessions, selected, busy, onOpen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (k.busy || !k.selected || !front() || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && t !== document.body && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || t.getAttribute?.('role') === 'button')) return;
      if (e.key === 'Enter') { k.onOpen(k.selected.id); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const to = k.sessions[k.sessions.indexOf(k.selected) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (to) { playSfx('buttonTap'); setSelectedId(to.id); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [front]);

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: CAMPAIGN_LIST_W, paddingRight: 18, borderRightWidth: 1, borderRightColor: 'rgba(218,162,73,0.22)', gap: 14 }}>
        <IdentityDropdown label="Campaign" items={parties} selected={campaign} onSelect={onChoose}
          fallback={(p) => `${p.memberIds.length} ${p.memberIds.length === 1 ? 'character' : 'characters'}`} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
          {sessions.map((s) => <SessionPick key={s.id} session={s} on={s.id === selected?.id} marked={still.includes(s.id)} onPress={(adding) => select(s.id, adding)} onHold={() => mark(s.id)} />)}
          <NewRow title="New session" sub="One night at the table" onPress={onNew} />
        </ScrollView>
        {still.length ? (
          <ChamferBox chamfer={10} fill={DmRune.panel} stroke={DmRune.accent} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ flex: 1, color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{still.length} selected</Text>
            <RuneButton label="Delete" kind="danger" height={30} dense dm onPress={() => onDelete(still)} />
            <RuneButton label="Cancel" kind="ghost" height={30} dense dm onPress={() => setMarked([])} />
          </ChamferBox>
        ) : null}
      </View>
      {selected ? (
        <SessionDossier key={selected.id} session={selected} encounters={encounters[selected.id]}
          onOpen={(encId) => onOpen(selected.id, encId)} onNewEncounter={() => onNewEncounter(selected)} onEdit={() => onEdit(selected)} onDelete={() => onDelete([selected.id])} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 }}>
          <Text style={{ color: DmRune.ivory, fontSize: 22, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>No sessions yet</Text>
          <Text style={{ color: DmRune.muted, fontSize: 14, fontFamily: Body.medium, textAlign: 'center', lineHeight: 21, maxWidth: 440 }}>A session is one night at the table, with its own DM screen. Start the first one on the left.</Text>
        </View>
      )}
    </View>
  );
}

function SessionPick({ session, on, marked, onPress, onHold }: { session: Session; on: boolean; marked: boolean; onPress: (adding: boolean) => void; onHold: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={(e) => { const m = e.nativeEvent as unknown as { ctrlKey?: boolean; metaKey?: boolean }; onPress(!!(m.ctrlKey || m.metaKey)); }} onLongPress={onHold} delayLongPress={340} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityState={{ selected: marked }} accessibilityLabel={on ? `${session.name}. Open its DM screen` : session.name}>
      <ChamferBox chamfer={12} fill={marked ? 'rgba(218,162,73,0.16)' : hover ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={marked ? DmRune.accent : on ? DmRune.red : hover ? DmRune.lineStrong : DmRune.line} strokeWidth={marked || on ? 1.8 : 1.3}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13 }}>
        <IdentityBadge id={session} size={46} />
        <IdentityLines id={session} fallback={new Date(session.createdAt).toLocaleDateString()} />
      </ChamferBox>
    </Pressable>
  );
}

function SessionDossier({ session, encounters, onOpen, onNewEncounter, onEdit, onDelete }: { session: Session; encounters?: EncounterLine[]; onOpen: (encounterId?: string) => void; onNewEncounter: () => void; onEdit: () => void; onDelete: () => void }) {
  // As on the campaigns page: under this the buttons take a row of their own.
  const narrow = useWindowDimensions().width < 1500;
  const nameSize = narrow && session.name.length > 22 ? 27 : 36;
  const actions = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: narrow ? 0 : 10 }}>
      <RuneButton label="Open DM screen" kind="primary" height={42} dense={narrow} dm style={narrow ? undefined : { minWidth: 190 }} onPress={() => onOpen()} />
      <RuneButton label="New encounter" kind="secondary" height={42} dense={narrow} dm onPress={onNewEncounter} />
      <RuneButton label="Edit details" kind="secondary" height={42} dense={narrow} dm onPress={onEdit} />
      <RuneButton label="Delete" kind="ghost" height={42} dense={narrow} dm onPress={onDelete} />
    </View>
  );
  const date = new Date(session.createdAt).toLocaleDateString();
  return (
    <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 34, paddingTop: 26, paddingBottom: 30, gap: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: narrow ? 18 : 24, alignItems: 'center' }}>
            <IdentityBadge id={session} size={narrow ? 96 : 132} />
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <Text style={{ color: DmRune.ivory, fontSize: nameSize, lineHeight: nameSize + 4, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase', overflowWrap: 'anywhere' } as object}>{session.name}</Text>
              <Text numberOfLines={2} style={{ color: DmRune.muted, fontSize: 14, fontFamily: Body.medium, lineHeight: 20 }}>{session.description?.trim() ? `${date}, ${session.description.trim()}` : date}</Text>
              {narrow ? null : actions}
            </View>
          </View>
          {narrow ? actions : null}
        </View>
        <View style={{ gap: 12 }}>
          <SectionHead title="Encounters" count={encounters?.length} />
          {!encounters ? null : encounters.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium }}>No encounters yet. Prepare the first one here, or on the DM screen.</Text>
          ) : encounters.map((e) => <EncounterRow key={e.id} encounter={e} onPress={() => onOpen(e.id)} />)}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

function EncounterRow({ encounter, onPress }: { encounter: EncounterLine; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityLabel={`${encounter.name}, ${STATUS[encounter.status]}. Open it on the DM screen`}>
      <ChamferBox chamfer={12} fill={hover ? 'rgba(24,28,35,0.95)' : 'rgba(14,17,22,0.9)'} stroke={hover ? DmRune.lineStrong : DmRune.line} strokeWidth={1.3}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
        <IdentityBadge id={encounter} size={44} />
        <IdentityLines id={encounter} />
        <Text style={{ color: encounter.status === 'active' ? DmRune.accent : DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6 }}>{STATUS[encounter.status]}</Text>
        <Svg width={14} height={14} viewBox="0 0 16 16"><Polyline points="4,2 12,8 4,14" fill="none" stroke={DmRune.accentDim} strokeWidth={2} /></Svg>
      </ChamferBox>
    </Pressable>
  );
}
