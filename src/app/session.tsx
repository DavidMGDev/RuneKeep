import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { DmScreen } from '@/features/dm/desk/dm-screen';
import { SessionScreen } from '@/features/dm/session-screen';
import { isDesktopWindow } from '@/hooks/use-desktop';

/** A session: the DM screen on a desktop window (v0.49.0), its list of encounters everywhere else. */
export default function Session() {
  const { id, encounter } = useLocalSearchParams<{ id: string; encounter?: string }>();
  const { width, height } = useWindowDimensions();
  // Read off the window and not the frame: the frame stops being a table while another screen is over this one, and
  // the DM screen must still be here, as it was, on the way back.
  return isDesktopWindow(width, height) ? <DmScreen key={id} sessionId={id} encounterId={encounter} /> : <SessionScreen />;
}
