/**
 * A stylesheet, as far as Jest is concerned (v0.43.0).
 *
 * `src/constants/theme.ts` imports the app's global CSS for the web build, which puts a `.css` file
 * in the require graph of anything that touches the palette. Jest has no transformer for one, so a
 * pure module was untestable purely because something three imports down knew what colour gold is.
 */
module.exports = {};
