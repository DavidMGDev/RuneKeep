import { ScrollViewStyleReset } from 'expo-router/html';
import { type ReactNode } from 'react';

/**
 * The web build's HTML shell (v0.24.3). Web only: this file is never bundled into the native app.
 *
 * It exists because a browser brings default behaviours a phone does not, and three of them made the
 * web build feel broken rather than merely different:
 *
 * 1. **Images are draggable.** Every `<Image>` becomes an `<img>`, and an `<img>` in a browser starts
 *    an HTML5 drag on mousedown. Since RuneKeep is made of card art, dragging a card handed you a
 *    translucent ghost of the PNG instead of scrolling the list or moving the card. `user-drag: none`
 *    turns every drag back into an ordinary gesture the app's own handlers see.
 * 2. **Text selects.** Dragging across a card selected its title and body, which fought the carousel.
 *    Selection is disabled everywhere and re-enabled for inputs, where it is the point.
 * 3. **The page itself scrolls and bounces.** `overscroll-behavior: none` stops pull-to-refresh and
 *    the rubber band, so a scroll that reaches the end of a list stops there instead of moving the
 *    whole app.
 *
 * `ScrollViewStyleReset` is Expo's own fix for `ScrollView` on web and must stay.
 */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        {/* Installable from Chrome and Edge: its own window, its own icon, no browser chrome. */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0B0E13" />
        <meta name="description" content="A Daggerheart companion app. Your character, as cards." />
        <title>RuneKeep</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: WEB_RESET }} />
        <script dangerouslySetInnerHTML={{ __html: MOUSE_SCROLL }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const WEB_RESET = `
html, body, #root {
  height: 100%;
  background-color: #0B0E13;
  overscroll-behavior: none;
}
body {
  margin: 0;
  -webkit-tap-highlight-color: transparent;
}
/* No image is ever a drag source: a drag on card art belongs to the app, not to the browser. */
img, svg, canvas, video {
  -webkit-user-drag: none;
  -khtml-user-drag: none;
  -moz-user-drag: none;
  user-drag: none;
  -webkit-touch-callout: none;
}
/* No accidental selection while swiping a card, but keep it where typing happens. */
* {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
input, textarea, [contenteditable="true"] {
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}
/* Focus rings are drawn by the app's own art, and the browser's outline cuts across the chamfers. */
:focus, :focus-visible {
  outline: none;
}
`;

/**
 * Drag to scroll, with a mouse (v0.24.3).
 *
 * A `ScrollView` on web is a div with `overflow: auto`. A browser scrolls one of those with the wheel
 * or a scrollbar, never with a press-and-drag, because that gesture belongs to text selection and
 * image dragging on the web. So every list in RuneKeep looked frozen on a desktop: the card-category
 * strip and the creation tab strip are horizontal, their scrollbars are hidden by design, and a
 * vertical wheel does not move them at all. The app felt broken rather than merely mouse-driven.
 *
 * This restores the phone gesture for a mouse. Two rules keep it out of the app's way:
 *
 * - **Gestures win.** react-native-gesture-handler marks its own targets `touch-action: none`. If one
 *   of those sits between the pointer and the scroll container, the drag belongs to the carousel (or
 *   a card, or the float menu) and this does nothing.
 * - **Axis must match.** The axis is chosen from the first few pixels of movement and must be one the
 *   container can actually scroll, so a sideways flick never nudges the page up and down.
 *
 * A drag that scrolled also swallows the click that follows it, or letting go would open whatever
 * card the pointer happened to land on. Touch input is untouched: it already worked.
 *
 * Plain DOM, in the HTML shell, so it applies to every scroller at once and cannot reach native.
 */
const MOUSE_SCROLL = `
(function () {
  var START = 5;
  var down = null, box = null, axis = '', dragged = false;

  function scroller(target, wantX) {
    for (var n = target; n && n !== document.body; n = n.parentElement) {
      // A gesture handler owns this pointer: leave it alone.
      if (getComputedStyle(n).touchAction === 'none') return null;
      var s = getComputedStyle(n);
      var flow = wantX ? s.overflowX : s.overflowY;
      if (flow !== 'auto' && flow !== 'scroll') continue;
      var room = wantX ? n.scrollWidth - n.clientWidth : n.scrollHeight - n.clientHeight;
      if (room > 2) return n;
    }
    return null;
  }

  function typing(el) {
    var t = el && el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || (el && el.isContentEditable);
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || typing(e.target)) return;
    down = { x: e.clientX, y: e.clientY, target: e.target };
    box = null; axis = ''; dragged = false;
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!box) {
      if (Math.abs(dx) < START && Math.abs(dy) < START) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      box = scroller(down.target, axis === 'x');
      if (!box) { down = null; return; }
    }
    if (axis === 'x') box.scrollLeft -= e.clientX - down.x;
    else box.scrollTop -= e.clientY - down.y;
    down.x = e.clientX; down.y = e.clientY;
    dragged = true;
    e.preventDefault();
  }, true);

  function end() { down = null; box = null; }
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  // A drag is not a tap: don't also press whatever is under the pointer when it stops.
  document.addEventListener('click', function (e) {
    if (!dragged) return;
    dragged = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // A wheel over a strip that only scrolls sideways should move it sideways. Without this a mouse
  // with no horizontal wheel cannot reach the end of the category strip at all.
  document.addEventListener('wheel', function (e) {
    if (!e.deltaY || e.shiftKey) return;
    var sideways = scroller(e.target, true);
    if (!sideways) return;
    var upright = scroller(e.target, false);
    if (upright) return;
    sideways.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { capture: true, passive: false });
})();
`;
