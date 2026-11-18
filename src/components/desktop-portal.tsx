import { type ReactNode, useLayoutEffect, useMemo } from 'react';
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
  if (to === 'side' && host) return createPortal(<SideLayer host={host} frame={frame}>{children}</SideLayer>, host);
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
 * One layer in the side slot. Layers stack in the order they open, so the newest is the dialog the player just
 * raised (Export over Card Management, the restore picker over Trash). Only that one takes input; every layer
 * under it is inert until it closes, which is what a phone's full-screen stacking gives for free.
 */
function SideLayer({ host, frame, children }: { host: HTMLElement; frame: { width: number; height: number; scale: number; offsetX: number; offsetY: number }; children: ReactNode }) {
  useLayoutEffect(() => {
    const sync = () => {
      const layers = Array.from(host.children) as HTMLElement[];
      layers.forEach((el, i) => (i === layers.length - 1 ? el.removeAttribute('inert') : el.setAttribute('inert', '')));
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(host, { childList: true });
    return () => { obs.disconnect(); queueMicrotask(sync); };
  }, [host]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <FrameContext.Provider value={frame}>
        <StageScaleReset>{children}</StageScaleReset>
      </FrameContext.Provider>
    </View>
  );
}
