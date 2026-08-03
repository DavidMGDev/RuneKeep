import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { HoldToConfirm } from '@/components/hold-to-confirm';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import type { CharacterFile } from '@/lib/character-file';
import { cardMoves, type CharacterHistory, type HistoryEntry, type HistoryKind, timeline } from '@/lib/character-history';
import { clockLabel, dayLabel, groupByDay } from '@/lib/day-label';
import { sourceLabelForCardId } from '@/features/cards/card-effects';
import { playSfx } from '@/lib/sfx';

import { ModifiersPanel } from './modifiers-panel';
import { OverlayShell } from './overlay-shell';

/**
 * How long a hold on a timeline entry takes to open the rewind prompt, and how far the finger may
 * stray while it does (v0.33.0).
 *
 * 380ms with no distance limit was a scroll. `Pressable` starts its long-press timer on touch-down
 * and does not care what the finger does next, so any flick that began on a row and took longer than
 * a third of a second to get moving opened the rewind prompt instead. Longer alone would not have
 * fixed it, because a slow drag is exactly the case that failed; the distance is what tells a hold
 * apart from the start of a scroll, and 10dp is small enough that a still finger never trips it.
 */
const HOLD_MS = 620;
const HOLD_SLOP = 10;

/** Timeline entries built per page. Comfortably more than one screenful, so scrolling never waits. */
const TIMELINE_PAGE = 20;

/**
 * The State interface (v0.22.0) — the float menu's north slot, replacing Modifiers.
 *
 * Two views over the same question, "what is my character and how did it get here":
 *
 *  - **Modifiers** — the existing read-only breakdown, unchanged. It was already right.
 *  - **Timeline** — every recorded change, newest first, rewindable.
 *
 * The owner's rule for rewinding: browsing is free, committing needs a deliberate hold, and the
 * moment anything changes afterwards the discarded future is gone with no fast-forward. The
 * confirmation says all of that in plain language before the hold, because it cannot be taken back.
 */
/**
 * One entry in the timeline (v0.29.1).
 *
 * Rewritten from a row you could tap to expand into a row that just says what it is. Expanding was a
 * secret: nothing indicated a row could be opened, and the payoff was a couple of lines most players
 * never saw. What they actually want to know is which cards moved, so that is on the face of the row
 * now and the expand is gone.
 *
 * Holding it draws a real progress bar. Before, the only feedback was the row growing, and growing
 * made its own chamfered border clip against the row above, which reads as a rendering fault rather
 * than as progress.
 */
