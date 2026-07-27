import { Text, type TextProps } from 'react-native';

/**
 * One line, always (#104): never wraps, never mid-word clips — the text SHRINKS to fit its box
 * instead. Native auto-shrink (`adjustsFontSizeToFit`) is a no-op on react-native-web, which is
 * fine here: the web pipeline only verifies composition; devices are what shrink.
 * Use for any variable-length single-line text (names, menu actions, card titles).
 */
export function FitLine({ minScale = 0.85, style, children, ...rest }: TextProps & { minScale?: number }) {
  return (
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={minScale} style={style} {...rest}>
      {children}
    </Text>
  );
}
