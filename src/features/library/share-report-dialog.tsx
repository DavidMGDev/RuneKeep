/**
 * What is stopping this pack from being shared (v0.42.5, owner).
 *
 * "I want a pop-up that recollects all the red warnings that are blocking the expansion from being
 * shared... It must be specific and it must name the cards, and it should prompt the user to fix them
 * before being able to download or share the expansion. Make it robust and serve as a very practical
 * learning tool for new expansion creators."
 *
 * So it is not a list of complaints, it is a worklist: one block per card, headed by the card's name
 * and kind, with each line phrased as the next thing to do. Tapping a card's heading takes you to it,
 * because a report you cannot act on from is a report you have to memorise.
 *
 * It is also shown when everything is FINE, from the same button, because "why can I not share this"
 * and "is this ready" are the same question asked at different times.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Gap, Rune } from '@/constants/theme';
import { reportHeading, type ShareReport } from '@/lib/share-report';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';

/** The warning triangle, also used as the badge on the Share button. */
export function WarningTriangle({ size = 14, color = '#E8B33A' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d="M8 1.5 L15 14 L1 14 Z" fill={color} />
      <Path d="M8 5.5 L8 9.6" stroke={Rune.ink} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M8 11.4 L8 11.9" stroke={Rune.ink} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

export function ShareReportDialog({ report, packName, onGoToCard, onShare, onClose }: {
  report: ShareReport;
  packName: string;
  /** Jump to a card that needs work. */
  onGoToCard: (cardId: string) => void;
  /** Only offered when the pack is ready. */
  onShare: () => void;
  onClose: () => void;
}) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} />
      <DimScreen opacity={0.92} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={report.ok ? Rune.goldEdge : Rune.red} strokeWidth={1.6} style={{ width: 344, maxHeight: 620, paddingHorizontal: 14, paddingVertical: 14, gap: Gap.intra }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {report.ok ? null : <WarningTriangle size={17} />}
          <Text style={{ flex: 1, color: report.ok ? Rune.goldText : Rune.ivory, fontSize: 16, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {reportHeading(report)}
          </Text>
        </View>

        <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular, lineHeight: 15 }}>
          {report.ok
            ? `${packName} is complete. Sharing writes a .rune file you can send to anybody: they open it and the pack installs itself.`
            : 'A pack can only be shared once every card is finished, because on somebody else’s device an unfinished card is one they cannot use and cannot fix. Tap a card to go and finish it.'}
        </Text>

        {report.ok ? null : (
          <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ gap: Gap.intra, paddingBottom: 4 }}>
            {report.pack.map((p) => (
              <Text key={p} style={{ color: Rune.sheet, fontSize: 12, fontFamily: Body.regular, lineHeight: 16 }}>{p}</Text>
            ))}
            {report.cards.map((c) => (
              <Pressable
                key={c.cardId}
                onPress={() => { playSfx('buttonTap'); onGoToCard(c.cardId); }}
                accessibilityRole="button"
                accessibilityLabel={`Fix ${c.title}, ${c.problems.length} thing${c.problems.length === 1 ? '' : 's'} to do`}>
                {({ pressed }) => (
                  <ChamferBox chamfer={8} fill={pressed ? 'rgba(24,29,37,0.95)' : 'rgba(14,17,22,0.9)'} stroke="rgba(226,112,90,0.45)" strokeWidth={1.1} style={{ paddingHorizontal: 11, paddingVertical: 9, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text numberOfLines={1} style={{ flex: 1, color: Rune.ivory, fontSize: 13.5, fontFamily: Body.bold }}>{c.title}</Text>
                      <Text style={{ color: Rune.bronze, fontSize: 9, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>{c.kind}</Text>
                      <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="4,2 8,6 4,10" fill="none" stroke={Rune.goldText} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                    </View>
                    {c.problems.map((p, i) => (
                      <Text key={i} style={{ color: Rune.sheet, fontSize: 11.5, fontFamily: Body.regular, lineHeight: 16 }}>{'• '}{p}</Text>
                    ))}
                  </ChamferBox>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <RuneButton label={report.ok ? 'Not now' : 'Back to the pack'} kind="ghost" height={42} style={{ flex: 1 }} onPress={onClose} />
          {/* The share button EXISTS only when the pack is ready. v0.42.4 offered it and then failed
              on native by writing the file anyway, which is the bug this shape makes impossible. */}
          {report.ok ? <RuneButton label="Share it" kind="primary" height={42} style={{ flex: 1 }} onPress={onShare} /> : null}
        </View>
      </ChamferBox>
    </View>
  );
}
