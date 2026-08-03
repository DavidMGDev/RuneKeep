import { isNewerVersion, parseVersion } from './update-check';

describe('version comparison (v0.32.0)', () => {
  it('reads a tag with or without its v', () => {
    expect(parseVersion('v0.31.2')).toEqual([0, 31, 2]);
    expect(parseVersion('0.31.2')).toEqual([0, 31, 2]);
    expect(parseVersion('RuneKeep v1.2.3 (Android)')).toEqual([1, 2, 3]);
  });

  it('compares segment by segment, not as text', () => {
    expect(isNewerVersion('v0.32.0', '0.31.9')).toBe(true);
    expect(isNewerVersion('v0.9.0', '0.10.0')).toBe(false); // 9 < 10, though "9" > "1" as text
    expect(isNewerVersion('v1.0.0', '0.99.99')).toBe(true);
  });

  it('does not offer an update to the version you already have', () => {
    expect(isNewerVersion('v0.32.0', '0.32.0')).toBe(false);
    expect(isNewerVersion('v0.32', '0.32.0')).toBe(false); // a missing segment is a zero, not older
    expect(isNewerVersion('v0.32.0', '0.32')).toBe(false);
  });

  it('never offers an update it cannot understand', () => {
    expect(isNewerVersion(undefined, '0.31.0')).toBe(false);
    expect(isNewerVersion('nightly', '0.31.0')).toBe(false);
    expect(isNewerVersion('', '0.31.0')).toBe(false);
  });

  it('treats an unknown CURRENT version as ancient, so the offer still appears', () => {
    expect(isNewerVersion('v0.32.0', undefined)).toBe(true);
  });
});
