import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useDesktop } from '@/hooks/use-desktop';

/**
 * Renders `children` into one of the desktop sheet's hosts (v0.44.0). Outside the desktop sheet it renders
 * them in place, so a component can wrap itself unconditionally and phones and tablets see no change.
 *
 * A portal, not a second tree: what lands in the host keeps every context of the place it was written,
 * which is how the side panels and the card table reach the sheet's state.
 */
export function DesktopPortal({ to, children }: { to: 'table' | 'side'; children: ReactNode }) {
  const desktop = useDesktop();
  const host = desktop ? (to === 'table' ? desktop.tableHost : desktop.sideHost) : null;
  if (!desktop) return <>{children}</>;
  // The host mounts one frame after the port; render nothing rather than in the wrong place meanwhile.
  return host ? createPortal(children, host) : null;
}
