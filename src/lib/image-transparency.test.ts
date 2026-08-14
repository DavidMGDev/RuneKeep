import { canLayerColor, colorReplacesImage, showColorName } from './image-transparency';

describe('canLayerColor', () => {
  it('accepts the formats that carry an alpha channel', () => {
    expect(canLayerColor('file:///x/banner.png')).toBe(true);
    expect(canLayerColor('file:///x/banner.WEBP')).toBe(true);
  });

  it('refuses a format that cannot be transparent', () => {
    expect(canLayerColor('file:///x/photo.jpg')).toBe(false);
    expect(canLayerColor('file:///x/photo.jpeg')).toBe(false);
  });

  it('reads a data URI by its own declared type, which is how the browser hands one over', () => {
    expect(canLayerColor('data:image/png;base64,AAAA')).toBe(true);
    expect(canLayerColor('data:image/jpeg;base64,AAAA')).toBe(false);
  });

  it('ignores a query string or a fragment, which a cached URL carries', () => {
    expect(canLayerColor('https://x/y/banner.png?v=3')).toBe(true);
    expect(canLayerColor('https://x/y/photo.jpg#a')).toBe(false);
  });

  it('treats anything it cannot tell as OPAQUE, which is the old behaviour', () => {
    expect(canLayerColor('file:///x/mystery')).toBe(false);
    expect(canLayerColor(null)).toBe(false);
    expect(canLayerColor(undefined)).toBe(false);
  });
});

describe('colorReplacesImage', () => {
  it('is true only for a picture a colour would be hidden behind', () => {
    expect(colorReplacesImage('a.jpg')).toBe(true);
    expect(colorReplacesImage('a.png')).toBe(false);
  });

  it('is false when there is no picture at all, so a fresh card never confirms', () => {
    expect(colorReplacesImage(null)).toBe(false);
  });
});

describe('showColorName', () => {
  it('flashes the name on a bare card and never over a picture', () => {
    expect(showColorName(null)).toBe(true);
    expect(showColorName('a.png')).toBe(false);
    expect(showColorName('a.jpg')).toBe(false);
  });
});
