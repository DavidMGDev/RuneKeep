/**
 * SVG -> React component config, read by react-native-svg-transformer (v0.24.3).
 *
 * WHY THIS FILE EXISTS: SVGO's `cleanupIds` renames every gradient / mask / clipPath id to a short
 * letter (`a`, `b`, `c`) that is unique only WITHIN one file. On native that is harmless, because
 * react-native-svg gives each `<Svg>` its own canvas and resolves `url(#a)` locally. On WEB every
 * `<Svg>` becomes an inline `<svg>` in the one document, so `url(#a)` resolves to the FIRST `#a` in
 * the page: all nine class banners painted with whichever class happened to render first (the
 * magenta one), and the circle-control gears shared a gradient the same way. Same bundle, same
 * component, totally different picture.
 *
 * `prefixIds` prefixes every id with the asset's own path, so the ids are unique across the whole
 * document and each banner references its own gradient again.
 *
 * The rest of this config is react-native-svg-transformer's own default, repeated verbatim because
 * a resolved config REPLACES `svgoConfig` rather than merging into it (see its index.js). If that
 * package's defaults change, mirror them here.
 */
module.exports = {
  native: true,
  plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx'],
  svgoConfig: {
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            inlineStyles: { onlyMatchedOnce: false },
            removeViewBox: false,
            removeUnknownsAndDefaults: false,
            convertColors: false,
          },
        },
      },
      {
        name: 'prefixIds',
        params: {
          delim: '_',
          // Path-derived, not filename-derived: assets/art/classBanners/image.svg and
          // assets/art/new/image.svg share a basename and would otherwise collide again.
          prefix: (_node, info) =>
            `rk_${String(info?.path ?? 'x')
              .replace(/^.*[\\/]assets[\\/]/, '')
              .replace(/[^a-zA-Z0-9]+/g, '_')}`,
        },
      },
    ],
  },
};
