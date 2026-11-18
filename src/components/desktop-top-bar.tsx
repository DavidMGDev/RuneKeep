import { useNavigationState } from '@react-navigation/native';
import { type Href, usePathname, useRouter } from 'expo-router';
import { forwardRef, type ReactNode, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { leaveThroughSpares } from '@/hooks/use-back-guard';
import { playSfx } from '@/lib/sfx';

/** The places a desktop page can always reach in one click. */
const NAV: { label: string; href: string; route: string; match: (p: string) => boolean }[] = [
  { label: 'Home', href: '/', route: 'index', match: (p) => p === '/' },
  { label: 'Characters', href: '/characters', route: 'characters', match: (p) => p === '/characters' || p === '/create' },
  { label: 'Cards', href: '/library', route: 'library', match: (p) => p === '/library' },
  { label: 'Archive', href: '/gallery', route: 'gallery', match: (p) => p === '/gallery' },
];

/**
 * The desktop pages' header (v0.45.0), in place of the phone's gold frame: Back, the page's name, a small menu
 * of where else you can go (the current place lit), and the page's own actions on the right. It sits on a
 * hairline, the way the desktop mockup's pages do.
 */
export const DesktopTopBar = forwardRef<View, { title: string; onBack?: () => void; right?: ReactNode; navGuard?: (go: () => void) => void; navReplace?: boolean; hideNav?: boolean }>(function DesktopTopBar({ title, onBack, right, navGuard, navReplace, hideNav }, ref) {
  const pathname = usePathname();
  const router = useRouter();
  const inStack = useNavigationState((st) => st?.routes?.map((r) => r.name) ?? []);
  /**
   * Go somewhere from the menu: back to it when it is already in the stack, otherwise on top as a new page,
   * so Back always has somewhere to return to. The page's spare Back entries are stepped off first (the
   * browser's history and the app's stay in step), and a page with unsaved work asks before it goes.
   */
  const goTo = (n: (typeof NAV)[number]) => {
    playSfx('buttonTap');
    // A page that must not stay behind (creation once its draft is kept or discarded, a tour) is replaced.
    const go = () => leaveThroughSpares(() => (inStack.includes(n.route) ? router.dismissTo(n.href as Href) : navReplace ? router.replace(n.href as Href) : router.push(n.href as Href)));
    if (navGuard) navGuard(go);
    else go();
  };
  // A narrow window (down to 1100px) tightens the bar so the page's name always keeps its room.
  const compact = useWindowDimensions().width < 1400;
  return (
    <View ref={ref} style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 14 : 22, paddingBottom: 16, marginBottom: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(218,162,73,0.22)' }}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: compact ? 230 : 300, color: Rune.ivory, fontSize: compact ? 24 : 32, fontFamily: Display.black, letterSpacing: compact ? 1 : 1.4, textTransform: 'uppercase' }}>{title}</Text>
      <View style={{ flex: 1 }} />
      {hideNav ? null : <View accessibilityRole={'navigation' as never} style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: compact ? 0 : 4 }}>
        {NAV.map((n) => (
          <NavLink key={n.href} compact={compact} label={n.label} active={n.match(pathname)} onPress={() => goTo(n)} />
        ))}
      </View>}
      {right ? <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10, marginLeft: compact ? 0 : 8 }}>{right}</View> : null}
    </View>
  );
});

function BackButton({ onPress }: { onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} accessibilityRole="button" accessibilityLabel="Back">
      {({ pressed }) => (
        <ChamferBox chamfer={7} fill={hover ? 'rgba(224,181,99,0.08)' : 'transparent'} stroke={hover ? Rune.goldBright : Rune.goldEdge} strokeWidth={1.3}
          style={{ height: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, transform: [{ scale: pressed ? 0.97 : 1 }] }}>
          <Svg width={12} height={12} viewBox="0 0 18 18">
            <Polyline points="12,2 5,9 12,16" fill="none" stroke={hover ? Rune.goldBright : Rune.goldText} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={{ color: hover ? Rune.ivory : Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>Back</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

function NavLink({ label, active, onPress, compact }: { label: string; active: boolean; onPress: () => void; compact?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={active ? undefined : onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `${label}, current page` : label}
      style={{ paddingHorizontal: compact ? 8 : 12, paddingVertical: 8 }}>
      <Text style={{ color: active ? Rune.ivory : hover ? Rune.goldBright : Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ height: 2, marginTop: 5, backgroundColor: active ? Rune.red : hover ? 'rgba(224,181,99,0.5)' : 'transparent' }} />
    </Pressable>
  );
}
