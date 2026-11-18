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
export function DesktopPortal({ to, children }: { to: 'table' | 'side'; children: ReactNode }) {
  const desktop = useDesktop();
  const frame = useMemo(() => {
    if (!desktop) return null;
    const box = to === 'side' ? desktop.side : desktop.table;
    return { width: box.width, height: box.height, scale: 1, offsetX: box.left, offsetY: box.top };
  }, [desktop, to]);
  const host = desktop ? (to === 'table' ? desktop.tableHost : desktop.sideHost) : null;
  if (!desktop || !frame) return <>{children}</>;
  if (to === 'side' && host) return createPortal(<SideLayer frame={frame}>{children}</SideLayer>, host);
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
 * The side slot's layers (v0.44.0). Each portal registers when it mounts and gets the next number; that number
 * is its z-index, and only the highest-numbered layer takes input (the rest are `inert`). So the dialog the
 * player opened last is on top and live, whatever order React placed the DOM nodes in, and a layer that
 * remounts counts as newly opened. This is the stacking a phone's full-screen overlays get for free.
 */
let seq = 0;
const layers = new Map<number, HTMLElement>();
function syncLayers() {
  const top = Math.max(-1, ...layers.keys());
  layers.forEach((el, n) => (n === top ? el.removeAttribute('inert') : el.setAttribute('inert', '')));
}

/**
 * Closes the topmost side layer through its own close control, when more than one layer is open (a dialog on
 * top of a panel). Dialogs that keep their state locally (New Category, Move, Delete inside Card Management)
 * have no closer the sheet knows about, but every one of them carries a Close or Cancel control. Returns true
 * when it closed something, so Escape and Back stop there instead of closing the panel underneath.
 */
export function closeTopSideLayer(): boolean {
  if (layers.size < 2) return false;
  const top = layers.get(Math.max(...layers.keys()));
  const closer = top?.querySelector('[aria-label="Cancel"],[aria-label="Close"]') as HTMLElement | null;
  if (!closer) return false;
  closer.click();
  return true;
}

function SideLayer({ frame, children }: { frame: { width: number; height: number; scale: number; offsetX: number; offsetY: number }; children: ReactNode }) {
  const [order] = useState(() => ++seq);
  const ref = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    layers.set(order, ref.current);
    syncLayers();
    return () => { layers.delete(order); syncLayers(); };
  }, [order]);
  return (
    <View ref={ref as never} style={[StyleSheet.absoluteFill, { zIndex: order }]} pointerEvents="box-none">
      <FrameContext.Provider value={frame}>
        <StageScaleReset>{children}</StageScaleReset>
      </FrameContext.Provider>
    </View>
  );
}
