/**
 * NFC tap-to-share (v0.10.1, Android only) — the "touch your phones together" path for `.rkp` content.
 *
 * Modern Android removed Android Beam (peer-to-peer NDEF push) in Android 10, so phone-to-phone NFC
 * works via Host Card Emulation: the SENDER emulates an NFC Type-4 NDEF tag (react-native-hce) whose
 * payload is a serialized `.rkp`; the RECEIVER reads it as an ordinary NDEF tag (react-native-nfc-
 * manager). Both are native modules absent from Expo Go, so everything is lazy-required behind a
 * Platform + try/catch — in Expo Go (or iOS) `nfcModulesPresent()` is false and the UI hides NFC.
 *
 * Type-4 NDEF caps the payload at 64KB (2-byte NLEN); a single card or a modest expansion fits, a
 * huge expansion may not — callers warn past SAFE_NFC_BYTES and fall back to `.rkp` file sharing.
 */
import { Platform } from 'react-native';

import { parseRkp, type RkpContent, serializeRkp } from './rkp';

export const SAFE_NFC_BYTES = 60000; // headroom under the ~64KB Type-4 NDEF ceiling

// eslint-disable-next-line @typescript-eslint/no-require-imports
const hce = () => require('react-native-hce');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nfc = () => require('react-native-nfc-manager');

/** Whether the NFC native modules are present (false in Expo Go / iOS — the APK has them). */
export function nfcModulesPresent(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    hce();
    nfc();
    return true;
  } catch {
    return false;
  }
}

export type NfcSendHandle = { stop: () => Promise<void> };

/**
 * Start emulating an NFC tag carrying `content`. Resolves once the tag is broadcasting; `onRead`
 * fires when another phone reads it. Always call the returned `stop()` to take the tag down.
 */
export async function startNfcSend(content: RkpContent, onRead: () => void): Promise<NfcSendHandle> {
  const { HCESession, NFCTagType4, NFCTagType4NDEFContentType } = hce();
  const text = serializeRkp(content);
  const tag = new NFCTagType4({ type: NFCTagType4NDEFContentType.Text, content: text, writable: false });
  const session = await HCESession.getInstance();
  await session.setApplication(tag);
  await session.setEnabled(true);
  const cancel = session.on(HCESession.Events.HCE_STATE_READ, onRead);
  return {
    stop: async () => {
      try {
        cancel?.();
      } catch {
        /* listener already gone */
      }
      try {
        await session.setEnabled(false);
      } catch {
        /* session already down */
      }
    },
  };
}

/** Bytes the serialized content will occupy on the tag (to warn before it won't fit). */
export function nfcPayloadBytes(content: RkpContent): number {
  return serializeRkp(content).length;
}

/**
 * Read one NDEF tag and parse it as `.rkp`. Resolves with the content, rejects on cancel/timeout/bad
 * data. The caller shows a "hold the phones together" prompt; `cancelNfcReceive()` aborts the wait.
 */
export async function receiveNfc(): Promise<RkpContent> {
  const mod = nfc();
  const NfcManager = mod.default;
  const { NfcTech, Ndef } = mod;
  await NfcManager.start();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    const record = tag?.ndefMessage?.[0];
    if (!record?.payload) throw new Error('That tap had no RuneKeep data on it.');
    const text: string = Ndef.text.decodePayload(Uint8Array.from(record.payload));
    return parseRkp(text);
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      /* nothing pending */
    }
  }
}

/** Abort an in-flight receive (the read promise rejects). */
export async function cancelNfcReceive(): Promise<void> {
  try {
    await nfc().default.cancelTechnologyRequest();
  } catch {
    /* nothing pending */
  }
}
