import Svg, { Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { type DeckKey } from './create-types';

/** The per-deck nav glyph: a small hand-drawn SVG icon for each creation step. */
export function DeckGlyph({ deck, color }: { deck: DeckKey; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'miter' as const };
  /**
   * A CUSTOM STEP, from a type an expansion invented (v0.43.2, owner).
   *
   * "The step that I created by creating a type card has no logo... It's compressed and it's not the
   * same size as the rest of the steps, breaking the UI."
   *
   * Exactly the failure the `carry`/`level` comment below describes: the switch had no arm for these
   * keys, so it returned nothing and the tab collapsed to a squashed box with a label and no 20dp
   * icon above it, next to nine tabs that had one.
   *
   * The mark is a CARD WITH ITS CHIP ACROSS IT, because that is what a type is: a kind of card,
   * defined by the chip its cards wear. It reads as its own thing beside the hexagons and the sword.
   */
  if (deck.startsWith('custom:')) {
    return (
      <Svg width={20} height={20} viewBox="0 0 22 22">
        <Rect x={4} y={2} width={14} height={18} rx={1.5} {...s} />
        <Rect x={2.5} y={9} width={17} height={4} rx={1} fill={color} stroke="none" />
      </Svg>
    );
  }
  switch (deck) {
    // v0.36.1: the three characterize-only steps had no glyph at all, so their tabs collapsed to a
    // squashed box with nothing above the label while every other tab held a 20dp icon.
    case 'carry':
      // A hand receiving: what the stat block is passing over.
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="M 3 12 v 4 a 3 3 0 0 0 3 3 h 10 a 3 3 0 0 0 3 -3 v -4" {...s} />
          <Line x1={11} y1={2} x2={11} y2={13} {...s} />
          <Polyline points="7,9 11,13 15,9" {...s} />
        </Svg>
      );
    case 'level':
      // The level-up chevrons, the same shape the float menu uses for Level Up.
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polyline points="4,11 11,4 18,11" {...s} />
          <Polyline points="4,18 11,11 18,18" {...s} />
        </Svg>
      );
    case 'transformation':
      // A crescent inside a circle: one thing becoming another.
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polygon points="11,1 20,6 20,16 11,21 2,16 2,6" {...s} />
          <Path d="M 14 6.5 A 5.5 5.5 0 1 0 14 15.5 A 4.2 4.2 0 1 1 14 6.5" fill={color} stroke="none" />
        </Svg>
      );
    case 'class':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polygon points="11,1 20,5 20,12 11,21 2,12 2,5" {...s} />
          <Line x1={11} y1={6} x2={11} y2={14} {...s} />
        </Svg>
      );
    case 'subclass':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polygon points="11,1 20,5 20,12 11,21 2,12 2,5" {...s} />
          <Polygon points="11,6 15.5,8.5 15.5,11.5 11,16 6.5,11.5 6.5,8.5" fill={color} stroke="none" />
        </Svg>
      );
    case 'ancestry':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Line x1={11} y1={21} x2={11} y2={8} {...s} />
          <Path d="M 11 8 Q 5 8 4 2 Q 11 2 11 8 Q 11 2 18 2 Q 17 8 11 8" {...s} />
        </Svg>
      );
    case 'community':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polyline points="2,20 2,9 8,4 14,9 14,20" {...s} />
          <Polyline points="14,12 20,12 20,20" {...s} />
        </Svg>
      );
    case 'domains':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Rect x={3} y={4} width={10} height={14} {...s} />
          <Rect x={9} y={2} width={10} height={14} transform="rotate(8 14 9)" {...s} />
        </Svg>
      );
    case 'traits':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polygon points="11,2 16,7 16,12 11,20 6,12 6,7" {...s} />
          <Line x1={8.5} y1={10} x2={13.5} y2={10} {...s} />
          <Line x1={11} y1={7.5} x2={11} y2={12.5} {...s} />
        </Svg>
      );
    case 'experiences':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          {/* quill */}
          <Path d="M 4 18 Q 6 10 18 3 Q 14 12 8 16 Z" {...s} />
          <Line x1={4} y1={18} x2={9} y2={13} {...s} />
        </Svg>
      );
    case 'weapons':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          {/* sword */}
          <Line x1={11} y1={2} x2={11} y2={14} {...s} />
          <Line x1={7.5} y1={14} x2={14.5} y2={14} {...s} />
          <Line x1={11} y1={14} x2={11} y2={20} {...s} />
        </Svg>
      );
    case 'armor':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="M 11 2 L 19 5 V 11 Q 19 17 11 20 Q 3 17 3 11 V 5 Z" {...s} />
        </Svg>
      );
    case 'inventory':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="M 4 8 H 18 L 17 19 H 5 Z" {...s} />
          <Path d="M 8 8 V 5 a 3 3 0 0 1 6 0 v 3" {...s} />
        </Svg>
      );
  }
}
