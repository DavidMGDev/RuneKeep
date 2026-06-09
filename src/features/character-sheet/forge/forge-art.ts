/** Gear-motif art for the Forge layout — the C/S gear SVGs rasterized to transparent PNGs. */
export const ForgeArt = {
  cog: require('../../../../assets/art/gears/raster/C1.png'), // solid cog — portrait frame
  dial: require('../../../../assets/art/gears/raster/C2.png'), // ornate ticked ring — stat dials
  cardinal: require('../../../../assets/art/gears/raster/C3.png'),
  innerCap: require('../../../../assets/art/gears/raster/C4.png'),
  innerSimple: require('../../../../assets/art/gears/raster/S1.png'),
  outerSimple: require('../../../../assets/art/gears/raster/S2.png'),
  // The U-parts (also used by the bottom gear) make a good faint backdrop watermark.
  watermark: require('../../../../assets/art/gears/raster/U1.png'),
} as const;
