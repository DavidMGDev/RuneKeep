import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { HoldToConfirm } from '@/components/hold-to-confirm';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import type { CharacterFile } from '@/lib/character-file';
import { type CharacterHistory, type HistoryEntry, type HistoryKind, timeline } from '@/lib/character-history';
import { playSfx } from '@/lib/sfx';

import { ModifiersPanel } from './modifiers-panel';
import { OverlayShell } from './overlay-shell';

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
  return <TimelineView history={history} onRewind={onRewind} onClose={onClose} header={<Tabs tab={tab} onTab={setTab} count={history.entries.length} />} />;
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

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return sameDay ? `${hh}:${mm}` : `${d.getDate()}/${d.getMonth() + 1} · ${hh}:${mm}`;
}

function TimelineView({
  history,
  onRewind,
  onClose,
  header,
}: {
  history: CharacterHistory;
  onRewind: (index: number) => string[];
  onClose: () => void;
  header: React.ReactNode;
}) {
  const rows = useMemo(() => timeline(history), [history]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ entry: HistoryEntry; index: number; discards: number } | null>(null);
  const [repairs, setRepairs] = useState<string[] | null>(null);

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
          Your character goes back to how it was at {timeLabel(entry.at)}
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
    <OverlayShell title="Timeline" subtitle={rows.length ? `${rows.length} recorded change${rows.length === 1 ? '' : 's'}` : undefined} onClose={onClose} header={header}>
      {rows.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>
          Nothing recorded yet. From here on, everything you do to this character is listed here and can be rewound.
        </Text>
      ) : null}
      {rows.map(({ entry, index, discarded }) => {
        const open = expanded === entry.id;
        const tint = KIND_TINT[entry.kind] ?? Rune.muted;
        return (
          <Pressable
            key={entry.id}
            onPress={() => { playSfx('buttonTap'); setExpanded(open ? null : entry.id); }}
            onLongPress={() => { if (!discarded) setConfirm({ entry, index, discards: rows.filter((r) => r.index > index).length }); }}
            delayLongPress={380}
            accessibilityRole="button"
            accessibilityLabel={`${entry.label}, ${timeLabel(entry.at)}`}
            accessibilityHint="Tap for detail, hold to rewind to this point">
            <ChamferBox
              chamfer={entry.milestone ? 9 : 6}
              fill={entry.milestone ? 'rgba(218,162,73,0.10)' : 'rgba(20,24,31,0.55)'}
              stroke={entry.milestone ? Rune.goldEdge : 'rgba(218,162,73,0.28)'}
              strokeWidth={entry.milestone ? 1.4 : 1}
              style={{ paddingVertical: 9, paddingHorizontal: 11, marginBottom: 6, opacity: discarded ? 0.38 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 8, height: 8, backgroundColor: tint, transform: [{ rotate: '45deg' }] }} />
                <Text style={{ flex: 1, color: Rune.sheet, fontSize: 13, fontFamily: entry.milestone ? Display.bold : Body.bold }}>{entry.label}</Text>
                <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium }}>{timeLabel(entry.at)}</Text>
              </View>
              {open && entry.steps.length > 1 ? (
                <View style={{ marginTop: 7, paddingLeft: 17, gap: 3 }}>
                  {entry.steps.map((st, i) => (
                    <Text key={`${entry.id}-${i}`} style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular }}>
                      {st}
                    </Text>
                  ))}
                </View>
              ) : null}
              {open ? (
                <Text style={{ color: discarded ? Rune.muted : Rune.goldText, fontSize: 10.5, fontFamily: Body.medium, marginTop: 7, paddingLeft: 17 }}>
                  {discarded ? 'Discarded, change anything and this is gone' : 'Hold this entry to rewind here'}
                </Text>
              ) : null}
            </ChamferBox>
          </Pressable>
        );
      })}
    </OverlayShell>
  );
}
