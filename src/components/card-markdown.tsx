import { Fragment } from 'react';
import { Text, type TextStyle, View } from 'react-native';

import { Body } from '@/constants/theme';
import { hasMarkdown, type MdSpan, parseCardMarkdown } from '@/lib/card-markdown';

/**
 * Renders a custom-card description with minimal markdown (#264 item 6). Two paths:
 *  - no markdown  → the plain autosizing <Text> exactly as before (zero regression).
 *  - inline only  → one autosizing <Text> with nested bold/italic spans (keeps adjustsFontSizeToFit).
 *  - has lists    → a <View> of paragraphs + bullet/numbered rows (block layout, no autosize — lists
 *                   are opt-in and the card body area is fixed).
 */
function spanNodes(spans: MdSpan[]) {
  return spans.map((s, i) => {
    const style: TextStyle = {};
    if (s.bold) style.fontFamily = Body.bold;
    if (s.italic) style.fontStyle = 'italic';
    if (s.strike) { style.textDecorationLine = 'line-through'; style.opacity = 0.5; } // mixed-ancestry cross-out
    return (
      <Text allowFontScaling={false} key={i} style={s.bold || s.italic || s.strike ? style : undefined}>
        {s.text}
      </Text>
    );
  });
}

export function CardMarkdownBody({
  body,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: {
  body: string;
  style: TextStyle;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}) {
  if (!hasMarkdown(body)) {
    return (
      <Text allowFontScaling={false} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit} minimumFontScale={minimumFontScale} style={style}>
        {body}
      </Text>
    );
  }
  const blocks = parseCardMarkdown(body);
  const hasList = blocks.some((b) => b.kind !== 'p');

  if (!hasList) {
    return (
      <Text allowFontScaling={false} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit} minimumFontScale={minimumFontScale} style={style}>
        {blocks.map((b, i) => (
          <Fragment key={i}>
            {/* v0.13.0 typeset: the blank line between sections rides a tiny-lineHeight span, so the
                paragraph gap is ~a half line (like the printed cards), not a full empty line. */}
            {i > 0 ? <Text style={{ fontSize: 6, lineHeight: 6 }}>{'\n\n'}</Text> : null}
            {spanNodes((b as { spans: MdSpan[] }).spans)}
          </Fragment>
        ))}
      </Text>
    );
  }

  // Block layout: strip the per-text vertical margin onto the container; list rows align left.
  const { marginTop, alignSelf, flexShrink, ...textStyle } = style;
  const rowText: TextStyle = { ...textStyle, marginTop: 0 };
  const listText: TextStyle = { ...rowText, textAlign: 'left', flexShrink: 1 };
  return (
    <View style={{ marginTop, alignSelf: alignSelf ?? 'stretch', flexShrink }}>
      {blocks.map((b, i) => {
        const gap = i > 0 ? 6 : 0; // v0.13.0 typeset: match the inline path's half-line section gap
        if (b.kind === 'p') {
          return (
            <Text allowFontScaling={false} key={i} style={[rowText, { marginTop: gap }]}>
              {spanNodes(b.spans)}
            </Text>
          );
        }
        const items = b.kind === 'ul' ? b.items.map((spans, j) => ({ marker: '•', spans, j })) : b.items.map((it, j) => ({ marker: `${it.n}.`, spans: it.spans, j }));
        return (
          <View key={i} style={{ marginTop: gap }}>
            {items.map(({ marker, spans, j }) => (
              <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text allowFontScaling={false} style={[rowText, { width: b.kind === 'ol' ? 14 : 9 }]}>{marker}</Text>
                <Text allowFontScaling={false} style={listText}>{spanNodes(spans)}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
