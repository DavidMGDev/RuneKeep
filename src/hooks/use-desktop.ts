import { createContext, useContext } from 'react';

import type { SideLayers } from '@/components/desktop-portal';
import { Platform } from 'react-native';

/**
 * Desktop web (v0.44.0): a wide browser window gets its own layout instead of the tablet frame.
 *
 * The phone sheet stays exactly as it is, pinned in a port on the left at its 412x892 design size. Everything
 * about cards moves to a desktop table on the right, and every panel that is full screen on a phone opens in a
 * side slot beside the port. Both of those live OUTSIDE the scaled phone viewport, so they are drawn at the
 * screen's own pixels, and they reach the sheet's state because they are React portals, not separate trees.
 *
 * Web only. A tablet is still a phone in a frame (see PhoneFrame); a desktop is not a tablet.
 */
export const DESKTOP_MIN_W = 1100;
export const DESKTOP_MIN_H = 640;
/** Width the card table always keeps right of the port: the deck rail, a focused card and the hand's fan. */
export const DESKTOP_TABLE_MIN_W = 640;

/**
 * Full-page desktop screens (v0.45.0): the main menu, the roster, the archive and creation lay themselves out
 * across the whole window instead of in the phone frame. PhoneFrame sets this for the routes that have a desktop
 * layout; a screen reads it to pick that layout. False everywhere else, so a screen without one is unchanged.
 */
export const DesktopPageContext = createContext(false);
/** A desktop page's inset from the window's sides, in px (the header and every layout under it). */
export const DESKTOP_PAGE_PAD = 40;
export const useDesktopPage = () => useContext(DesktopPageContext);

export function isDesktopWindow(width: number, height: number): boolean {
  // No aspect rule: a tall window keeps the desktop layout, and the port gives up height instead (see PhoneFrame).
  return Platform.OS === 'web' && width >= DESKTOP_MIN_W && height >= DESKTOP_MIN_H;
}

export interface DesktopPort {
  /** The port's box in window pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Window pixels per design pixel inside the port. */
  scale: number;
}

export interface Desktop {
  port: DesktopPort;
  /** The side slot panels open into, window pixels. Drawn at scale 1, unlike the port. */
  side: { left: number; top: number; width: number; height: number };
  /** Everything right of the port, where the card table draws; window pixels. */
  table: { left: number; top: number; width: number; height: number };
  /** The side slot's layer registry: stacking, inertness and Escape/Back for everything opened there. */
  layers: SideLayers;
  /** DOM node the desktop card table portals into (everything right of the port). */
  tableHost: HTMLElement | null;
  /** DOM node panels and dialogs portal into (a slot hugging the port's right edge). */
  sideHost: HTMLElement | null;
  /** v0.46.0: the whole window, for a full-screen dialogue (level up) drawn over the port and the table. */
  win: { left: number; top: number; width: number; height: number };
  windowHost: HTMLElement | null;
  /** v0.50.0: over all of it, the side slot too: a dialog that dims and blurs the whole screen. */
  modalHost: HTMLElement | null;
}

export const DesktopContext = createContext<Desktop | null>(null);

/** Non-null only on the desktop sheet. Everything desktop-specific branches on this. */
export function useDesktop(): Desktop | null {
  return useContext(DesktopContext);
}
