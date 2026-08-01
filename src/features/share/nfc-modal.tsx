/**
 * SHARING a card, a stack of cards, or an expansion (v0.10.1, rebuilt v0.30.0).
 *
 * `NfcSendModal` is the one send surface. It has always emulated an NFC tag carrying the payload; it
 * now also EXPORTS the same payload as a `.rune` file, which is what makes sharing work at all in a
 * browser (no browser has the NFC card-emulation API, and none is coming).
 *
 * The two platforms get different shapes of the same panel, because they have different jobs:
 *  - Where NFC exists, tapping phones is the fast path and the file is the fallback for a payload too
 *    big for a tag, so the tag animation leads and Export sits under it.
 *  - Where it does not, there is no fallback, there is only the file. So the panel says plainly that
 *    NFC is not available and puts the export button in the middle, where the important control goes.
 *
 * `NfcReceiveModal` reads one tag and hands back the parsed content (unchanged, Android only).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { Body, Display, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import {
  cancelNfcReceive,
  type NfcSendHandle,
  nfcModulesPresent,
  nfcPayloadBytes,
  receiveNfc,
  SAFE_NFC_BYTES,
  startNfcSend,
} from '@/lib/nfc';
import { exportRkp } from '@/lib/library-store';
import type { RkpContent } from '@/lib/rkp';
import { DimScreen } from '@/lib/screen-dim';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9500, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} />
      <DimScreen opacity={0.92} />
      <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, paddingHorizontal: 20, paddingVertical: 22, gap: 14, alignItems: 'center' }}>
        {children}
      </ChamferBox>
    </View>
  );
}

function NfcGlyph({ tint }: { tint: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 48 48">
      <Path d="M12 16c8-6 16-6 24 0M14 23c6-4 14-4 20 0M16 30c4-3 12-3 16 0" fill="none" stroke={tint} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** A file-export glyph: a page with an arrow leaving it. Used where the NFC waves would be a lie. */
function ExportGlyph({ tint }: { tint: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 48 48">
      <Path d="M27 6H13a3 3 0 0 0-3 3v30a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V17Z" fill="none" stroke={tint} strokeWidth={2.4} strokeLinejoin="round" />
      <Path d="M27 6v11h11" fill="none" stroke={tint} strokeWidth={2.4} strokeLinejoin="round" />
      <Path d="M24 33V21M19 26l5-5 5 5" fill="none" stroke={tint} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Write the payload out as a `.rune`. Shared by both shapes of the send panel. */
function useExport(content: RkpContent, label: string, onClose: () => void) {
  return useCallback(() => {
    playSfx('buttonTap');
    void (async () => {
      try {
        await exportRkp(content, label);
        // The browser downloads without further ceremony, so say something happened; the OS share
        // sheet on a phone is its own confirmation.
        if (Platform.OS === 'web') showToast('Saved as a .rune file', 'success');
        onClose();
      } catch {
        showToast('That could not be exported.', 'error');
      }
    })();
  }, [content, label, onClose]);
}

/**
 * SHARE, where there is no NFC radio to use: a browser, or a phone without the hardware.
 *
 * Export IS the interface here, so it is the centre of the panel rather than a fallback tucked under
 * something that cannot work. Saying why up front is the point: a player who was told to "tap phones"
 * and found no way to do it would reasonably assume the feature was broken.
 */
function ExportOnlyPanel({ content, label, onClose }: { content: RkpContent; label: string; onClose: () => void }) {
  const doExport = useExport(content, label, onClose);
  return (
    <Shell>
      <ExportGlyph tint={Rune.goldEdge} />
      <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>Share {label}</Text>
      <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19, textAlign: 'center' }}>
        Tapping phones together needs NFC, which is not available here. Save it as a file instead, then send it however you like. Anyone with RuneKeep can open it.
      </Text>
      <RuneButton label="Export as file" kind="primary" height={46} style={{ alignSelf: 'stretch' }} onPress={doExport} />
      <RuneButton label="Cancel" kind="ghost" height={40} style={{ alignSelf: 'stretch' }} onPress={onClose} />
    </Shell>
  );
}

