import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Rune } from '@/constants/theme';
import { type ExperienceDef } from '@/lib/character-file';
import { playSfx } from '@/lib/sfx';
import { ForgedCard } from './components/forged-card';

/** Two experience slots (#107): player-authored cards. Empty = forge prompt; filled = the card
 *  at reading size with the EDIT control in its lower-left corner (owner spec). */
export function ExperiencesTab({ experiences, onEdit }: { experiences: ExperienceDef[]; onEdit: (slot: number) => void }) {
  const CARD_SCALE_X = 0.62;
  return (
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      {[0, 1].map((slot) => {
        const exp = experiences[slot];
        return (
          <View key={slot} style={{ width: 230 * CARD_SCALE_X, height: 322 * CARD_SCALE_X }}>
            {exp ? (
              <>
                <View style={{ transform: [{ scale: CARD_SCALE_X }], width: 230, height: 322, marginLeft: (230 * (CARD_SCALE_X - 1)) / 2, marginTop: (322 * (CARD_SCALE_X - 1)) / 2 }}>
                  <ForgedCard title={exp.title} kindLabel="Experience" body={exp.text} accentDeep={Rune.panel} imageUri={exp.imageUri} colorArt={exp.color} multilineTitle />
                </View>
                {/* the lower-left EDIT control */}
                <Pressable
                  onPress={() => { playSfx('buttonTap'); onEdit(slot); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${exp.title}`}
                  style={{ position: 'absolute', left: -6, bottom: -6 }}>
                  <ChamferBox chamfer={6} fill={Rune.red} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={14} height={14} viewBox="0 0 12 12">
                      <Path d="M 1 11 L 3 6 L 9 0 L 12 3 L 6 9 Z" fill={Rune.ivory} />
                    </Svg>
                  </ChamferBox>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => { playSfx('buttonTap'); onEdit(slot); }} accessibilityRole="button" accessibilityLabel={`Add experience ${slot + 1}`} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <ChamferBox
                    chamfer={12}
                    fill={pressed ? 'rgba(200,27,24,0.12)' : 'rgba(14,17,22,0.9)'}
                    stroke="rgba(218,162,73,0.5)"
                    strokeWidth={1.3}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <Svg width={30} height={30} viewBox="0 0 30 30">
                      <Line x1={15} y1={5} x2={15} y2={25} stroke={Rune.goldEdge} strokeWidth={2.4} />
                      <Line x1={5} y1={15} x2={25} y2={15} stroke={Rune.goldEdge} strokeWidth={2.4} />
                    </Svg>
                    <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' }}>
                      Experience {slot + 1}
                    </Text>
                  </ChamferBox>
                )}
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}
