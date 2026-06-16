/**
 * Minimal markdown for custom-card DESCRIPTIONS (#264 item 6). Cards have a tiny fixed text area, so a
 * full markdown library is overkill and fights the card's autosizing layout — we parse only what the
 * owner asked for: **bold**, *italic* (and `__`/`_`), bullet lists (`-`/`*`) and numbered lists. Titles
 * are never markdown. Pure + synchronous so it's cheap to call per render and unit-testable.
 *
 * ponytail: hand-rolled, not a dependency. Ceiling = no links/headings/code/nested lists; if a card
 * ever needs those, swap in `react-native-markdown-display`.
 */

export interface MdSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}
export type MdBlock =
  | { kind: 'p'; spans: MdSpan[] }
  | { kind: 'ul'; items: MdSpan[][] }
  | { kind: 'ol'; items: { n: number; spans: MdSpan[] }[] };

// A bullet/ordered marker must be followed by whitespace, so `*italic*` / `**bold**` (no space) at the
// start of a line are NOT mistaken for list markers.
const BULLET = /^[ \t]*[-*][ \t]+(.*)$/;
const ORDERED = /^[ \t]*(\d+)\.[ \t]+(.*)$/;

/** Inline pass: toggle bold on `**`/`__` and italic on `*`/`_`. Unbalanced markers degrade to plain. */
export function parseInline(src: string): MdSpan[] {
  const spans: MdSpan[] = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const flush = () => {
    if (buf) {
      spans.push({ text: buf, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) });
      buf = '';
    }
  };
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '**' || two === '__') {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    const c = src[i];
    if (c === '*' || c === '_') {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  flush();
  return spans.length ? spans : [{ text: '' }];
}

/** Block pass: group lines into paragraphs / bullet lists / numbered lists, then inline-parse each. */
export function parseCardMarkdown(src: string): MdBlock[] {
  const lines = (src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let ul: string[] = [];
  let ol: { n: number; text: string }[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'p', spans: parseInline(para.join(' ')) });
      para = [];
    }
  };
  const flushUl = () => {
    if (ul.length) {
      blocks.push({ kind: 'ul', items: ul.map(parseInline) });
      ul = [];
    }
  };
  const flushOl = () => {
    if (ol.length) {
      blocks.push({ kind: 'ol', items: ol.map((o) => ({ n: o.n, spans: parseInline(o.text) })) });
      ol = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushUl();
    flushOl();
  };
  for (const line of lines) {
    if (line.trim() === '') {
      flushAll();
      continue;
    }
    const b = BULLET.exec(line);
    const o = ORDERED.exec(line);
    if (b) {
      flushPara();
      flushOl();
      ul.push(b[1]);
    } else if (o) {
      flushPara();
      flushUl();
      ol.push({ n: parseInt(o[1], 10), text: o[2] });
    } else {
      flushUl();
      flushOl();
      para.push(line.trim());
    }
  }
  flushAll();
  return blocks;
}

/** Cheap gate: does this text contain any markdown we render? If not, callers use the plain (autosizing)
 *  text path unchanged (#264 story 28: plain descriptions look exactly as before). */
export function hasMarkdown(src: string | null | undefined): boolean {
  if (!src) return false;
  return /\*\*[\s\S]*?\*\*|__[\s\S]*?__|[*_][^*_\n]+[*_]|(^|\n)[ \t]*[-*][ \t]+\S|(^|\n)[ \t]*\d+\.[ \t]+\S/.test(src);
}
