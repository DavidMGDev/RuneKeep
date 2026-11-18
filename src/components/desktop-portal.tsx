import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
export function DesktopPortal({ to, children, priority = 'panel', onDismiss }: { to: 'table' | 'side'; children: ReactNode; /** Dialogs always rank above panels; open order breaks ties. */ priority?: 'panel' | 'dialog'; /** What Escape and Back do to this layer. Absent: they are BLOCKED while it is on top (an editor guarding unsaved work). */ onDismiss?: () => void }) {
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
export interface SideLayers {
  next(priority: 'panel' | 'dialog'): number;
  set(rank: number, el: HTMLElement, dismiss: () => void, hasDismiss: () => boolean): void;
  remove(rank: number): void;
  /** 'none' when no layer is open; 'dismissed' after asking the top layer to close; 'blocked' when it has no closer. */
  dismissTop(): 'none' | 'dismissed' | 'blocked';
}

const DIALOG_BAND = 1_000_000;

export function createSideLayers(): SideLayers {
  let seq = 0;
  const layers = new Map<number, { el: HTMLElement; dismiss: () => void; hasDismiss: () => boolean }>();
  const sync = () => {
    const top = layers.size ? Math.max(...layers.keys()) : -1;
    layers.forEach((l, rank) => (rank === top ? l.el.removeAttribute('inert') : l.el.setAttribute('inert', '')));
  };
  return {
    next: (priority) => (priority === 'dialog' ? DIALOG_BAND : 0) + ++seq,
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

function SideLayer({ layers, frame, priority, onDismiss, children }: { layers: SideLayers; frame: { width: number; height: number; scale: number; offsetX: number; offsetY: number }; priority: 'panel' | 'dialog'; onDismiss?: () => void; children: ReactNode }) {
  // Ranked once, when the layer opens; a remount is a reopening and ranks as new.
  const [rank] = useState(() => layers.next(priority));
  const ref = useRef<HTMLElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useLayoutEffect(() => {
    if (!ref.current) return;
    layers.set(rank, ref.current, () => dismissRef.current?.(), () => !!dismissRef.current);
    return () => layers.remove(rank);
  }, [layers, rank]);
  return (
    <View ref={ref as never} style={[StyleSheet.absoluteFill, { zIndex: rank }]} pointerEvents="box-none">
      <FrameContext.Provider value={frame}>
        <StageScaleReset>{children}</StageScaleReset>
      </FrameContext.Provider>
    </View>
  );
}
