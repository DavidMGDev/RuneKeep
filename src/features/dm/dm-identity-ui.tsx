/**
 * How a campaign, a session or an encounter is DRAWN (v0.41.4, owner).
 *
 * One badge and one dropdown, used by all three levels, so they cannot drift apart. What to draw is
 * decided in `lib/dm-identity`, which is pure; this file only paints the answer.
 *
 * The badge is a chamfered square in the DM's language: a picture if there is one, a colour with the
 * title's initial over it if there is a colour, and the initial alone if there is neither. That last
 * case is not a placeholder, it is the DEFAULT: every record that existed before this release has a
 * title and therefore has a badge, which is the whole of the owner's item 9.
 */
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { readableInk } from '@/lib/color';
import { type DmIdentity, identityFace } from '@/lib/dm-identity';
import { DmPress } from './dm-ui';

export function IdentityBadge({ id, size = 44 }: { id: DmIdentity; size?: number }) {
  const face = identityFace(id);
  const chamfer = Math.max(4, Math.round(size * 0.2));
  if (face.kind === 'image') {
    return (
      <ChamferBox chamfer={chamfer} fill={DmRune.ink} stroke={DmRune.line} strokeWidth={1.2} style={{ width: size, height: size, overflow: 'hidden' }}>
        <Image source={face.uri} style={{ width: size, height: size }} contentFit="cover" />
      </ChamferBox>
    );
  }
  const bg = face.kind === 'color' ? face.color : 'transparent';
  const ink = face.kind === 'color' ? readableInk(face.color) : DmRune.accent;
  return (
    <ChamferBox
      chamfer={chamfer}
      fill={bg}
      stroke={face.kind === 'color' ? 'transparent' : DmRune.line}
      strokeWidth={1.2}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: ink, fontSize: size * 0.52, lineHeight: size * 0.66, fontFamily: Display.black }}>{face.initial}</Text>
    </ChamferBox>
  );
}

/** Title over description, the pair every DM row shows beside its badge. */
export function IdentityLines({ id, fallback, tint }: { id: DmIdentity; fallback?: string; tint?: string }) {
  const sub = (id.description ?? '').trim() || fallback;
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <FitLine style={{ color: tint ?? DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>{id.name}</FitLine>
      {sub ? <Text numberOfLines={2} style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, lineHeight: 16 }}>{sub}</Text> : null}
    </View>
  );
}

/**
 * The switcher at the top of a list (v0.41.4, owner).
 *
 * The old one was a colour diamond and a name, which said nothing a DM running two games could use.
 * It now shows the same badge, title and description a row does, both on the closed control and on
 * every option, so choosing is recognising rather than remembering.
 *
 * `zIndex` is on the wrapper rather than the panel: the open list is absolutely positioned over
 * whatever is beneath it, and on the web a positioned sibling with no z-index wins by document order.
 */
export function IdentityDropdown<T extends DmIdentity & { id: string }>({
  label,
  items,
  selected,
  fallback,
  onSelect,
  trailing,
}: {
  /** What this dropdown chooses, for the screen reader: "Campaign", "Session". */
  label: string;
  items: T[];
  selected: T;
  /** The line to show when an item has no description of its own. */
  fallback?: (item: T) => string;
  onSelect: (item: T) => void;
  /** Anything to put at the right end of the closed control, such as a count. */
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ zIndex: 50 }}>
      <DmPress onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={`${label}: ${selected.name}. Change`}>
        <ChamferBox chamfer={10} fill="rgba(14,17,22,0.94)" stroke={DmRune.lineStrong} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <IdentityBadge id={selected} size={38} />
          <IdentityLines id={selected} fallback={fallback?.(selected)} />
          {trailing}
          <Svg width={16} height={16} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Polyline points="3,6 8,11 13,6" fill="none" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </ChamferBox>
      </DmPress>
      {open ? (
        <ChamferBox chamfer={10} fill="rgba(10,13,18,0.99)" stroke={DmRune.line} strokeWidth={1.2} style={{ position: 'absolute', top: 66, left: 0, right: 0, paddingVertical: 4, zIndex: 60 }}>
          {items.map((it) => (
            <DmPress
              key={it.id}
              onPress={() => { setOpen(false); onSelect(it); }}
              accessibilityRole="button"
              accessibilityLabel={it.name}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: pressed ? 'rgba(196,200,208,0.1)' : 'transparent' })}>
              <IdentityBadge id={it} size={32} />
              <IdentityLines id={it} fallback={fallback?.(it)} tint={it.id === selected.id ? DmRune.accent : DmRune.ivory} />
            </DmPress>
          ))}
        </ChamferBox>
      ) : null}
    </View>
  );
}
