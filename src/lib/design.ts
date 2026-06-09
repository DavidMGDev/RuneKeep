import type { ViewStyle } from 'react-native';

/**
 * The character sheet's base design space (matches the Ligma export origin, 412×892).
 * Every element on the sheet is authored in these coordinates and uniformly scaled by DesignStage.
 */
export const SHEET_DESIGN_WIDTH = 412;
export const SHEET_DESIGN_HEIGHT = 892;

/** Absolute box in design pixels. Coordinates are screen-relative (sheet top-left = 0,0). */
export function box(left: number, top: number, width: number, height: number): ViewStyle {
  return { position: 'absolute', left, top, width, height };
}
