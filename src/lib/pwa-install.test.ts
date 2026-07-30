import { installMode, type InstallFacts } from './pwa-install';

const facts = (over: Partial<InstallFacts> = {}): InstallFacts => ({
  web: true,
  standalone: false,
  mobile: true,
  ios: false,
  deferred: false,
  ...over,
});

describe('installMode', () => {
  it('offers the real dialog when the browser handed us one', () => {
    expect(installMode(facts({ deferred: true }))).toBe('prompt');
  });

  it('tells an iPhone where the button is, since Safari has no dialog', () => {
    expect(installMode(facts({ ios: true }))).toBe('ios');
  });

  it('points at the browser menu on a mobile browser that offers no dialog', () => {
    expect(installMode(facts())).toBe('manual');
  });

  it('says nothing once the app is already installed', () => {
    expect(installMode(facts({ standalone: true, deferred: true }))).toBe('none');
    expect(installMode(facts({ standalone: true, ios: true }))).toBe('none');
  });

  it('says nothing on a desktop, where the browser chrome is not in the way', () => {
    expect(installMode(facts({ mobile: false, deferred: true }))).toBe('none');
  });

  it('says nothing on native, which is already an app', () => {
    expect(installMode(facts({ web: false }))).toBe('none');
  });
});
