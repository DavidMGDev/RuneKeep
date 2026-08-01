import { installMode, type InstallFacts, isMobileLike } from './pwa-install';

// Real strings, taken from the devices that matter. The tablet one is the whole point: Chrome asks
// for desktop sites on a large screen, so nothing in it says Android.
const UA = {
  phone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
  tabDesktopMode: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
};

describe('who gets offered the install', () => {
  it('offers an Android tablet that claims to be a desktop', () => {
    // v0.29.1 said nothing here, on the device with the most browser chrome to lose.
    expect(isMobileLike(UA.tabDesktopMode, 5, true)).toBe(true);
  });

  it('still offers the obvious phones', () => {
    expect(isMobileLike(UA.phone, 5, true)).toBe(true);
    expect(isMobileLike(UA.iphone, 5, true)).toBe(true);
    expect(isMobileLike(UA.ipad, 5, true)).toBe(true);
  });

  it('stays quiet on a desktop, touchscreen or not', () => {
    expect(isMobileLike(UA.desktop, 0, false)).toBe(false);
    // A touchscreen laptop: it can touch, but the trackpad is the primary pointer, so it reports fine.
    expect(isMobileLike(UA.desktop, 10, false)).toBe(false);
  });
});

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
