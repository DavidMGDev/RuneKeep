import { Pressable, Text, View } from 'react-native';

import { Body, Rune } from '@/constants/theme';

import type { CardCategory } from '../card-data';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '../carousel-categories';
import { useCarousel } from '../carousel-context';
import { OverlayShell } from './overlay-shell';

/** A pill switch (on = red, off = grey). */
function Switch({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <View style={{ width: 46, height: 27, borderRadius: 14, padding: 3, backgroundColor: on ? Rune.red : 'rgba(80,84,92,0.6)', justifyContent: 'center', opacity: disabled ? 0.6 : 1 }}>
      <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: Rune.ivory, alignSelf: on ? 'flex-end' : 'flex-start' }} />
    </View>
  );
}

/**
 * The "Cards" panel (#227): toggle which card categories appear in the over-scroll ring. At least one
 * category must stay enabled (the last one's switch is locked on). The current category is marked; if
 * the player disables it, the carousel — unloaded while this panel is open — safely lands on another
 * enabled category when the panel closes (carousel-context's snap-back).
 */
export function CategoryPanel({ isDruid, hidden, onToggle, onClose }: { isDruid: boolean; hidden: CardCategory[]; onToggle: (c: CardCategory) => void; onClose: () => void }) {
  const { category } = useCarousel();
  const applicable = CATEGORY_ORDER.filter((c) => (c === 'wildshape' ? isDruid : true));
  const hiddenSet = new Set(hidden);
  const enabledCount = applicable.filter((c) => !hiddenSet.has(c)).length;
  return (
    <OverlayShell title="Cards" subtitle="Choose which card categories your carousel cycles through." onClose={onClose} dismissOnScrim={false}>
      {applicable.map((c) => {
        const on = !hiddenSet.has(c);
        const locked = on && enabledCount <= 1; // can't turn off the last enabled category
        return (
          <Pressable
            key={c}
            onPress={() => onToggle(c)}
            disabled={locked}
            accessibilityRole="switch"
            accessibilityState={{ checked: on, disabled: locked }}
            accessibilityLabel={CATEGORY_LABEL[c]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 14, borderRadius: 6, backgroundColor: on ? 'rgba(200,27,24,0.16)' : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? Rune.red : 'rgba(218,162,73,0.4)' }}>
              <Text style={{ color: on ? Rune.ivory : Rune.muted, fontSize: 15, fontFamily: Body.bold }}>
                {CATEGORY_LABEL[c]}
                {c === category ? <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.medium }}>{'   · current'}</Text> : null}
              </Text>
              <Switch on={on} disabled={locked} />
            </View>
          </Pressable>
        );
      })}
      <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular, marginTop: 4, textAlign: 'center' }}>At least one stays on. Over-scroll loops through the enabled categories.</Text>
    </OverlayShell>
  );
}
