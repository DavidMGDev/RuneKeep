import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import type { CardChoice } from '@/data/card-choices';
import { playSfx } from '@/lib/sfx';

import { CenterDialog } from './full-screen-panel';

const GOLD_BORDER = 'rgba(218,162,73,0.4)';

/**
 * "Pick two of these" (v0.25.0).
 *
 * A few rulebook cards hand the player a menu rather than a benefit. Vitality is the one that forced
 * this: "permanently gain two of the following benefits", then it tells you to put the card away.
 *
 * The card cannot be equipped until the question is answered, because an unanswered card grants
 * nothing and silently granting nothing is worse than asking. The note under the options explains the
 * part that surprises people: these are permanent, the card does not count against the equipped
 * domain limit, and it keeps working from the vault.
 */
export function CardChoiceDialog({
  choice,
  cardTitle,
  onPick,
  onCancel,
}: {
  choice: CardChoice;
  cardTitle?: string;
  onPick: (options: number[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const full = picked.length >= choice.pick;

  const toggle = (i: number) => {
    playSfx(picked.includes(i) ? 'cardDeselect' : 'cardSelect');
    setPicked((cur) => {
      if (cur.includes(i)) return cur.filter((x) => x !== i);
      // At the limit, the OLDEST pick drops out, so a player changing their mind never has to
      // deselect first. With pick = 2 that reads as "the other one moves".
      return (cur.length >= choice.pick ? cur.slice(1) : cur).concat(i);
    });
  };

  return (
    <CenterDialog onClose={onCancel}>
      <View style={{ width: '100%', maxWidth: 340, gap: 12 }}>
        {cardTitle ? (
          <Text numberOfLines={2} style={{ color: Rune.ivory, fontSize: 19, fontFamily: Display.black, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' }}>{cardTitle}</Text>
        ) : null}
        <Text style={{ color: Rune.goldText, fontSize: 12.5, fontFamily: Body.medium, lineHeight: 18, textAlign: 'center' }}>{choice.prompt}</Text>

        <View style={{ gap: 8 }}>
          {choice.options.map((label, i) => {
            const on = picked.includes(i);
            return (
              <Pressable key={i} onPress={() => toggle(i)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
                <ChamferBox
                  chamfer={8}
                  fill={on ? 'rgba(218,162,73,0.16)' : 'rgba(14,17,22,0.9)'}
                  stroke={on ? Rune.goldBright : GOLD_BORDER}
                  strokeWidth={on ? 1.8 : 1.2}
                  style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 16, height: 16, borderWidth: 1.6, borderColor: on ? Rune.goldBright : GOLD_BORDER, backgroundColor: on ? Rune.goldBright : 'transparent' }} />
                  <Text style={{ flex: 1, color: on ? Rune.ivory : Rune.muted, fontSize: 13, fontFamily: Body.semibold }}>{label}</Text>
                </ChamferBox>
              </Pressable>
            );
          })}
        </View>

        {choice.note ? (
          <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular, lineHeight: 16, textAlign: 'center' }}>{choice.note}</Text>
        ) : null}

        <Text style={{ color: full ? Rune.goldBright : Rune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center' }}>
          {picked.length} of {choice.pick} chosen
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RuneButton label="Cancel" kind="ghost" height={44} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label="Take these" kind="primary" height={44} style={{ flex: 1.3 }} disabled={!full} onPress={() => onPick([...picked].sort((a, b) => a - b))} />
        </View>
      </View>
    </CenterDialog>
  );
}
