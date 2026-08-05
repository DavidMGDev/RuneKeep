import { type ReactNode } from 'react';
import { View } from 'react-native';

import { SectionLabel } from './app-screen';

/**
 * One labelled row of filter chips (v0.35, owner).
 *
 * Lifted out of the card archive so the adversary and ally libraries can use the same thing: they had
 * three unlabelled rows of chips, so you could see what you had lit but not what you were filtering
 * ON, and the two screens felt like parts of different apps.
 *
 * It WRAPS rather than scrolling sideways. The archive's version was a horizontal ScrollView, which
 * hides chips off the right edge with nothing to say they are there, and on a phone the Domain band
 * hid most of itself. Wrapping costs vertical space inside a drawer that is already scrollable, and
 * the band gap keeps two wrapped bands from reading as one blob.
 */
export function FilterBand({ label, dm, children }: { label: string; dm?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <SectionLabel dm={dm} style={{ fontSize: 9.5, letterSpacing: 1.6 }}>{label}</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>
    </View>
  );
}
