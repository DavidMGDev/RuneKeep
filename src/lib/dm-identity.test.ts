import { identityFace, identityInitial, identitySubtitle } from './dm-identity';

describe('identityInitial', () => {
  it('takes the first letter, uppercased', () => {
    expect(identityInitial('Shattered Crown')).toBe('S');
    expect(identityInitial('bridge')).toBe('B');
  });

  it('skips leading spaces', () => {
    expect(identityInitial('   thursday nights')).toBe('T');
  });

  it('still says something when there is no title', () => {
    expect(identityInitial('')).toBe('?');
    expect(identityInitial('   ')).toBe('?');
    expect(identityInitial(undefined)).toBe('?');
  });

  it('takes a digit or a symbol as readily as a letter', () => {
    expect(identityInitial('1st session')).toBe('1');
  });
});

describe('identityFace', () => {
  it('prefers a picture', () => {
    expect(identityFace({ name: 'Crown', color: '#123456', imageUri: 'file://x.png' })).toEqual({ kind: 'image', uri: 'file://x.png' });
  });

  it('falls back to the colour, and keeps the letter on it', () => {
    expect(identityFace({ name: 'Crown', color: '#123456' })).toEqual({ kind: 'color', color: '#123456', initial: 'C' });
  });

  it('falls back to the letter alone, which is what every migrated record gets', () => {
    expect(identityFace({ name: 'Crown' })).toEqual({ kind: 'initial', initial: 'C' });
  });
});

describe('identitySubtitle', () => {
  it('prefers the description', () => {
    expect(identitySubtitle({ name: 'Crown', description: 'Thursday nights' }, '4 members')).toBe('Thursday nights');
  });

  it('falls back when there is none, or only spaces', () => {
    expect(identitySubtitle({ name: 'Crown' }, '4 members')).toBe('4 members');
    expect(identitySubtitle({ name: 'Crown', description: '  ' }, '4 members')).toBe('4 members');
  });
});
