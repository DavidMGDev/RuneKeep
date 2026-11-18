// shortcut: only the one react-dom API the desktop portals use; add @types/react-dom if more is ever needed.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}
