import { createContext, type ReactNode, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createPortal } from 'react-dom';

import { StageScaleReset } from '@/components/design-stage';
import { useDesktop } from '@/hooks/use-desktop';
import { FrameContext } from '@/hooks/use-layout';

/**
 * Renders `children` into one of the desktop sheet's hosts (v0.44.0). Outside the desktop sheet it renders
 * them in place, so a component can wrap itself unconditionally and phones and tablets see no change.
 *
 * A portal, not a second tree: what lands in the host keeps every context of the place it was written,
 * which is how the side panels and the card table reach the sheet's state. The two contexts that describe
 * GEOMETRY are the exception and are reset at the boundary: the hosts are drawn at the window's own pixels,
 * not inside the scaled phone port, so gestures and sizes inside them must not divide by the port's scale.
 */
export function DesktopPortal({ to, children, priority = 'panel', onDismiss }: { to: 'table' | 'side'; children: ReactNode; /** Bands, low to high: panel, dialog, share, progress; open order breaks ties within one. */ priority?: LayerPriority; /** What Escape and Back do to this layer. Absent: they are BLOCKED while it is on top (an editor guarding unsaved work). */ onDismiss?: () => void }) {
  const desktop = useDesktop();
  const frame = useMemo(() => {
    if (!desktop) return null;
    const box = to === 'side' ? desktop.side : desktop.table;
    return { width: box.width, height: box.height, scale: 1, offsetX: box.left, offsetY: box.top };
  }, [desktop, to]);
  const host = desktop ? (to === 'table' ? desktop.tableHost : desktop.sideHost) : null;
  if (!desktop || !frame) return <>{children}</>;
  if (to === 'side' && host) return createPortal(<SideLayer layers={desktop.layers} frame={frame} priority={priority} onDismiss={onDismiss}>{children}</SideLayer>, host);
  // The host mounts one frame after the port; render nothing rather than in the wrong place meanwhile.
  return host
    ? createPortal(
        <FrameContext.Provider value={frame}>
          <StageScaleReset>{children}</StageScaleReset>
        </FrameContext.Provider>,
        host,
      )
    : null;
}

/**
 * The side slot's layers (v0.44.0), one registry per desktop frame. A layer's rank is its priority band (dialogs
 * above panels) plus the order it opened in; that rank is its z-index AND decides which layer is live (the rest
 * are `inert`). Escape and Back dismiss the top layer through the callback it registered, so what they close is
 * always what the player sees on top, and a layer with no callback (an editor guarding unsaved work) holds them.
 */
export type LayerPriority = 'panel' | 'dialog' | 'share' | 'progress';
const BAND: Record<LayerPriority, number> = { panel: 0, dialog: 1_000_000, share: 2_000_000, progress: 3_000_000 };

export interface SideLayers {
  /** `floor`: the rank of the layer this one opened from; the new rank lands in its band or higher, and above it. */
  next(priority: LayerPriority, floor?: number): number;
  set(rank: number, el: HTMLElement, dismiss: () => void, hasDismiss: () => boolean): void;
  remove(rank: number): void;
  /** 'none' when no layer is open; 'dismissed' after asking the top layer to close; 'blocked' when it has no closer. */
  dismissTop(): 'none' | 'dismissed' | 'blocked';
}

export function createSideLayers(): SideLayers {
  let seq = 0;
  const layers = new Map<number, { el: HTMLElement; dismiss: () => void; hasDismiss: () => boolean }>();
  const sync = () => {
    const top = layers.size ? Math.max(...layers.keys()) : -1;
    layers.forEach((l, rank) => (rank === top ? l.el.removeAttribute('inert') : l.el.setAttribute('inert', '')));
  };
  return {
    next: (priority, floor = 0) => Math.max(BAND[priority], floor - (floor % 1_000_000)) + ++seq,
    set: (rank, el, dismiss, hasDismiss) => { layers.set(rank, { el, dismiss, hasDismiss }); sync(); },
    remove: (rank) => { layers.delete(rank); sync(); },
    dismissTop: () => {
      if (!layers.size) return 'none';
      const top = layers.get(Math.max(...layers.keys()))!;
      if (!top.hasDismiss()) return 'blocked';
      top.dismiss();
      return 'dismissed';
    },
  };
}

/** The layer a portal was written inside, so a picker opened from a panel always ranks above that panel. */
const ParentLayer = createContext<(() => number) | null>(null);

function SideLayer({ layers, frame, priority, onDismiss, children }: { layers: SideLayers; frame: { width: number; height: number; scale: number; offsetX: number; offsetY: number }; priority: LayerPriority; onDismiss?: () => void; children: ReactNode }) {
  // Ranked once, when the layer COMMITS (not during render, so an abandoned render ranks nothing); a remount is
  // a reopening and ranks as new. The layout effect re-renders before paint, so the z-index is never seen at 0.
  const [rank, setRank] = useState(0);
  const ref = useRef<HTMLElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  // Claimed lazily: a child's layout effect runs before its parent's, so when both mount in one commit the
  // child claims the parent's rank first and still lands above it.
  const parentClaim = useContext(ParentLayer);
  const claimed = useRef(0);
  const claim = useCallback(() => {
    if (!claimed.current) claimed.current = layers.next(priority, parentClaim?.() ?? 0);
    return claimed.current;
  }, [layers, priority, parentClaim]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = claim();
    setRank(r);
    layers.set(r, ref.current, () => dismissRef.current?.(), () => !!dismissRef.current);
    return () => { layers.remove(r); claimed.current = 0; };
  }, [layers, claim]);
  return (
    <View ref={ref as never} style={[StyleSheet.absoluteFill, { zIndex: rank }]} pointerEvents="box-none">
      <ParentLayer.Provider value={claim}>
        <FrameContext.Provider value={frame}>
          <StageScaleReset>{children}</StageScaleReset>
        </FrameContext.Provider>
      </ParentLayer.Provider>
    </View>
  );
}