function TimelineRow({ entry, file, prevSnapshot, discarded, onRewind }: { entry: HistoryEntry; file: CharacterFile; prevSnapshot?: CharacterFile; discarded: boolean; onRewind: () => void }) {
  const charge = useSharedValue(0);
  const reduced = useReducedMotion();
  const fill = useAnimatedStyle(() => ({ width: `${charge.value * 100}%` }));
  const tint = KIND_TINT[entry.kind] ?? Rune.muted;
  // What moved, named. Ids are meaningless to a player: "bone-01-1" is "Bone 1" on the card.
  const moves = useMemo(() => cardMoves(prevSnapshot, entry.snapshot), [prevSnapshot, entry.snapshot]);
  const named = useMemo(
    () => [
      ...moves.added.map((id) => ({ sign: '+', title: sourceLabelForCardId(id, file) || id })),
      ...moves.removed.map((id) => ({ sign: '-', title: sourceLabelForCardId(id, file) || id })),
    ],
    [moves, file],
  );
  /**
   * A gesture-handler LongPress rather than `Pressable`'s, for `maxDistance` (v0.33.0).
   *
   * That one property is the whole fix: it cancels the hold the moment the finger travels, so a
   * scroll that starts on a row stays a scroll. It also composes with the panel's scroll view
   * properly, where `Pressable`'s timer was simply running in parallel with it.
   */
  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(HOLD_MS)
        .maxDistance(HOLD_SLOP)
        .onBegin(() => {
          'worklet';
          if (!reduced) charge.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
        })
        .onStart(() => {
          'worklet';
          runOnJS(onRewind)();
        })
        .onFinalize(() => {
          'worklet';
          charge.value = withTiming(0, { duration: 160 });
        }),
    [charge, reduced, onRewind],
  );
  return (
    <GestureDetector gesture={hold}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${entry.label}, ${dayLabel(entry.at, new Date())} at ${clockLabel(entry.at)}`}
        accessibilityHint="Hold to rewind the character to this point"
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onRewind}>
      <ChamferBox
        chamfer={entry.milestone ? 9 : 6}
        fill={entry.milestone ? 'rgba(218,162,73,0.10)' : 'rgba(20,24,31,0.55)'}
        stroke={entry.milestone ? Rune.goldEdge : 'rgba(218,162,73,0.28)'}
        strokeWidth={entry.milestone ? 1.4 : 1}
        style={{ paddingVertical: 11, paddingHorizontal: 12, marginBottom: 8, opacity: discarded ? 0.42 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 8, height: 8, backgroundColor: tint, transform: [{ rotate: '45deg' }] }} />
          <Text style={{ flex: 1, color: Rune.sheet, fontSize: 13.5, fontFamily: entry.milestone ? Display.bold : Body.bold }}>{entry.label}</Text>
          <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.medium }}>{clockLabel(entry.at)}</Text>
        </View>
        {named.length ? (
          <View style={{ marginTop: 6, paddingLeft: 17, gap: 2 }}>
            {named.slice(0, 6).map((m) => (
              <Text key={`${m.sign}${m.title}`} style={{ color: m.sign === '+' ? Rune.goldText : Rune.muted, fontSize: 11.5, fontFamily: Body.medium }}>
                ({m.sign}) {m.title}
              </Text>
            ))}
            {named.length > 6 ? (
              <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular }}>and {named.length - 6} more</Text>
            ) : null}
          </View>
        ) : null}
        {/* v0.33.0: what a milestone actually WAS. A level-up records the domain card, the
            advancements and the traits it took; anything else keeps a single step that only repeats
            the label, and shows nothing. */}
        {entry.milestone && (entry.steps?.length ?? 0) > 1 ? (
          <View style={{ marginTop: 6, paddingLeft: 17, gap: 2 }}>
            {entry.steps.map((s, i) => (
              <Text key={`${i}-${s}`} style={{ color: Rune.sheet, fontSize: 11.5, fontFamily: Body.regular }}>
                · {s}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={{ color: discarded ? Rune.muted : 'rgba(218,162,73,0.75)', fontSize: 10, fontFamily: Body.medium, marginTop: 7, paddingLeft: 17, letterSpacing: 0.4 }}>
          {discarded ? 'Discarded. Hold to return here.' : 'Hold to rewind here'}
        </Text>
        {/* The hold, drawn. Sits along the bottom edge so it never changes the row's size. */}
        <View style={{ height: 2, marginTop: 8, backgroundColor: 'rgba(218,162,73,0.16)' }}>
          <Animated.View style={[{ height: 2, backgroundColor: Rune.goldBright }, fill]} />
        </View>
      </ChamferBox>
      </View>
    </GestureDetector>
  );
}

export function StatePanel({
  file,
  history,
  onRewind,
  onClose,
}: {
  file: CharacterFile;
  history: CharacterHistory;
  /** Restores the snapshot and returns anything the repair pass had to correct. */
  onRewind: (index: number) => string[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'modifiers' | 'timeline'>('modifiers');

  if (tab === 'modifiers') {
    return (
      <ModifiersPanel
        file={file}
        onClose={onClose}
        header={<Tabs tab={tab} onTab={setTab} count={history.entries.length} />}
      />
    );
  }
  return <TimelineView file={file} history={history} onRewind={onRewind} onClose={onClose} header={<Tabs tab={tab} onTab={setTab} count={history.entries.length} />} />;
}

function Tabs({ tab, onTab, count }: { tab: 'modifiers' | 'timeline'; onTab: (t: 'modifiers' | 'timeline') => void; count: number }) {
  const item = (key: 'modifiers' | 'timeline', label: string) => {
    const on = tab === key;
    return (
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          if (on) return;
          playSfx('buttonTap');
          onTab(key);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}>
        <ChamferBox chamfer={6} fill={on ? 'rgba(200,27,24,0.18)' : 'transparent'} stroke={on ? Rune.red : Rune.goldEdge} strokeWidth={on ? 1.5 : 1.1} style={{ height: 30, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: on ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
            {label}
            {key === 'timeline' && count > 0 ? ` · ${count}` : ''}
          </Text>
        </ChamferBox>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
      {item('modifiers', 'Modifiers')}
      {item('timeline', 'Timeline')}
    </View>
  );
}

/** Glyph colour per kind, so a long timeline is scannable without reading every label. */
const KIND_TINT: Record<HistoryKind, string> = {
  create: Rune.goldBright,
  level: Rune.goldBright,
  rest: Rune.goldBright,
  resource: Rune.red,
  equip: Rune.gold,
  cards: Rune.gold,
  edit: Rune.gold,
  layout: Rune.muted,
  other: Rune.muted,
};


function TimelineView({
  file,
  history,
  onRewind,
  onClose,
  header,
}: {
  /** Needed to turn a card id into the title the player actually sees on the card. */
  file: CharacterFile;
  history: CharacterHistory;
  onRewind: (index: number) => string[];
  onClose: () => void;
  header: React.ReactNode;
}) {
  const rows = useMemo(() => timeline(history), [history]);
  const [confirm, setConfirm] = useState<{ entry: HistoryEntry; index: number; discards: number } | null>(null);
  const [repairs, setRepairs] = useState<string[] | null>(null);
  /**
   * The timeline pages in (v0.34.0).
   *
   * At the owner's 98 entries it built every row on open, and a row is not cheap: each one diffs two
   * whole character snapshots to work out which cards moved, and then looked its predecessor up with
   * a linear search through the whole list, which is quadratic over the timeline. A page at a time
   * makes opening it constant work whatever the length of the campaign.
   */
  const [shown, setShown] = useState(TIMELINE_PAGE);
  const more = useCallback(() => setShown((n) => (n >= rows.length ? n : n + TIMELINE_PAGE)), [rows.length]);
  const paged = useMemo(() => rows.slice(0, shown), [rows, shown]);
  /** Each entry's predecessor, resolved ONCE. The per-row search was the other half of the cost. */
  const prevById = useMemo(() => {
    const m = new Map<string, CharacterFile | undefined>();
    for (const r of rows) m.set(r.entry.id, history.entries[r.index - 1]?.snapshot);
    return m;
  }, [rows, history]);

  if (repairs) {
    return (
      <OverlayShell title="Rewound" subtitle="Your character was restored" onClose={onClose}>
        {repairs.length === 0 ? (
          <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>Everything in that snapshot restored cleanly.</Text>
        ) : (
          <>
            <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18, marginBottom: 8 }}>
              Most of it restored cleanly. These had to be adjusted:
            </Text>
            {repairs.map((r) => (
              <Text key={r} style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.medium, lineHeight: 17, marginBottom: 4 }}>
                • {r}
              </Text>
            ))}
          </>
        )}
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.italic, lineHeight: 17, marginTop: 10 }}>
          Things outside this character — your party&apos;s tracked vitals, the card library, a DM&apos;s encounter — are not
          rewound, and images your phone has since cleared can&apos;t come back.
        </Text>
        <View style={{ marginTop: 14 }}>
          <RuneButton label="Done" kind="primary" height={42} onPress={onClose} />
        </View>
      </OverlayShell>
    );
  }

  if (confirm) {
    const { entry, discards } = confirm;
    return (
      <OverlayShell title="Rewind character?" subtitle={entry.label} onClose={() => setConfirm(null)}>
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>
          Your character goes back to how it was on {dayLabel(entry.at, new Date())} at {clockLabel(entry.at)}
          {entry.milestone ? ', a milestone.' : '.'}
        </Text>
        {discards > 0 ? (
          <Text style={{ color: Rune.goldText, fontSize: 12.5, fontFamily: Body.medium, lineHeight: 18, marginTop: 10 }}>
            {discards} later change{discards === 1 ? '' : 's'} will still be listed, greyed out, until you change something
            else. That is the point of no return: the moment you do, they are gone and cannot be brought back.
          </Text>
        ) : null}
        <View style={{ marginTop: 16, gap: 10 }}>
          <HoldToConfirm label="Hold to rewind" height={44} chamfer={10} sfx={null} onConfirm={() => { const r = onRewind(confirm.index); setConfirm(null); setRepairs(r); }} />
          <RuneButton label="Cancel" kind="ghost" height={40} onPress={() => setConfirm(null)} />
        </View>
      </OverlayShell>
    );
  }

  return (
    <OverlayShell title="Timeline" subtitle={rows.length ? `${rows.length} recorded change${rows.length === 1 ? '' : 's'}` : undefined} onClose={onClose} header={header} onEndReached={more}>
      {rows.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>
          Nothing recorded yet. From here on, everything you do to this character is listed here and can be rewound.
        </Text>
      ) : null}
      {groupByDay(paged, (r) => r.entry.at, new Date()).map((group) => (
        <View key={group.label}>
          {/* Day heading, the way every chat app does it. A column of times tells you nothing about
              whether something happened this afternoon or last month. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 8 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.22)' }} />
            <Text style={{ color: Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }}>{group.label}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.22)' }} />
          </View>
          {group.items.map(({ entry, index, discarded }) => (
            <TimelineRow
              key={entry.id}
              entry={entry}
              file={file}
              prevSnapshot={prevById.get(entry.id)}
              discarded={discarded}
              onRewind={() => setConfirm({ entry, index, discards: rows.filter((r) => r.index > index).length })}
            />
          ))}
        </View>
      ))}
      {shown < rows.length ? (
        <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium, textAlign: 'center', paddingVertical: 8 }}>
          {rows.length - shown} older change{rows.length - shown === 1 ? '' : 's'}. Keep scrolling.
        </Text>
      ) : null}
    </OverlayShell>
  );
}