/** Emulate a tag broadcasting `content`; closes shortly after the other phone reads it. Where there
 *  is no radio, this becomes the export panel instead. */
export function NfcSendModal({ content, label, onClose }: { content: RkpContent; label: string; onClose: () => void }) {
  if (!nfcModulesPresent()) return <ExportOnlyPanel content={content} label={label} onClose={onClose} />;
  return <NfcSendPanel content={content} label={label} onClose={onClose} />;
}

function NfcSendPanel({ content, label, onClose }: { content: RkpContent; label: string; onClose: () => void }) {
  const [state, setState] = useState<'starting' | 'ready' | 'sent' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<NfcSendHandle | null>(null);
  const bytes = nfcPayloadBytes(content);
  const tooBig = bytes > SAFE_NFC_BYTES;
  const doExport = useExport(content, label, onClose);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const h = await startNfcSend(content, () => {
          if (!live) return;
          playSfx('cardEnable');
          setState('sent');
          setTimeout(() => live && onClose(), 1400);
        });
        if (!live) {
          void h.stop();
          return;
        }
        handle.current = h;
        setState('ready');
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : 'NFC could not start.');
          setState('error');
        }
      }
    })();
    return () => {
      live = false;
      void handle.current?.stop();
    };
  }, [content, onClose]);

  return (
    <Shell>
      <NfcGlyph tint={state === 'sent' ? Rune.goldBright : state === 'error' ? Rune.red : Rune.goldEdge} />
      <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
        {state === 'sent' ? 'Shared!' : state === 'error' ? 'NFC error' : `Send ${label}`}
      </Text>
      <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19, textAlign: 'center' }}>
        {state === 'error'
          ? error
          : state === 'sent'
            ? 'The other device received it.'
            : 'Hold the other phone back-to-back with this one to receive it.'}
      </Text>
      {tooBig && state !== 'error' ? (
        <Text style={{ color: Rune.red, fontSize: 11, fontFamily: Body.bold, textAlign: 'center' }}>This is large ({Math.round(bytes / 1000)}KB) and may not fit over NFC. Export it as a file if the tap fails.</Text>
      ) : null}
      {/* v0.30.0: the same payload, out as a file. It is the way to share with someone who is not in
          the room, and the only thing that works once a payload is too big for a tag. */}
      {state === 'sent' ? null : <RuneButton label="Export as file" kind={tooBig ? 'primary' : 'ghost'} height={42} style={{ alignSelf: 'stretch' }} onPress={doExport} />}
      <RuneButton label={state === 'sent' ? 'Done' : 'Cancel'} kind={state === 'sent' ? 'primary' : 'ghost'} height={42} style={{ alignSelf: 'stretch' }} onPress={onClose} />
    </Shell>
  );
}

/** Read one tag and hand the parsed content to `onReceived`. */
export function NfcReceiveModal({ onReceived, onClose }: { onReceived: (content: RkpContent) => void; onClose: () => void }) {
  const [state, setState] = useState<'waiting' | 'error'>('waiting');
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    void cancelNfcReceive();
    onClose();
  }, [onClose]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const content = await receiveNfc();
        if (!live) return;
        playSfx('cardEnable');
        onReceived(content);
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : 'Could not read that tap.');
          setState('error');
        }
      }
    })();
    return () => {
      live = false;
      void cancelNfcReceive();
    };
  }, [onReceived]);

  return (
    <Shell>
      <NfcGlyph tint={state === 'error' ? Rune.red : Rune.goldEdge} />
      <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
        {state === 'error' ? 'NFC error' : 'Receive by NFC'}
      </Text>
      <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19, textAlign: 'center' }}>
        {state === 'error' ? error : 'Hold this phone back-to-back with the one sharing the card.'}
      </Text>
      <RuneButton label="Cancel" kind="ghost" height={42} style={{ alignSelf: 'stretch' }} onPress={close} />
    </Shell>
  );
}

/** A tap-catcher Pressable so taps behind the modal don't fall through (used by callers if needed). */
export function NfcScrim({ onPress }: { onPress: () => void }) {
  return <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9400 }} onPress={onPress} accessibilityRole="button" accessibilityLabel="Close" />;
}
