import { isFilePayload, pushIncomingUrl, resetIncomingUrl, subscribeIncomingUrl, takeIncomingUrl, isLaunchFile } from './incoming-url';

/**
 * These shapes are the whole bug. v0.23.0 shipped a filter that only accepted URLs ending in `.rkp`,
 * which every sender that matters fails to produce, so the one case the file association existed to
 * serve was silently dropped. Each `content://` case below is a real launch URL.
 */
describe('isFilePayload', () => {
  it('accepts the provider URI WhatsApp actually sends', () => {
    // Verbatim from the owner's screenshot. No filename, no extension, nothing to pattern-match.
    expect(isFilePayload('content://com.whatsapp.provider.media/item/8a832779-5612-4208-907e-181224b74a5a')).toBe(true);
  });

  it('accepts other providers with opaque ids', () => {
    expect(isFilePayload('content://com.android.providers.downloads.documents/document/msf%3A1000000042')).toBe(true);
    expect(isFilePayload('content://media/external/file/12345')).toBe(true);
  });

  it('accepts file URIs that name a .rune, and the .rkp files sent before the rename', () => {
    expect(isFilePayload('file:///storage/emulated/0/Download/Aeliana.rune')).toBe(true);
    expect(isFilePayload('file:///storage/emulated/0/Download/Aeliana.RUNE')).toBe(true);
    expect(isFilePayload('file:///storage/emulated/0/Download/Aeliana.rkp')).toBe(true);
    expect(isFilePayload('file:///data/user/0/com.davidmgdev.runekeep/cache/x.rkp?v=2')).toBe(true);
  });

  it('rejects file URIs that are some other download', () => {
    expect(isFilePayload('file:///storage/emulated/0/Download/holiday.jpg')).toBe(false);
  });

  it('rejects the app own deep links, which are routes', () => {
    expect(isFilePayload('runekeep://sheet?id=abc')).toBe(false);
    expect(isFilePayload('runekeep://')).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isFilePayload(null)).toBe(false);
    expect(isFilePayload(undefined)).toBe(false);
    expect(isFilePayload('')).toBe(false);
  });
});

describe('the launch handoff', () => {
  beforeEach(resetIncomingUrl);

  it('holds a URL captured before React mounted, and yields it once', () => {
    pushIncomingUrl('content://x/1');
    expect(takeIncomingUrl()).toBe('content://x/1');
    expect(takeIncomingUrl()).toBeNull();
  });

  it('notifies a mounted gate for a warm launch', () => {
    const seen: string[] = [];
    const off = subscribeIncomingUrl((u) => seen.push(u));
    pushIncomingUrl('content://x/2');
    off();
    pushIncomingUrl('content://x/3');
    expect(seen).toEqual(['content://x/2']);
  });
});

describe('isFilePayload · picked photos are not shares (v0.33.0)', () => {
  it('rejects the shapes Android image pickers return', () => {
    for (const u of [
      'content://media/external/images/media/1000012345',
      'content://com.android.providers.media.documents/document/image%3A48291',
      'content://media/picker/0/com.android.providers.media.photopicker/media/1000000034',
      'content://media/external/video/media/771',
    ]) {
      expect(isFilePayload(u)).toBe(false);
    }
  });

  it('still accepts the shapes real shares return', () => {
    for (const u of [
      'content://com.whatsapp.provider.media/item/8a83f1c2',
      'content://media/external/downloads/9912',
      'content://com.google.android.apps.docs.storage/document/acc%3D1%3Bdoc%3D77',
      'content://com.android.externalstorage.documents/document/primary%3ADownload%2FJohn.rune',
    ]) {
      expect(isFilePayload(u)).toBe(true);
    }
  });
});

describe('a file handed over by a LAUNCH INTENT (v0.36.1)', () => {
  it('takes any provider URI, because the intent filter already chose it', () => {
    // Quick Share, CX File Explorer, WhatsApp: every one of these is a share the user asked for.
    for (const u of [
      'content://com.cxinventor.file.explorer.fileprovider/external_files/Download/auren.rune',
      'content://com.samsung.android.app.sharelive.provider/shared/17',
      'content://media/external/downloads/1000000123',
      'content://com.whatsapp.provider.media/item/8a83',
    ]) expect(isLaunchFile(u)).toBe(true);
  });

  it('does NOT apply the media guard, which exists for the app’s own image picker', () => {
    // The picker cannot hand anything back through a launch intent, so refusing this here is how a
    // Quick Share ended up opening the app and doing nothing at all.
    expect(isLaunchFile('content://media/external/images/media/42')).toBe(true);
    expect(isFilePayload('content://media/external/images/media/42')).toBe(false);
  });

  it('takes a file URI whatever it is called, since Android matched it for us', () => {
    expect(isLaunchFile('file:///storage/emulated/0/Download/auren.rune')).toBe(true);
    expect(isLaunchFile('file:///storage/emulated/0/Download/auren')).toBe(true);
  });

  it('still leaves the app’s own deep links alone', () => {
    expect(isLaunchFile('runekeep://sheet?id=ch-1')).toBe(false);
    expect(isLaunchFile('/sheet?id=ch-1')).toBe(false);
    expect(isLaunchFile(null)).toBe(false);
  });
});
